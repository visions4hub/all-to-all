// Test helpers (imported by *.test.ts only): build fixture PDFs and read results back.

import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import type { ProcessContext, ProcessInput, ProcessOutput } from "@/lib/engine/types";

let n = 0;

/** A PDF whose page i (1-based) shows the text "Page i" (selectable). */
export async function makePdf(
  pages: number,
  opts: { size?: [number, number]; label?: string; rotate?: number[]; title?: string } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const [w, h] = opts.size ?? [595, 842];
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([w, h]);
    page.drawText(`${opts.label ?? "Page"} ${i}`, { x: 50, y: h - 80, size: 24, font });
    if (opts.rotate?.[i - 1]) page.setRotation(degrees(opts.rotate[i - 1]));
  }
  if (opts.title) doc.setTitle(opts.title);
  return doc.save();
}

export function asInput(bytes: Uint8Array, name = "تقرير الطالب.pdf", kind: ProcessInput["kind"] = "pdf"): ProcessInput {
  const file = new File([bytes as Uint8Array<ArrayBuffer>], name, { type: kind === "pdf" ? "application/pdf" : `image/${kind}` });
  return { id: `in${n++}`, file, name, kind };
}

export function ctx(): ProcessContext & { progress: unknown[] } {
  const progress: unknown[] = [];
  return { signal: new AbortController().signal, onProgress: (p) => progress.push(p), progress };
}

export async function openOutput(out: ProcessOutput): Promise<PDFDocument> {
  expectPdfBlob(out.blob);
  return PDFDocument.load(new Uint8Array(await out.blob.arrayBuffer()));
}

function expectPdfBlob(blob: Blob) {
  if (blob.type !== "application/pdf") throw new Error(`Expected a PDF blob, got ${blob.type}`);
}

type PdfJsModule = typeof import("pdfjs-dist");
let pdfjs: Promise<PdfJsModule> | null = null;

/** PDF.js (legacy Node build) for reading text back out of results. */
export function nodePdfJs(): Promise<PdfJsModule> {
  pdfjs ??= (import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<PdfJsModule>).then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("../../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).href;
    return m;
  });
  return pdfjs;
}

export async function openWithPdfJs(bytes: Uint8Array | Blob) {
  const m = await nodePdfJs();
  const data = bytes instanceof Blob ? new Uint8Array(await bytes.arrayBuffer()) : bytes.slice();
  return m.getDocument({ data, useSystemFonts: false }).promise;
}

/** Text of every page, as PDF.js extracts it. */
export async function pageTexts(bytes: Uint8Array | Blob): Promise<string[]> {
  const doc = await openWithPdfJs(bytes);
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out.push(
      content.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  await doc.loadingTask.destroy();
  return out;
}

/** Raw content of a page's streams (decoded), for checking what was drawn. */
export async function pageContent(doc: PDFDocument, index: number): Promise<string> {
  const { PDFArray, PDFRawStream, PDFName, decodePDFRawStream, PDFRef } = await import("pdf-lib");
  const page = doc.getPage(index);
  const contents = page.node.get(PDFName.of("Contents"));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let text = "";
  for (const ref of refs) {
    const obj = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
    if (obj instanceof PDFRawStream) text += new TextDecoder("latin1").decode(decodePDFRawStream(obj).decode()) + "\n";
    else if (obj && "getContentsString" in obj) text += (obj as { getContentsString(): string }).getContentsString() + "\n";
  }
  return text;
}

/** Number of distinct image XObjects a page uses. */
export async function pageImageCount(doc: PDFDocument, index: number): Promise<number> {
  const { PDFDict, PDFName } = await import("pdf-lib");
  const resources = doc.getPage(index).node.Resources();
  const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  if (!xobjects) return 0;
  const images = new Set<string>();
  for (const [, ref] of xobjects.entries()) {
    const obj = doc.context.lookup(ref);
    const dict = obj && "dict" in obj ? (obj as { dict: { get(name: unknown): unknown } }).dict : undefined;
    if (String(dict?.get(PDFName.of("Subtype"))) === "/Image") images.add(ref.toString());
  }
  return images.size;
}

/** A tiny valid PNG (1×1, opaque red). */
export const RED_PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);
