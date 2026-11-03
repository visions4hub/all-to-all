// Processors that change which pages a PDF has and in what order.
// Pure pdf-lib (no DOM), so they run in Node tests as they do in the browser.

import type { PDFDocument } from "pdf-lib";
import { throwIfCancelled, UserFacingError, type ProcessContext, type ProcessInput, type ProcessOutput } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import { chunkPages, parsePageRanges, type PageRange } from "@/lib/pdf/page-ranges";
import { assemble, removePages, rotatePages, type PageRef } from "./assemble";
import { PDF_ERRORS, userError } from "./errors";
import { openPdfDocument, savePdf } from "./pdf-lib";
import { consecutiveRuns, rangeErrorText, resolvePages, type PageSelection } from "./page-selection";

const PAGES = { ar: "الصفحات", en: "Pages" };

async function output(doc: PDFDocument, name: string, sourceIds: string[]): Promise<ProcessOutput> {
  return { name, blob: await savePdf(doc), sourceIds, meta: [{ label: PAGES, value: doc.getPageCount() }] };
}

function rangeLabel(pages: number[]) {
  const first = pages[0];
  const last = pages[pages.length - 1];
  return first === last ? `page-${first}` : `pages-${first}-${last}`;
}

// ---- Merge ------------------------------------------------------------------

export type MergeSettings = Record<string, never>;

export async function mergePdfs(inputs: ProcessInput[], _settings: MergeSettings, ctx: ProcessContext): Promise<ProcessOutput[]> {
  const docs: PDFDocument[] = [];
  const plan: PageRef[] = [];
  for (let i = 0; i < inputs.length; i++) {
    throwIfCancelled(ctx.signal);
    ctx.onProgress({ done: i, total: inputs.length + 1, label: inputs[i].name });
    let doc: PDFDocument;
    try {
      doc = await openPdfDocument(inputs[i].file);
    } catch (error) {
      // Say which file failed; merging can't continue without it.
      throw new UserFacingError(`${inputs[i].name}: ${(error as Error).message}`);
    }
    docs.push(doc);
    for (let p = 0; p < doc.getPageCount(); p++) plan.push({ source: i, page: p });
  }
  ctx.onProgress({ done: inputs.length, total: inputs.length + 1 });
  const merged = await assemble(docs, plan, ctx.signal);
  const title = docs[0].getTitle();
  if (title) merged.setTitle(title);
  return [await output(merged, buildOutputName(inputs[0].name, { suffix: "merged", ext: "pdf" }), inputs.map((f) => f.id))];
}

// ---- Split ------------------------------------------------------------------

export type SplitSettings = { mode: "ranges" | "every-page" | "every-n"; ranges: string; every: number };

export const DEFAULT_SPLIT: SplitSettings = { mode: "ranges", ranges: "", every: 2 };

/** The groups of 1-based pages each output file will hold. */
export function splitGroups(settings: SplitSettings, total: number): { ok: true; groups: number[][] } | { ok: false; error: import("@/lib/i18n").Localized } {
  let ranges: PageRange[];
  if (settings.mode === "every-page") ranges = chunkPages(total, 1);
  else if (settings.mode === "every-n") {
    if (!Number.isInteger(settings.every) || settings.every < 1) {
      return { ok: false, error: { ar: "اكتب عدد صفحات صحيحاً أكبر من صفر", en: "Enter a whole number of pages above zero" } };
    }
    ranges = chunkPages(total, settings.every);
  } else {
    const parsed = parsePageRanges(settings.ranges, total);
    if (!parsed.ok) return { ok: false, error: rangeErrorText(parsed.error) };
    ranges = parsed.ranges;
  }
  return { ok: true, groups: ranges.map((r) => Array.from({ length: r.end - r.start + 1 }, (_, i) => r.start + i)) };
}

export async function splitPdf(inputs: ProcessInput[], settings: SplitSettings, ctx: ProcessContext): Promise<ProcessOutput[]> {
  const [input] = inputs;
  const doc = await openPdfDocument(input.file);
  const result = splitGroups(settings, doc.getPageCount());
  if (!result.ok) throw userError(result.error);
  const outputs: ProcessOutput[] = [];
  for (let i = 0; i < result.groups.length; i++) {
    throwIfCancelled(ctx.signal);
    ctx.onProgress({ done: i, total: result.groups.length, label: input.name });
    const pages = result.groups[i];
    const part = await assemble([doc], pages.map((p) => ({ source: 0, page: p - 1 })), ctx.signal);
    outputs.push(await output(part, buildOutputName(input.name, { suffix: rangeLabel(pages), ext: "pdf" }), [input.id]));
  }
  return outputs;
}

// ---- Remove pages -------------------------------------------------------------

export type RemoveSettings = { ranges: string };

export async function removePdfPages(inputs: ProcessInput[], settings: RemoveSettings, ctx: ProcessContext): Promise<ProcessOutput[]> {
  const [input] = inputs;
  const doc = await openPdfDocument(input.file);
  const total = doc.getPageCount();
  const sel = resolvePages({ scope: "custom", ranges: settings.ranges }, total);
  if (!sel.ok) throw userError(sel.error);
  if (sel.pages.length >= total) {
    throw userError({ ar: "لا يمكن حذف كل الصفحات؛ اترك صفحة واحدة على الأقل.", en: "You can't remove every page; keep at least one." });
  }
  throwIfCancelled(ctx.signal);
  removePages(doc, sel.pages.map((p) => p - 1));
  return [await output(doc, buildOutputName(input.name, { suffix: "edited", ext: "pdf" }), [input.id])];
}

// ---- Extract pages ------------------------------------------------------------

export type ExtractSettings = { ranges: string; output: "single" | "per-page" | "per-range" };

export async function extractPdfPages(inputs: ProcessInput[], settings: ExtractSettings, ctx: ProcessContext): Promise<ProcessOutput[]> {
  const [input] = inputs;
  const doc = await openPdfDocument(input.file);
  const sel = resolvePages({ scope: "custom", ranges: settings.ranges }, doc.getPageCount());
  if (!sel.ok) throw userError(sel.error);
  if (!sel.pages.length) throw userError(PDF_ERRORS.noPages);
  const groups =
    settings.output === "single" ? [sel.pages] : settings.output === "per-page" ? sel.pages.map((p) => [p]) : consecutiveRuns(sel.pages);
  const outputs: ProcessOutput[] = [];
  for (let i = 0; i < groups.length; i++) {
    throwIfCancelled(ctx.signal);
    ctx.onProgress({ done: i, total: groups.length, label: input.name });
    const part = await assemble([doc], groups[i].map((p) => ({ source: 0, page: p - 1 })), ctx.signal);
    const suffix = settings.output === "single" ? "extracted" : rangeLabel(groups[i]);
    outputs.push(await output(part, buildOutputName(input.name, { suffix, ext: "pdf" }), [input.id]));
  }
  return outputs;
}

// ---- Rotate -------------------------------------------------------------------

export type RotateSettings = { angle: 90 | -90 | 180; selection: PageSelection };

export async function rotatePdf(inputs: ProcessInput[], settings: RotateSettings, ctx: ProcessContext): Promise<ProcessOutput[]> {
  const [input] = inputs;
  const doc = await openPdfDocument(input.file);
  const sel = resolvePages(settings.selection, doc.getPageCount());
  if (!sel.ok) throw userError(sel.error);
  if (!sel.pages.length) throw userError(PDF_ERRORS.noPages);
  throwIfCancelled(ctx.signal);
  await rotatePages(doc, sel.pages.map((p) => p - 1), settings.angle);
  return [await output(doc, buildOutputName(input.name, { suffix: "rotated", ext: "pdf" }), [input.id])];
}

// ---- Organize -----------------------------------------------------------------

/** One page in the organized result. `fileId` refers to a workspace file. */
export type OrganizeItem = { key: string; fileId: string; page: number; rotate: number };
export type OrganizeSettings = { items: OrganizeItem[] };

export async function organizePdf(inputs: ProcessInput[], settings: OrganizeSettings, ctx: ProcessContext): Promise<ProcessOutput[]> {
  if (!settings.items.length) throw userError({ ar: "النتيجة فارغة؛ أبقِ صفحة واحدة على الأقل.", en: "The result is empty; keep at least one page." });
  const usedIds = [...new Set(settings.items.map((i) => i.fileId))];
  const docs: PDFDocument[] = [];
  const index = new Map<string, number>();
  for (const id of usedIds) {
    throwIfCancelled(ctx.signal);
    const input = inputs.find((f) => f.id === id);
    if (!input) throw userError({ ar: "أحد الملفات المستخدمة لم يعد موجوداً.", en: "One of the files used is no longer there." });
    index.set(id, docs.length);
    docs.push(await openPdfDocument(input.file));
  }
  const plan: PageRef[] = settings.items.map((item) => {
    const source = index.get(item.fileId)!;
    if (item.page < 0 || item.page >= docs[source].getPageCount()) throw userError(PDF_ERRORS.damaged);
    return { source, page: item.page, rotate: item.rotate };
  });
  const out = await assemble(docs, plan, ctx.signal);
  const first = inputs.find((f) => f.id === usedIds[0])!;
  return [await output(out, buildOutputName(first.name, { suffix: "organized", ext: "pdf" }), usedIds)];
}
