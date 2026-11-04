import type { Localized } from "@/lib/tools/types";
import { chainableBySlug } from "./chainable";
import { decodeSettings, encodeSettings, SettingsDecodeError } from "./settings";

/** A step as stored: which tool, and its settings. */
export type WorkflowStepDef = { slug: string; settings: unknown };

/** A workflow as saved in IndexedDB. */
export type WorkflowDef = {
  id: string;
  name: string;
  steps: WorkflowStepDef[];
  createdAt: number;
  updatedAt: number;
};

/** A workflow read from a JSON file, before it gets an id. */
export type ImportedWorkflow = { name: string; steps: WorkflowStepDef[] };

export const FILE_FORMAT = "all-to-all/workflow";
export const FILE_VERSION = 1;
export const LIMITS = { bytes: 20 * 1024 * 1024, workflows: 100, steps: 30, name: 100 };

// Control characters and bidi overrides are removed from names.
const UNSAFE_CHARS = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/g;

export function cleanName(name: string): string {
  return name.replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim().slice(0, LIMITS.name);
}

/** The JSON file for one or more workflows. */
export async function serializeWorkflows(workflows: { name: string; steps: WorkflowStepDef[] }[]): Promise<string> {
  const doc = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    workflows: await Promise.all(
      workflows.map(async (w) => ({
        name: w.name,
        steps: await Promise.all(w.steps.map(async (s) => ({ tool: s.slug, settings: await encodeSettings(s.settings) }))),
      })),
    ),
  };
  return JSON.stringify(doc, null, 2);
}

export type ParseResult = { ok: true; workflows: ImportedWorkflow[] } | { ok: false; error: Localized };

const fail = (ar: string, en: string): ParseResult => ({ ok: false, error: { ar, en } });

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Reads a workflow JSON file. Rejects anything that isn't exactly our format:
 * unknown or non-chainable tools, wrong types, oversized input, forbidden keys
 * (`__proto__`…). Settings are checked against each tool's defaults later, when
 * the tool loads (see sanitizeSettings).
 */
export function parseWorkflowFile(text: string): ParseResult {
  if (text.length > LIMITS.bytes) return fail("الملف كبير جداً لملف سير عمل.", "The file is too large to be a workflow file.");
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return fail("الملف ليس JSON صالحاً.", "The file isn't valid JSON.");
  }
  if (!isObject(doc) || doc.format !== FILE_FORMAT) {
    return fail("هذا ليس ملف سير عمل من All To All.", "This isn't an All To All workflow file.");
  }
  if (doc.version !== FILE_VERSION) {
    return fail(`إصدار الملف غير مدعوم (${String(doc.version)}).`, `Unsupported file version (${String(doc.version)}).`);
  }
  if (!Array.isArray(doc.workflows) || doc.workflows.length === 0) {
    return fail("لا يحتوي الملف على أي سير عمل.", "The file contains no workflows.");
  }
  if (doc.workflows.length > LIMITS.workflows) {
    return fail(`الملف يحتوي على أكثر من ${LIMITS.workflows} سير عمل.`, `The file has more than ${LIMITS.workflows} workflows.`);
  }

  const workflows: ImportedWorkflow[] = [];
  for (let w = 0; w < doc.workflows.length; w++) {
    const item = doc.workflows[w];
    const n = w + 1;
    if (!isObject(item)) return fail(`سير العمل رقم ${n} غير صالح.`, `Workflow ${n} is invalid.`);
    const name = typeof item.name === "string" ? cleanName(item.name) : "";
    if (!name) return fail(`سير العمل رقم ${n} بلا اسم.`, `Workflow ${n} has no name.`);
    if (!Array.isArray(item.steps) || item.steps.length === 0) {
      return fail(`سير العمل «${name}» بلا خطوات.`, `Workflow “${name}” has no steps.`);
    }
    if (item.steps.length > LIMITS.steps) {
      return fail(`سير العمل «${name}» فيه أكثر من ${LIMITS.steps} خطوة.`, `Workflow “${name}” has more than ${LIMITS.steps} steps.`);
    }
    const steps: WorkflowStepDef[] = [];
    for (let s = 0; s < item.steps.length; s++) {
      const step = item.steps[s];
      const sn = s + 1;
      if (!isObject(step) || typeof step.tool !== "string") {
        return fail(`الخطوة ${sn} في «${name}» غير صالحة.`, `Step ${sn} in “${name}” is invalid.`);
      }
      const slug = step.tool;
      if (!/^[a-z0-9-]{1,64}$/.test(slug) || !chainableBySlug(slug)) {
        const shown = slug.slice(0, 40).replace(UNSAFE_CHARS, "");
        return fail(
          `الخطوة ${sn} في «${name}» تستخدم أداة غير معروفة أو لا يمكن ربطها: «${shown}».`,
          `Step ${sn} in “${name}” uses an unknown or non-chainable tool: “${shown}”.`,
        );
      }
      if (step.settings !== undefined && !isObject(step.settings)) {
        return fail(`إعدادات الخطوة ${sn} في «${name}» غير صالحة.`, `The settings of step ${sn} in “${name}” are invalid.`);
      }
      let settings: unknown;
      try {
        settings = step.settings === undefined ? {} : decodeSettings(step.settings);
      } catch (e) {
        if (!(e instanceof SettingsDecodeError)) throw e;
        return fail(`إعدادات الخطوة ${sn} في «${name}» غير صالحة.`, `The settings of step ${sn} in “${name}” are invalid.`);
      }
      steps.push({ slug, settings });
    }
    workflows.push({ name, steps });
  }
  return { ok: true, workflows };
}
