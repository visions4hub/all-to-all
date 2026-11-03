// PDF → images: each page is rendered by PDF.js onto a canvas (browser only).
// This draws whole pages; it does not pull out the pictures embedded in the PDF.

import { throwIfCancelled, type ProcessContext, type ProcessInput, type ProcessOutput } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import { PDF_ERRORS, userError } from "./errors";
import { resolvePages, type PageSelection } from "./page-selection";

export type PdfToImageSettings = { format: "jpeg" | "png"; dpi: number; quality: number; selection: PageSelection };
export const DEFAULT_PDF_TO_IMAGE: PdfToImageSettings = { format: "jpeg", dpi: 150, quality: 0.9, selection: { scope: "all", ranges: "" } };

export const MIN_DPI = 36;
export const MAX_DPI = 600;
/** Largest canvas we try: safe on desktop browsers; iOS Safari allows ~16.7 MP. */
export const MAX_CANVAS_PIXELS = 16_777_216;
export const MAX_CANVAS_SIDE = 16_384;

export function pixelSize(widthPt: number, heightPt: number, dpi: number) {
  const scale = dpi / 72;
  return { scale, width: Math.max(1, Math.floor(widthPt * scale)), height: Math.max(1, Math.floor(heightPt * scale)) };
}

export function fitsCanvas(width: number, height: number) {
  return width <= MAX_CANVAS_SIDE && height <= MAX_CANVAS_SIDE && width * height <= MAX_CANVAS_PIXELS;
}

/** Highest DPI at which a page of this size still fits on a canvas. */
export function maxDpiFor(widthPt: number, heightPt: number) {
  const byArea = Math.sqrt(MAX_CANVAS_PIXELS / (widthPt * heightPt)) * 72;
  const bySide = (MAX_CANVAS_SIDE / Math.max(widthPt, heightPt)) * 72;
  return Math.floor(Math.min(byArea, bySide));
}

export function imageName(pdfName: string, page: number, total: number, format: "jpeg" | "png") {
  const digits = String(total).length;
  return buildOutputName(pdfName, { suffix: `page-${String(page).padStart(digits, "0")}`, ext: format === "jpeg" ? "jpg" : "png" });
}

export async function pdfToImages(inputs: ProcessInput[], settings: PdfToImageSettings, ctx: ProcessContext): Promise<ProcessOutput[]> {
  const { openPdf, PdfOpenError } = await import("@/lib/pdf/pdfjs");
  const [input] = inputs;
  if (!(settings.dpi >= MIN_DPI && settings.dpi <= MAX_DPI)) {
    throw userError({ ar: `اختر دقة بين ${MIN_DPI} و${MAX_DPI} نقطة/بوصة.`, en: `Choose a resolution between ${MIN_DPI} and ${MAX_DPI} DPI.` });
  }
  let doc: Awaited<ReturnType<typeof openPdf>>;
  try {
    doc = await openPdf(await input.file.arrayBuffer());
  } catch (error) {
    throw userError(error instanceof PdfOpenError && error.code === "password" ? PDF_ERRORS.encrypted : PDF_ERRORS.damaged);
  }
  const outputs: ProcessOutput[] = [];
  const canvas = document.createElement("canvas");
  try {
    const sel = resolvePages(settings.selection, doc.numPages);
    if (!sel.ok) throw userError(sel.error);
    if (!sel.pages.length) throw userError(PDF_ERRORS.noPages);
    for (let i = 0; i < sel.pages.length; i++) {
      throwIfCancelled(ctx.signal);
      const n = sel.pages[i];
      ctx.onProgress({ done: i, total: sel.pages.length, label: `${input.name} · ${n}` });
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const size = pixelSize(base.width, base.height, settings.dpi);
      if (!fitsCanvas(size.width, size.height)) {
        const max = maxDpiFor(base.width, base.height);
        throw userError({
          ar: `الصفحة ${n} كبيرة جداً بهذه الدقة على هذا الجهاز. اختر ${max} نقطة/بوصة أو أقل.`,
          en: `Page ${n} is too large at this resolution for this device. Choose ${max} DPI or less.`,
        });
      }
      const viewport = page.getViewport({ scale: size.scale });
      canvas.width = size.width;
      canvas.height = size.height;
      const c2d = canvas.getContext("2d");
      if (!c2d) throw new Error("Canvas is not available.");
      c2d.fillStyle = "#ffffff"; // JPG has no transparency; PNG gets a white page like a printout
      c2d.fillRect(0, 0, size.width, size.height);
      await page.render({ canvas, canvasContext: c2d, viewport }).promise;
      page.cleanup();
      const type = settings.format === "jpeg" ? "image/jpeg" : "image/png";
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, settings.quality));
      if (!blob) throw userError({ ar: "نفدت ذاكرة المتصفح أثناء إنشاء الصورة.", en: "The browser ran out of memory creating the image." });
      outputs.push({
        name: imageName(input.name, n, doc.numPages, settings.format),
        blob,
        sourceIds: [input.id],
        meta: [
          { label: { ar: "الصفحة", en: "Page" }, value: n },
          { label: { ar: "الأبعاد", en: "Size" }, value: `${size.width}×${size.height}` },
        ],
      });
    }
  } finally {
    canvas.width = canvas.height = 0;
    await doc.loadingTask.destroy();
  }
  return outputs;
}
