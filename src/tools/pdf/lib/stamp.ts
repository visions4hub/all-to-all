// Processors that draw on top of pages: page numbers, watermarks. Plus crop.

import type { PDFDocument, PDFImage } from "pdf-lib";
import { throwIfCancelled, type ProcessContext, type ProcessInput, type ProcessOutput } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import { PDF_ERRORS, userError } from "./errors";
import { anchorPoint, displayRectToUser, rotatedBounds, rotatedOrigin, type Anchor } from "./geometry";
import { drawInDisplaySpace, drawPreparedText, pageGeometry, prepareText, type PageGeometry, type StandardFontName, type TextRasterizer } from "./page-space";
import { openPdfDocument, savePdf } from "./pdf-lib";
import { resolvePages, type PageSelection } from "./page-selection";

const PAGES = { ar: "الصفحات", en: "Pages" };

/** Copies one page into a fresh document, so a preview renders only that page. */
export async function singlePageCopy(doc: PDFDocument, index: number): Promise<Blob> {
  const { createPdfDocument } = await import("./pdf-lib");
  const out = await createPdfDocument();
  const [page] = await out.copyPages(doc, [index]);
  out.addPage(page);
  return savePdf(out);
}

// ---- Page numbers -----------------------------------------------------------

export type NumberFormat = "n" | "n-of-total" | "page-n" | "page-n-of-total" | "ar-page-n" | "ar-page-n-of-total" | "dash" | "custom";

export type PageNumberSettings = {
  position: Anchor;
  format: NumberFormat;
  /** Used when format is "custom": {n} = number, {total} = last number. */
  custom: string;
  start: number;
  skipFirst: boolean;
  selection: PageSelection;
  font: StandardFontName;
  bold: boolean;
  fontSize: number;
  color: string;
  /** Distance from the side edge / from the top or bottom edge, in points. */
  marginX: number;
  marginY: number;
};

export const DEFAULT_PAGE_NUMBERS: PageNumberSettings = {
  position: "bottom-center",
  format: "n",
  custom: "{n}",
  start: 1,
  skipFirst: false,
  selection: { scope: "all", ranges: "" },
  font: "helvetica",
  bold: false,
  fontSize: 11,
  color: "#333333",
  marginX: 36,
  marginY: 28,
};

export function formatPageLabel(format: NumberFormat, custom: string, n: number, total: number): string {
  switch (format) {
    case "n":
      return `${n}`;
    case "n-of-total":
      return `${n} / ${total}`;
    case "page-n":
      return `Page ${n}`;
    case "page-n-of-total":
      return `Page ${n} of ${total}`;
    case "ar-page-n":
      return `صفحة ${n}`;
    case "ar-page-n-of-total":
      return `صفحة ${n} من ${total}`;
    case "dash":
      return `- ${n} -`;
    case "custom":
      return custom.replaceAll("{n}", `${n}`).replaceAll("{total}", `${total}`);
  }
}

/**
 * Which pages get a number and what it is. Returns 0-based page index → label number.
 * The first page can be skipped (cover); numbering then starts on the next selected page.
 */
export function pageNumberPlan(settings: Pick<PageNumberSettings, "selection" | "skipFirst" | "start">, totalPages: number) {
  const sel = resolvePages(settings.selection, totalPages);
  if (!sel.ok) return sel;
  const pages = settings.skipFirst ? sel.pages.filter((p) => p !== 1) : sel.pages;
  const start = Math.trunc(settings.start);
  const entries = pages.map((p, i) => ({ index: p - 1, number: start + i }));
  return { ok: true as const, entries, last: start + pages.length - 1 };
}

export async function applyPageNumbers(
  doc: PDFDocument,
  settings: PageNumberSettings,
  rasterize: TextRasterizer | undefined,
  only?: number,
  signal?: AbortSignal,
) {
  const plan = pageNumberPlan(settings, doc.getPageCount());
  if (!plan.ok) throw userError(plan.error);
  if (!plan.entries.length) throw userError(PDF_ERRORS.noPages);
  for (const { index, number } of plan.entries) {
    if (only !== undefined && index !== only) continue;
    if (signal) throwIfCancelled(signal);
    const label = formatPageLabel(settings.format, settings.custom, number, plan.last);
    if (!label.trim()) continue;
    const text = await prepareText(doc, label, { fontSize: settings.fontSize, color: settings.color, font: settings.font, bold: settings.bold }, rasterize);
    const page = doc.getPage(index);
    await drawInDisplaySpace(page, async (geom) => {
      const at = anchorPoint(settings.position, geom, text, settings.marginX, settings.marginY);
      await drawPreparedText(page, text, at.x, at.y);
    });
  }
  return plan;
}

export async function addPageNumbers(
  inputs: ProcessInput[],
  settings: PageNumberSettings,
  ctx: ProcessContext,
  rasterize?: TextRasterizer,
): Promise<ProcessOutput[]> {
  const [input] = inputs;
  const doc = await openPdfDocument(input.file);
  const plan = await applyPageNumbers(doc, settings, rasterize, undefined, ctx.signal);
  return [
    {
      name: buildOutputName(input.name, { suffix: "numbered", ext: "pdf" }),
      blob: await savePdf(doc),
      sourceIds: [input.id],
      meta: [
        { label: PAGES, value: doc.getPageCount() },
        { label: { ar: "صفحات مرقّمة", en: "Numbered pages" }, value: plan.entries.length },
      ],
    },
  ];
}

// ---- Watermark ----------------------------------------------------------------

export type WatermarkImage = { bytes: Uint8Array; type: "png" | "jpeg"; name: string; width: number; height: number };

export type WatermarkSettings = {
  kind: "text" | "image";
  text: string;
  font: StandardFontName;
  bold: boolean;
  fontSize: number;
  color: string;
  image: WatermarkImage | null;
  /** Image width as a fraction of the page width. */
  imageScale: number;
  opacity: number;
  /** Counter-clockwise degrees. */
  rotation: number;
  position: Anchor;
  tile: boolean;
  /** Space between tiles, points. */
  gap: number;
  margin: number;
  selection: PageSelection;
};

export const DEFAULT_WATERMARK: WatermarkSettings = {
  kind: "text",
  text: "",
  font: "helvetica",
  bold: true,
  fontSize: 48,
  color: "#d33030",
  image: null,
  imageScale: 0.3,
  opacity: 0.25,
  rotation: 45,
  position: "center",
  tile: false,
  gap: 60,
  margin: 36,
  selection: { scope: "all", ranges: "" },
};

/** Centres of tiles covering the page (display space). Rows are offset by half a step. */
export function tileCentres(page: { width: number; height: number }, item: { width: number; height: number }, gap: number) {
  const stepX = Math.max(item.width + gap, 8);
  const stepY = Math.max(item.height + gap, 8);
  const out: { x: number; y: number }[] = [];
  let row = 0;
  for (let y = stepY / 2; y < page.height + stepY / 2; y += stepY, row++) {
    const offset = row % 2 ? stepX / 2 : 0;
    for (let x = stepX / 2 - offset; x < page.width + stepX / 2; x += stepX) out.push({ x, y });
  }
  return out;
}

/** Where (display space) to put watermark item centres on a page. */
export function watermarkCentres(settings: WatermarkSettings, geom: { width: number; height: number }, item: { width: number; height: number }) {
  const bounds = rotatedBounds(item.width, item.height, settings.rotation);
  if (settings.tile) return tileCentres(geom, bounds, settings.gap);
  const at = anchorPoint(settings.position, geom, bounds, settings.margin, settings.margin);
  return [{ x: at.x + bounds.width / 2, y: at.y + bounds.height / 2 }];
}

export async function applyWatermark(
  doc: PDFDocument,
  settings: WatermarkSettings,
  rasterize: TextRasterizer | undefined,
  only?: number,
  signal?: AbortSignal,
) {
  const sel = resolvePages(settings.selection, doc.getPageCount());
  if (!sel.ok) throw userError(sel.error);
  if (!sel.pages.length) throw userError(PDF_ERRORS.noPages);

  let image: PDFImage | null = null;
  let text: Awaited<ReturnType<typeof prepareText>> | null = null;
  if (settings.kind === "image") {
    if (!settings.image) throw userError({ ar: "اختر صورة للعلامة المائية.", en: "Choose an image for the watermark." });
    image = settings.image.type === "png" ? await doc.embedPng(settings.image.bytes) : await doc.embedJpg(settings.image.bytes);
  } else {
    if (!settings.text.trim()) throw userError({ ar: "اكتب نص العلامة المائية.", en: "Type the watermark text." });
    text = await prepareText(doc, settings.text, { fontSize: settings.fontSize, color: settings.color, font: settings.font, bold: settings.bold, align: "center" }, rasterize);
  }

  for (const p of sel.pages) {
    const index = p - 1;
    if (only !== undefined && index !== only) continue;
    if (signal) throwIfCancelled(signal);
    const page = doc.getPage(index);
    await drawInDisplaySpace(page, async (geom: PageGeometry) => {
      const size = image
        ? { width: geom.width * settings.imageScale, height: (geom.width * settings.imageScale * image.height) / image.width }
        : { width: text!.width, height: text!.height };
      for (const c of watermarkCentres(settings, geom, size)) {
        const o = rotatedOrigin(c.x, c.y, size.width, size.height, settings.rotation);
        if (image) {
          const { degrees } = await import("pdf-lib");
          page.drawImage(image, { x: o.x, y: o.y, width: size.width, height: size.height, rotate: degrees(settings.rotation), opacity: settings.opacity });
        } else {
          await drawPreparedText(page, text!, o.x, o.y, { rotate: settings.rotation, opacity: settings.opacity });
        }
      }
    });
  }
  return sel.pages;
}

export async function addWatermark(
  inputs: ProcessInput[],
  settings: WatermarkSettings,
  ctx: ProcessContext,
  rasterize?: TextRasterizer,
): Promise<ProcessOutput[]> {
  const [input] = inputs;
  const doc = await openPdfDocument(input.file);
  await applyWatermark(doc, settings, rasterize, undefined, ctx.signal);
  return [
    {
      name: buildOutputName(input.name, { suffix: "watermarked", ext: "pdf" }),
      blob: await savePdf(doc),
      sourceIds: [input.id],
      meta: [{ label: PAGES, value: doc.getPageCount() }],
    },
  ];
}

// ---- Crop -----------------------------------------------------------------------

/** Margins to cut, in points, measured on the page as the reader sees it. */
export type CropMargins = { top: number; right: number; bottom: number; left: number };
export type CropSettings = { margins: CropMargins; selection: PageSelection };

export const MIN_CROPPED_SIZE = 18; // points (≈ 6 mm)

/** The new CropBox (user space) for a page, or null when the margins leave too little. */
export function cropBoxFor(geom: PageGeometry, m: CropMargins) {
  const width = geom.width - m.left - m.right;
  const height = geom.height - m.top - m.bottom;
  if (width < MIN_CROPPED_SIZE || height < MIN_CROPPED_SIZE || Object.values(m).some((v) => v < 0)) return null;
  return displayRectToUser(geom.box, geom.rotation, { x: m.left, y: m.bottom, width, height });
}

export async function cropPdf(inputs: ProcessInput[], settings: CropSettings, ctx: ProcessContext): Promise<ProcessOutput[]> {
  const [input] = inputs;
  const doc = await openPdfDocument(input.file);
  const sel = resolvePages(settings.selection, doc.getPageCount());
  if (!sel.ok) throw userError(sel.error);
  if (!sel.pages.length) throw userError(PDF_ERRORS.noPages);
  for (const p of sel.pages) {
    throwIfCancelled(ctx.signal);
    const page = doc.getPage(p - 1);
    const box = cropBoxFor(pageGeometry(page), settings.margins);
    if (!box) {
      throw userError({
        ar: `الهوامش أكبر من الصفحة ${p}. قلّلها ثم أعد المحاولة.`,
        en: `The margins are larger than page ${p}. Reduce them and try again.`,
      });
    }
    page.setCropBox(box.x, box.y, box.width, box.height);
  }
  return [
    {
      name: buildOutputName(input.name, { suffix: "cropped", ext: "pdf" }),
      blob: await savePdf(doc),
      sourceIds: [input.id],
      meta: [{ label: { ar: "صفحات مقصوصة", en: "Pages cropped" }, value: sel.pages.length }],
    },
  ];
}
