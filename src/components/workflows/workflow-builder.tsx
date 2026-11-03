"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Eraser, FileJson, Info, Loader2, Play, Save, ShieldCheck, Square, XCircle } from "lucide-react";
import { FileDropzone } from "@/components/files/file-dropzone";
import { FileList, FileListToolbar } from "@/components/files/file-list";
import { ToolIcon } from "@/components/tool-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { WorkflowPresetList } from "@/components/workflow-presets";
import { ResultsPanel } from "@/components/workspace/results-panel";
import { downloadBlob } from "@/lib/files/download";
import { buildOutputName, sanitizeBaseName } from "@/lib/files/filename";
import { formatNumber } from "@/lib/files/format";
import { useT, type Localized } from "@/lib/i18n";
import { acceptAttribute } from "@/lib/tools/registry";
import type { ToolDefinition } from "@/lib/tools/types";
import { getWorkflowPreset, type WorkflowPreset } from "@/lib/tools/workflow-presets";
import { chainableBySlug, isModuleChainable, notChainableTools } from "@/lib/workflows/chainable";
import { checkChain, runChain, type ChainRunResult, type StepState } from "@/lib/workflows/engine";
import { predictOutputKinds, type ChainKind } from "@/lib/workflows/kinds";
import { loadToolModule } from "@/lib/workflows/modules";
import { cleanName, parseWorkflowFile, serializeWorkflows, type WorkflowDef, type WorkflowStepDef } from "@/lib/workflows/schema";
import { sanitizeSettings } from "@/lib/workflows/settings";
import { clearWorkflows, deleteWorkflow, listWorkflows, newWorkflowId, saveWorkflow } from "@/lib/workflows/storage";
import { useWorkspace } from "@/stores/workspace";
import { cn } from "@/lib/utils";
import { AddStepDialog } from "./add-step-dialog";
import { SavedWorkflows } from "./saved-workflows";
import { StepCard, type BuilderStep } from "./step-card";

let keySeq = 0;
const newKey = () => `step-${Date.now().toString(36)}-${(keySeq++).toString(36)}`;

type Notice = { tone: "info" | "error"; text: Localized };

/** Loads each step's module and merges the given settings onto its defaults. */
async function resolveSteps(defs: WorkflowStepDef[]): Promise<{ steps: BuilderStep[]; resets: number }> {
  let resets = 0;
  const steps = await Promise.all(
    defs.map(async (d): Promise<BuilderStep> => {
      const tool = chainableBySlug(d.slug);
      if (!tool) throw new Error(`Not chainable: ${d.slug}`);
      const mod = await loadToolModule(d.slug);
      if (!isModuleChainable(mod)) throw new Error(`Not chainable: ${d.slug}`);
      const report = { reset: [] as string[] };
      const settings = sanitizeSettings(mod.defaultSettings, d.settings, report);
      resets += report.reset.length;
      return { key: newKey(), tool, module: mod, settings };
    }),
  );
  return { steps, resets };
}

const jsonName = (name: string) => `${sanitizeBaseName(name, "workflow")}.workflow.json`;

export function WorkflowBuilder() {
  const t = useT();
  const allFiles = useWorkspace((s) => s.files);
  const addFiles = useWorkspace((s) => s.addFiles);

  const [steps, setSteps] = useState<BuilderStep[]>([]);
  const [name, setName] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saved, setSaved] = useState<WorkflowDef[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [running, setRunning] = useState(false);
  const [states, setStates] = useState<StepState[] | null>(null);
  const [run, setRun] = useState<ChainRunResult | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel a running chain when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  const refreshSaved = useCallback(
    () =>
      listWorkflows().then(setSaved, () => {
        setSaved([]);
        setNotice({ tone: "error", text: { ar: "تعذّر فتح التخزين المحلي في هذا المتصفح.", en: "This browser's local storage couldn't be opened." } });
      }),
    [],
  );
  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  const first = steps[0]?.tool;
  const accepted = useMemo(() => (first ? allFiles.filter((f) => first.accepts.includes(f.kind)) : allFiles), [allFiles, first]);
  const rejected = useMemo(() => new Set(first ? allFiles.filter((f) => !first.accepts.includes(f.kind)).map((f) => f.id) : []), [allFiles, first]);
  const issues = useMemo(
    () => checkChain(steps.map((s) => ({ tool: s.tool, settings: s.settings })), accepted.length ? accepted.map((f) => f.kind) : null),
    [steps, accepted],
  );

  /** What the chain produces so far, for suggesting the next step. */
  const incoming = useMemo<ChainKind[] | null>(() => {
    let kinds: ChainKind[] | null = accepted.length ? [...new Set(accepted.map((f) => f.kind))] : null;
    for (const s of steps) kinds = predictOutputKinds(s.tool, s.settings, kinds ?? (s.tool.accepts as ChainKind[]));
    return kinds;
  }, [steps, accepted]);

  const clearRun = () => {
    setRun(null);
    setStates(null);
  };

  // ---- editing ---------------------------------------------------------------

  const addStep = (tool: ToolDefinition) => {
    const key = newKey();
    setSteps((s) => [...s, { key, tool, settings: undefined }]);
    clearRun();
    loadToolModule(tool.slug).then(
      (mod) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, module: mod, settings: mod.defaultSettings } : x))),
      () => setSteps((s) => s.map((x) => (x.key === key ? { ...x, loadError: true } : x))),
    );
  };
  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= steps.length || from === to) return;
    setSteps((s) => {
      const next = [...s];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    clearRun();
  };
  const removeStep = (key: string) => {
    setSteps((s) => s.filter((x) => x.key !== key));
    clearRun();
  };
  const changeSettings = (key: string, settings: unknown) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, settings } : x)));

  /** Resolves the steps' modules, then shows the workflow in the builder. */
  const openDefinition = (defName: string, defs: WorkflowStepDef[], id: string | null, msg?: Localized) =>
    resolveSteps(defs)
      .then(({ steps: resolved, resets }) => {
        setSteps(resolved);
        setName(defName);
        setSavedId(id);
        setRun(null);
        setStates(null);
        setNotice(
          resets
            ? { tone: "info", text: { ar: "بعض الإعدادات لم تكن صالحة فأُعيدت إلى قيمها الافتراضية.", en: "Some settings were invalid and were reset to their defaults." } }
            : msg
              ? { tone: "info", text: msg }
              : null,
        );
      })
      .catch(() =>
        setNotice({ tone: "error", text: { ar: "تعذّر فتح سير العمل: يحتوي على أداة غير متاحة.", en: "Couldn't open the workflow: it uses a tool that isn't available." } }),
      );

  const loadDefinition = async (defName: string, defs: WorkflowStepDef[], id: string | null, msg?: Localized) => {
    setBusy(true);
    await openDefinition(defName, defs, id, msg);
    setBusy(false);
  };

  const presetArgs = (p: WorkflowPreset) =>
    [
      t(p.name),
      p.steps.map((s) => ({ slug: s.slug, settings: s.settings })),
      null,
      { ar: `فُتح القالب «${p.name.ar}». أضف ملفاتك ثم شغّله.`, en: `Opened the “${p.name.en}” preset. Add your files, then run it.` },
    ] as const;
  const loadPreset = (p: WorkflowPreset) => loadDefinition(...presetArgs(p));

  // Open a preset from the URL (/workflows/?preset=web-ready), once.
  const presetOpened = useRef(false);
  useEffect(() => {
    if (presetOpened.current) return;
    presetOpened.current = true;
    const id = new URLSearchParams(window.location.search).get("preset");
    const preset = id ? getWorkflowPreset(id) : undefined;
    if (preset) void openDefinition(...presetArgs(preset));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const resetBuilder = () => {
    setSteps([]);
    setName("");
    setSavedId(null);
    clearRun();
    setNotice(null);
  };

  // ---- running -----------------------------------------------------------------

  const notReady = steps.some((s) => !s.module);
  const problem: Localized | null = (() => {
    if (!steps.length) return { ar: "أضف خطوة واحدة على الأقل", en: "Add at least one step" };
    if (notReady) return { ar: "جارٍ تحميل الأدوات…", en: "Loading the tools…" };
    if (issues.some((i) => i.level === "error")) return { ar: "أصلح المشكلات المعلّمة في الخطوات", en: "Fix the problems marked on the steps" };
    if (!accepted.length) return allFiles.length ? { ar: "لا توجد ملفات تقبلها الخطوة الأولى", en: "No files the first step accepts" } : { ar: "أضف ملفات للبدء", en: "Add files to start" };
    return null;
  })();

  const start = async () => {
    if (problem || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setRun(null);
    setStates(steps.map(() => ({ status: "pending" })));
    try {
      const res = await runChain(
        steps.map((s) => ({ tool: s.tool, module: s.module!, settings: s.settings })),
        accepted,
        { signal: controller.signal, onUpdate: setStates },
      );
      setStates(res.steps);
      setRun(res);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const overall = (() => {
    if (!states) return 0;
    let done = 0;
    for (const s of states) {
      if (s.status === "done") done += 1;
      else if (s.status === "running" && s.progress?.total) done += s.progress.done / s.progress.total;
    }
    return (done / states.length) * 100;
  })();

  // ---- saving / import / export ---------------------------------------------------

  const currentDefs = (): WorkflowStepDef[] => steps.map((s) => ({ slug: s.tool.slug, settings: s.settings }));
  const effectiveName = () => cleanName(name) || t({ ar: "سير عمل بدون اسم", en: "Untitled workflow" });

  const save = async () => {
    if (!steps.length || notReady) return;
    setBusy(true);
    try {
      const now = Date.now();
      const existing = saved?.find((w) => w.id === savedId);
      const def: WorkflowDef = { id: existing?.id ?? newWorkflowId(), name: effectiveName(), steps: currentDefs(), createdAt: existing?.createdAt ?? now, updatedAt: now };
      await saveWorkflow(def);
      setSavedId(def.id);
      setName(def.name);
      await refreshSaved();
      setNotice({ tone: "info", text: { ar: `حُفظ «${def.name}» في هذا المتصفح.`, en: `Saved “${def.name}” in this browser.` } });
    } catch {
      setNotice({ tone: "error", text: { ar: "تعذّر الحفظ في هذا المتصفح.", en: "Couldn't save in this browser." } });
    } finally {
      setBusy(false);
    }
  };

  const exportJson = async (workflows: { name: string; steps: WorkflowStepDef[] }[], filename: string) => {
    const text = await serializeWorkflows(workflows);
    downloadBlob(new Blob([text], { type: "application/json" }), filename);
  };

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      const parsed = parseWorkflowFile(await file.text());
      if (!parsed.ok) {
        setNotice({ tone: "error", text: { ar: `لم يُستورد الملف: ${parsed.error.ar}`, en: `Not imported: ${parsed.error.en}` } });
        return;
      }
      let resets = 0;
      const now = Date.now();
      const defs: WorkflowDef[] = [];
      for (const w of parsed.workflows) {
        const { steps: resolved, resets: r } = await resolveSteps(w.steps);
        resets += r;
        defs.push({ id: newWorkflowId(), name: w.name, steps: resolved.map((s) => ({ slug: s.tool.slug, settings: s.settings })), createdAt: now, updatedAt: now });
      }
      for (const d of defs) await saveWorkflow(d);
      await refreshSaved();
      if (defs.length === 1) {
        const { steps: resolved } = await resolveSteps(defs[0].steps);
        setSteps(resolved);
        setName(defs[0].name);
        setSavedId(defs[0].id);
        clearRun();
      }
      const n = formatNumber(defs.length);
      setNotice({
        tone: "info",
        text: {
          ar: `استُورد ${n} سير عمل وحُفظ في هذا المتصفح.${resets ? " بعض الإعدادات لم تكن صالحة فأُعيدت إلى قيمها الافتراضية." : ""}`,
          en: `Imported ${n} workflow(s) and saved them in this browser.${resets ? " Some settings were invalid and were reset to their defaults." : ""}`,
        },
      });
    } catch {
      setNotice({ tone: "error", text: { ar: "تعذّر استيراد الملف.", en: "Couldn't import the file." } });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (w: WorkflowDef) => {
    await deleteWorkflow(w.id);
    if (w.id === savedId) setSavedId(null);
    await refreshSaved();
  };

  const clearAll = async () => {
    await clearWorkflows();
    setSavedId(null);
    await refreshSaved();
    setNotice({ tone: "info", text: { ar: "مُسح كل سير العمل المحفوظ.", en: "All saved workflows were cleared." } });
  };

  // ---- view ------------------------------------------------------------------------

  const stoppedMessage = run?.status === "error" && run.error ? t(run.error) : null;
  const blocked = notChainableTools();

  return (
    <div className="space-y-8">
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn("flex items-start gap-2 rounded-xl p-3 text-sm", notice.tone === "error" ? "bg-destructive/8 text-destructive" : "bg-teal-soft text-foreground")}
          data-testid="workflow-notice"
        >
          {notice.tone === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0 text-teal" />}
          <span className="me-auto">{t(notice.text)}</span>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setNotice(null)} aria-label={t({ ar: "إغلاق", en: "Dismiss" })}>
            <XCircle className="size-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Steps */}
        <section className="space-y-3 rounded-2xl border bg-card/60 p-3 sm:p-4" aria-labelledby="steps-title">
          <div className="flex flex-wrap items-end gap-2">
            <label className="w-full min-w-0 sm:w-auto sm:flex-1">
              <span className="mb-1 block text-sm font-medium">{t({ ar: "اسم سير العمل", en: "Workflow name" })}</span>
              <Input
                dir="auto"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder={t({ ar: "مثلاً: صور المتجر", en: "e.g. Shop photos" })}
                className="h-10"
              />
            </label>
            <div className="flex gap-1.5">
              <Button className="h-10 rounded-xl" disabled={busy || running || !steps.length || notReady} onClick={save}>
                <Save />
                {t({ ar: "حفظ", en: "Save" })}
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-xl"
                disabled={busy || !steps.length || notReady}
                onClick={() => void exportJson([{ name: effectiveName(), steps: currentDefs() }], jsonName(effectiveName()))}
              >
                <FileJson />
                {t({ ar: "تصدير JSON", en: "Export JSON" })}
              </Button>
              <Button variant="ghost" className="h-10 rounded-xl" disabled={busy || running || (!steps.length && !name)} onClick={resetBuilder} aria-label={t({ ar: "سير عمل جديد", en: "New workflow" })}>
                <Eraser />
                <span className="hidden sm:inline">{t({ ar: "جديد", en: "New" })}</span>
              </Button>
            </div>
          </div>

          <h2 id="steps-title" className="pt-2 text-lg font-semibold">
            {t({ ar: "الخطوات", en: "Steps" })}
            {steps.length > 0 && <span className="ms-2 text-sm font-normal text-muted-foreground">({formatNumber(steps.length)})</span>}
          </h2>
          {steps.length === 0 && (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              {t({ ar: "ابدأ بقالب جاهز من الأسفل، أو أضف الخطوات بنفسك. تُنفَّذ الخطوات بالترتيب، وناتج كل خطوة يدخل إلى التالية مباشرة.", en: "Start from a preset below, or add steps yourself. Steps run in order, and each step's output goes straight into the next." })}
            </p>
          )}
          <ol className="space-y-2" aria-label={t({ ar: "خطوات سير العمل", en: "Workflow steps" })}>
            {steps.map((step, i) => (
              <StepCard
                key={step.key}
                step={step}
                index={i}
                count={steps.length}
                state={states?.[i]}
                issues={issues.filter((x) => x.step === i)}
                files={i === 0 ? accepted : []}
                disabled={running || busy}
                dragging={dragKey === step.key}
                onMove={(to) => moveStep(i, to)}
                onRemove={() => removeStep(step.key)}
                onChange={(s) => changeSettings(step.key, s)}
                onDragStart={() => setDragKey(step.key)}
                onDragEnter={() => {
                  if (!dragKey || dragKey === step.key) return;
                  const from = steps.findIndex((x) => x.key === dragKey);
                  if (from >= 0) moveStep(from, i);
                }}
                onDragEnd={() => setDragKey(null)}
              />
            ))}
          </ol>
          <AddStepDialog incoming={incoming} onAdd={addStep} disabled={running || busy} />
        </section>

        {/* Files + run */}
        <aside className="space-y-3 lg:sticky lg:top-20">
          <section className="space-y-3 rounded-2xl border bg-card p-3" aria-label={t({ ar: "الملفات", en: "Files" })}>
            {allFiles.length > 0 ? (
              <>
                <FileListToolbar count={allFiles.length} totalSize={allFiles.reduce((n, f) => n + f.size, 0)} />
                <FileList files={allFiles} invalidIds={rejected} className="max-h-[40vh] overflow-y-auto" />
                <FileDropzone size="compact" accept={first ? acceptAttribute(first.accepts) : ""} onFiles={(f) => void addFiles(f)} enableCamera={first?.category === "image"} />
              </>
            ) : (
              <FileDropzone accept={first ? acceptAttribute(first.accepts) : ""} onFiles={(f) => void addFiles(f)} enableCamera={first?.category === "image"} />
            )}
            {rejected.size > 0 && (
              <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">
                {t({
                  ar: `${formatNumber(rejected.size)} ملف لا تقبله الخطوة الأولى وسيُتجاهل.`,
                  en: `${formatNumber(rejected.size)} file(s) aren't accepted by the first step and will be skipped.`,
                })}
              </p>
            )}
          </section>

          <div className="space-y-2 rounded-2xl border bg-card p-3">
            {running ? (
              <Button variant="outline" className="h-12 w-full rounded-xl text-base" onClick={() => abortRef.current?.abort()}>
                <Square className="size-4" />
                {t({ ar: "إلغاء", en: "Cancel" })}
              </Button>
            ) : (
              <Button className="h-12 w-full rounded-xl text-base shadow-lift" disabled={!!problem || busy} onClick={start}>
                <Play className="size-4" />
                {t({ ar: "تشغيل سير العمل", en: "Run workflow" })}
              </Button>
            )}
            {!running && problem && <p className="text-center text-xs text-muted-foreground">{t(problem)}</p>}
            {running && states && (
              <div role="status" className="space-y-1.5">
                <p className="flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  {(() => {
                    const i = states.findIndex((s) => s.status === "running");
                    return i >= 0
                      ? t({ ar: `الخطوة ${i + 1} من ${states.length}: ${steps[i].tool.name.ar}`, en: `Step ${i + 1} of ${states.length}: ${steps[i].tool.name.en}` })
                      : t({ ar: "جارٍ التحضير…", en: "Preparing…" });
                  })()}
                </p>
                <Progress value={overall} />
              </div>
            )}
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-teal" />
              {t({ ar: "كل الخطوات تعمل على جهازك", en: "Every step runs on your device" })}
            </p>
          </div>
        </aside>
      </div>

      {stoppedMessage && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/8 p-4 text-destructive" data-testid="workflow-error">
          <XCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">{t({ ar: "توقف سير العمل", en: "The workflow stopped" })}</p>
            <p className="text-sm">{stoppedMessage}</p>
          </div>
        </div>
      )}
      {run?.status === "cancelled" && (
        <p role="status" className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
          {t({ ar: `أُلغي سير العمل عند الخطوة ${(run.stoppedAt ?? 0) + 1}. لم تُنتج أي ملفات.`, en: `The workflow was cancelled at step ${(run.stoppedAt ?? 0) + 1}. No files were produced.` })}
        </p>
      )}
      {run?.status === "done" && (
        <ResultsPanel
          result={run.result}
          sources={accepted}
          zipName={buildOutputName(accepted[0]?.name ?? "all-to-all", { suffix: "workflow", ext: "zip" })}
          onReset={clearRun}
        />
      )}

      <SavedWorkflows
        workflows={saved}
        activeId={savedId}
        busy={busy || running}
        onOpen={(w) => void loadDefinition(w.name, w.steps, w.id)}
        onDelete={(w) => void remove(w)}
        onExport={(w) => void exportJson([w], jsonName(w.name))}
        onExportAll={() => saved && void exportJson(saved, "all-to-all-workflows.json")}
        onImport={(f) => void importFile(f)}
        onClear={() => void clearAll()}
      />

      <section aria-labelledby="presets-title" className="space-y-3">
        <h2 id="presets-title" className="text-lg font-semibold">
          {t({ ar: "قوالب جاهزة", en: "Presets" })}
        </h2>
        <WorkflowPresetList onSelect={(p) => void loadPreset(p)} />
      </section>

      {blocked.length > 0 && (
        <details className="rounded-2xl border bg-card p-4">
          <summary className="cursor-pointer font-semibold">{t({ ar: "أدوات لا يمكن ربطها في سير عمل", en: "Tools that can't be chained" })}</summary>
          <p className="mt-2 text-sm text-muted-foreground">
            {t({
              ar: "هذه الأدوات تحتاج عملاً يدوياً على ملف بعينه، فلا يمكن تشغيلها تلقائياً على ناتج خطوة سابقة. استخدمها من صفحتها.",
              en: "These tools need hands-on work on one specific file, so they can't run automatically on another step's output. Use them from their own page.",
            })}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="not-chainable">
            {blocked.map(({ tool, reason }) => (
              <li key={tool.slug} className="flex items-start gap-3 rounded-xl border bg-background/60 p-3">
                <ToolIcon name={tool.icon} category={tool.category} size="sm" className="size-8 shrink-0 rounded-lg [&_svg]:size-4" />
                <span>
                  <span className="block text-sm font-medium">{t(tool.name)}</span>
                  <span className="block text-xs text-muted-foreground">{t(reason)}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
