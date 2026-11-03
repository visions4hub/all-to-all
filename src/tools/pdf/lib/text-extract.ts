// PDF → text with PDF.js. Only text stored in the PDF is read; scanned pages
// (pictures of text) have none, and no OCR is done.

import { throwIfCancelled, type ProcessContext, type ProcessInput, type ProcessOutput } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import type { Localized } from "@/lib/i18n";
import { currentLocale, PDF_ERRORS, userError } from "./errors";
import { hasRtl } from "./page-space";
import { resolvePages, type PageSelection } from "./page-selection";

export type TextItem = { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean };

const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/g;
const LTR_CHARS = /[A-Za-zÀ-ɏ]/g;

type Placed = { str: string; x: number; y: number; w: number; size: number };

/**
 * Puts PDF.js text items into reading order: lines top to bottom; within a line,
 * left to right, or right to left when the line is mostly Arabic/Hebrew.
 * Spaces are added where items are visibly apart; a blank line marks a large gap.
 */
export function itemsToText(items: TextItem[]): string {
  const placed: Placed[] = items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      size: Math.hypot(it.transform[2], it.transform[3]) || it.height || 10,
    }));
  if (!placed.length) return "";

  placed.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; size: number; items: Placed[] }[] = [];
  for (const it of placed) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.min(l.size, it.size) * 0.5);
    if (line) {
      line.items.push(it);
      line.size = Math.max(line.size, it.size);
    } else lines.push({ y: it.y, size: it.size, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);

  const out: string[] = [];
  let prev: (typeof lines)[number] | null = null;
  for (const line of lines) {
    const joined = line.items.map((i) => i.str).join("");
    const rtl = (joined.match(RTL_CHARS)?.length ?? 0) > (joined.match(LTR_CHARS)?.length ?? 0);
    const ordered = [...line.items].sort((a, b) => (rtl ? b.x + b.w - (a.x + a.w) : a.x - b.x));
    let text = "";
    ordered.forEach((it, i) => {
      if (i > 0) {
        const p = ordered[i - 1];
        const gap = rtl ? p.x - (it.x + it.w) : it.x - (p.x + p.w);
        if (gap > Math.min(p.size, it.size) * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += " ";
      }
      text += it.str;
    });
    if (prev && prev.y - line.y > Math.max(prev.size, line.size) * 1.9) out.push("");
    out.push(text.replace(/[ \t]+/g, " ").trim());
    prev = line;
  }
  return out.join("\n");
}

export type TextSettings = { selection: PageSelection; pageHeadings: boolean };
export const DEFAULT_TEXT: TextSettings = { selection: { scope: "all", ranges: "" }, pageHeadings: true };

/** The subset of a PDF.js document this module uses. */
export type TextSourceDoc = {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }>; cleanup(): void }>;
  loadingTask: { destroy(): Promise<void> };
};
export type PdfOpener = (data: Uint8Array) => Promise<TextSourceDoc>;

export type PageText = { page: number; text: string };

export async function readPagesText(doc: TextSourceDoc, pages: number[], signal?: AbortSignal, onPage?: (done: number) => void): Promise<PageText[]> {
  const out: PageText[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (signal) throwIfCancelled(signal);
    const page = await doc.getPage(pages[i]);
    const content = await page.getTextContent();
    out.push({ page: pages[i], text: itemsToText(content.items.filter((x): x is TextItem => typeof (x as TextItem).str === "string")) });
    page.cleanup();
    onPage?.(i + 1);
  }
  return out;
}

export function emptyPageNote(page: number): Localized {
  return {
    ar: `[الصفحة ${page}: لا يوجد نص — قد تكون صورة ممسوحة ضوئياً]`,
    en: `[Page ${page}: no text — it may be a scanned image]`,
  };
}

export function composeText(pages: PageText[], headings: boolean, locale: "ar" | "en"): string {
  return pages
    .map(({ page, text }) => {
      const body = text.trim() ? text : emptyPageNote(page)[locale];
      return headings ? `${locale === "ar" ? `--- الصفحة ${page} ---` : `--- Page ${page} ---`}\n${body}` : body;
    })
    .join(headings ? "\n\n" : "\n\n");
}

/** Opens a file with PDF.js, mapping its errors to clear messages. */
export async function openForText(input: ProcessInput, open: PdfOpener): Promise<TextSourceDoc> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  try {
    return await open(bytes);
  } catch (error) {
    const code = (error as { code?: string; name?: string }).code ?? (error as { name?: string }).name;
    if (code === "password" || code === "PasswordException") throw userError(PDF_ERRORS.encrypted);
    throw userError(PDF_ERRORS.damaged);
  }
}

export async function extractPdfText(inputs: ProcessInput[], settings: TextSettings, ctx: ProcessContext, open: PdfOpener): Promise<ProcessOutput[]> {
  const [input] = inputs;
  const doc = await openForText(input, open);
  try {
    const sel = resolvePages(settings.selection, doc.numPages);
    if (!sel.ok) throw userError(sel.error);
    if (!sel.pages.length) throw userError(PDF_ERRORS.noPages);
    const pages = await readPagesText(doc, sel.pages, ctx.signal);
    const empty = pages.filter((p) => !p.text.trim()).map((p) => p.page);
    const text = composeText(pages, settings.pageHeadings, currentLocale());
    const rtl = hasRtl(text);
    return [
      {
        name: buildOutputName(input.name, { ext: "txt" }),
        // BOM so older Windows editors open Arabic text as UTF-8.
        blob: new Blob(["﻿", text], { type: "text/plain;charset=utf-8" }),
        sourceIds: [input.id],
        meta: [
          { label: { ar: "الصفحات", en: "Pages" }, value: pages.length },
          { label: { ar: "صفحات بلا نص", en: "Pages without text" }, value: empty.length ? empty.join(", ") : "0" },
          ...(rtl ? [{ label: { ar: "يحتوي نصاً عربياً", en: "Contains Arabic" }, value: "✓" }] : []),
        ],
      },
    ];
  } finally {
    await doc.loadingTask.destroy();
  }
}
