"use client";

// Lazy PDF.js loader. The library and its worker are bundled with the site and
// served from our own origin (public/vendor), never from a third-party CDN.

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsPromise;
}

// Data PDF.js fetches on demand, copied to public/vendor/pdfjs by scripts/copy-pdf-worker.mjs.
// Without it, PDFs that don't embed their fonts (or use CJK encodings, JPEG 2000, CMYK) render wrongly.
const PDFJS_RESOURCES = {
  standardFontDataUrl: "/vendor/pdfjs/standard_fonts/",
  cMapUrl: "/vendor/pdfjs/cmaps/",
  cMapPacked: true,
  wasmUrl: "/vendor/pdfjs/wasm/",
  iccUrl: "/vendor/pdfjs/iccs/",
};

export type PdfOpenErrorCode = "password" | "invalid" | "unknown";

export class PdfOpenError extends Error {
  constructor(public code: PdfOpenErrorCode, message: string) {
    super(message);
    this.name = "PdfOpenError";
  }
}

/** Opens a PDF from bytes. Callers must call `doc.loadingTask.destroy()` when finished. */
export async function openPdf(data: ArrayBuffer | Uint8Array) {
  const pdfjs = await loadPdfJs();
  // PDF.js takes ownership of the buffer, so pass a copy to keep the caller's intact.
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0));
  try {
    return await pdfjs.getDocument({ data: bytes, ...PDFJS_RESOURCES }).promise;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "PasswordException") throw new PdfOpenError("password", "This PDF is password-protected.");
    if (name === "InvalidPDFException") throw new PdfOpenError("invalid", "This file is not a valid PDF or is damaged.");
    throw new PdfOpenError("unknown", (error as Error)?.message ?? "Could not open PDF.");
  }
}

/** Renders one page to a canvas at a target CSS width. */
export async function renderPageToCanvas(
  doc: Awaited<ReturnType<typeof openPdf>>,
  pageNumber: number,
  targetWidth: number,
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = targetWidth / base.width;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

/** First-page thumbnail + page count, used for previews. */
export async function pdfThumbnail(file: Blob, width = 320): Promise<{ url: string; pageCount: number }> {
  const doc = await openPdf(await file.arrayBuffer());
  try {
    const canvas = await renderPageToCanvas(doc, 1, width);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    canvas.width = canvas.height = 0; // release canvas memory
    if (!blob) throw new Error("Could not create the preview image.");
    return { url: URL.createObjectURL(blob), pageCount: doc.numPages };
  } finally {
    await doc.loadingTask.destroy();
  }
}
