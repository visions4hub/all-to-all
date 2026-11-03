import { runProcessor } from "@/lib/engine/run";
import type { ProcessInput, ProcessOutput, Progress, RunResult, WorkspaceFile } from "@/lib/engine/types";
import { detectFileKind, type FileKind } from "@/lib/files/detect";
import { formatNumber } from "@/lib/files/format";
import type { Localized, ToolDefinition } from "@/lib/tools/types";
import type { ToolModule } from "@/tools/types";
import { canRunInChain, isModuleChainable } from "./chainable";
import { kindLabel, predictOutputKinds, type ChainKind } from "./kinds";

/** A step ready to run: its registry entry, its loaded module and its settings. */
export type ChainStep = {
  tool: ToolDefinition;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each step has its own settings type
  module: ToolModule<any>;
  settings: unknown;
};

// ---- Compatibility check (before running) --------------------------------------

export type ChainIssue = { step: number; level: "error" | "warning"; message: Localized };

const stepName = (i: number, tool: ToolDefinition): Localized => ({
  ar: `الخطوة ${i + 1} (${tool.name.ar})`,
  en: `Step ${i + 1} (${tool.name.en})`,
});

const kindsText = (kinds: ChainKind[]) => kinds.map(kindLabel).join(", ");

/**
 * Checks that each step can open what the step before it produces.
 * `inputKinds` are the kinds of the files the user added (null = no files yet:
 * step 1 is not checked against files). Uses the registry `accepts` / `outputs`
 * and the step's format setting, so tools added later are covered automatically.
 */
export function checkChain(steps: { tool: ToolDefinition; settings: unknown }[], inputKinds: FileKind[] | null): ChainIssue[] {
  const issues: ChainIssue[] = [];
  let incoming: ChainKind[] | null = inputKinds && inputKinds.length ? [...new Set(inputKinds)] : null;

  steps.forEach(({ tool, settings }, i) => {
    const name = stepName(i, tool);
    if (!canRunInChain(tool)) {
      issues.push({ step: i, level: "error", message: { ar: `${name.ar} لا يمكن ربطها في سير عمل.`, en: `${name.en} can't be used in a workflow.` } });
    }
    let usable: ChainKind[] | null = null;
    if (incoming) {
      const accepts = tool.accepts as ChainKind[];
      usable = incoming.filter((k) => accepts.includes(k));
      const rejected = incoming.filter((k) => !accepts.includes(k));
      const from = i === 0 ? { ar: "الملفات المضافة", en: "the added files" } : stepName(i - 1, steps[i - 1].tool);
      if (!usable.length) {
        issues.push({
          step: i,
          level: "error",
          message: {
            ar: `${name.ar} لا تقبل ملفات ${kindsText(incoming)} الناتجة من ${from.ar}. تقبل: ${kindsText(accepts)}.`,
            en: `${name.en} can't open the ${kindsText(incoming)} files from ${from.en}. It accepts: ${kindsText(accepts)}.`,
          },
        });
      } else if (rejected.length) {
        issues.push({
          step: i,
          level: "warning",
          message: {
            ar: `${name.ar} لا تقبل ملفات ${kindsText(rejected)}؛ سيتوقف التشغيل إن وصلها ملف منها.`,
            en: `${name.en} doesn't accept ${kindsText(rejected)} files; the run stops if one reaches it.`,
          },
        });
      }
    }
    incoming = predictOutputKinds(tool, settings, usable && usable.length ? usable : (tool.accepts as ChainKind[]));
  });
  return issues;
}

// ---- Running ---------------------------------------------------------------------

export type StepStatus = "pending" | "running" | "done" | "error" | "cancelled" | "skipped";

export type StepState = {
  status: StepStatus;
  progress?: Progress;
  inputCount?: number;
  outputCount?: number;
};

export type ChainRunResult = {
  status: "done" | "error" | "cancelled";
  steps: StepState[];
  /** Index of the step that stopped the chain (error or cancel). */
  stoppedAt: number | null;
  error: Localized | null;
  /** Final outputs, with sourceIds pointing at the files the user added. */
  result: RunResult;
};

export type RunChainOptions = {
  signal: AbortSignal;
  onUpdate?: (steps: StepState[]) => void;
  /** Detects a produced file's real kind (magic bytes by default). */
  detectKind?: (file: File) => Promise<FileKind>;
};

const MEMORY = {
  ar: "نفدت ذاكرة المتصفح. جرّب ملفات أقل أو أصغر في المرة الواحدة.",
  en: "The browser ran out of memory. Try fewer or smaller files at once.",
};

function asWorkspaceFiles(inputs: ProcessInput[]): WorkspaceFile[] {
  return inputs.map((f) => ({ ...f, size: f.file.size }));
}

/**
 * Runs the steps one after another, in memory: each step's output blobs become
 * the next step's input files (no download, no re-adding). The first problem —
 * incompatible file, too few/many files, invalid settings, a failed file,
 * no output — stops the chain with a message naming the step. Cancelling
 * stops the current step and skips the rest.
 */
export async function runChain(steps: ChainStep[], inputs: ProcessInput[], opts: RunChainOptions): Promise<ChainRunResult> {
  const detect = opts.detectKind ?? detectFileKind;
  const states: StepState[] = steps.map(() => ({ status: "pending" }));
  const emit = () => opts.onUpdate?.(states.map((s) => ({ ...s })));
  /** Intermediate file id → ids of the user's files it came from. */
  const lineage = new Map<string, string[]>(inputs.map((f) => [f.id, [f.id]]));
  const origins = (ids: string[]) => [...new Set(ids.flatMap((id) => lineage.get(id) ?? [id]))];

  let current = inputs;
  let last: RunResult = { items: [], outputs: [], cancelled: false };

  const stop = (i: number, status: "error" | "cancelled", error: Localized | null): ChainRunResult => {
    states[i] = { ...states[i], status };
    for (let j = i + 1; j < states.length; j++) states[j] = { status: "skipped" };
    emit();
    return { status, steps: states, stoppedAt: i, error, result: { items: [], outputs: [], cancelled: status === "cancelled" } };
  };

  for (let i = 0; i < steps.length; i++) {
    const { tool, module, settings } = steps[i];
    const name = stepName(i, tool);
    const fail = (ar: string, en: string) => stop(i, "error", { ar: `${name.ar}: ${ar}`, en: `${name.en}: ${en}` });

    if (opts.signal.aborted) return stop(i, "cancelled", null);
    states[i] = { status: "running", inputCount: current.length };
    emit();

    if (!canRunInChain(tool) || !isModuleChainable(module)) return fail("هذه الأداة لا يمكن ربطها في سير عمل.", "this tool can't be used in a workflow.");

    const wrong = current.find((f) => !tool.accepts.includes(f.kind));
    if (wrong) {
      return fail(
        `لا تقبل ملف ${kindLabel(wrong.kind)} «${wrong.name}». تقبل: ${kindsText(tool.accepts)}.`,
        `can't open the ${kindLabel(wrong.kind)} file “${wrong.name}”. It accepts: ${kindsText(tool.accepts)}.`,
      );
    }
    if (current.length < tool.minFiles) {
      return fail(
        `تحتاج ${formatNumber(tool.minFiles)} ملفات على الأقل، ووصلها ${formatNumber(current.length)}.`,
        `needs at least ${formatNumber(tool.minFiles)} files, but received ${formatNumber(current.length)}.`,
      );
    }
    if (tool.maxFiles !== null && current.length > tool.maxFiles) {
      return fail(
        `تعالج ${formatNumber(tool.maxFiles)} ملف كحد أقصى، ووصلها ${formatNumber(current.length)}.`,
        `handles at most ${formatNumber(tool.maxFiles)} file(s), but received ${formatNumber(current.length)}.`,
      );
    }
    const invalid = module.validate?.(asWorkspaceFiles(current), settings);
    if (invalid) return fail(invalid.ar, invalid.en);

    const res = await runProcessor(module.process, current, settings, module.mode, {
      signal: opts.signal,
      onProgress: (progress) => {
        states[i] = { ...states[i], progress };
        emit();
      },
    });

    if (res.cancelled || opts.signal.aborted) return stop(i, "cancelled", null);
    const failed = res.items.find((it) => it.status === "error");
    if (failed) {
      const file = current.find((f) => f.id === failed.key);
      const msg = failed.error?.startsWith("MEMORY:") ? MEMORY : { ar: failed.error ?? "", en: failed.error ?? "" };
      const where = file ? { ar: `«${file.name}»: `, en: `“${file.name}”: ` } : { ar: "", en: "" };
      return fail(`${where.ar}${msg.ar}`, `${where.en}${msg.en}`);
    }
    if (!res.outputs.length) return fail("لم تُنتج أي ملف.", "produced no files.");

    // Outputs → next inputs, with their real kind and their origin.
    const next: ProcessInput[] = [];
    for (let n = 0; n < res.outputs.length; n++) {
      const out = res.outputs[n];
      const file = out.blob instanceof File && out.blob.name === out.name ? out.blob : new File([out.blob], out.name, { type: out.blob.type });
      const id = `s${i + 1}-${n + 1}`;
      lineage.set(id, origins(out.sourceIds));
      next.push({ id, file, name: out.name, kind: await detect(file) });
    }

    states[i] = { status: "done", inputCount: current.length, outputCount: res.outputs.length, progress: undefined };
    emit();
    last = res;
    current = next;
  }

  const outputs: ProcessOutput[] = last.outputs.map((o) => ({ ...o, sourceIds: origins(o.sourceIds) }));
  return {
    status: "done",
    steps: states,
    stoppedAt: null,
    error: null,
    result: { items: [{ key: "batch", status: "done", outputs }], outputs, cancelled: false },
  };
}
