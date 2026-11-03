import type { PDFDocument } from "pdf-lib";
import { PDF_ERRORS, userError } from "./errors";

// pdf-lib is imported on first use, so a tool page renders before the library arrives.
type PdfLib = typeof import("pdf-lib");
let libPromise: Promise<PdfLib> | null = null;

export function loadPdfLib(): Promise<PdfLib> {
  libPromise ??= import("pdf-lib");
  return libPromise;
}

export type PdfSource = Blob | ArrayBuffer | Uint8Array;

async function toBytes(source: PdfSource): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  return new Uint8Array(await source.arrayBuffer());
}

/**
 * Opens a PDF for editing. Encrypted files are refused: pdf-lib cannot decrypt,
 * and writing one back would produce a broken file.
 */
export async function openPdfDocument(source: PdfSource): Promise<PDFDocument> {
  const { PDFDocument } = await loadPdfLib();
  const bytes = await toBytes(source);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    throw userError(PDF_ERRORS.damaged);
  }
  if (doc.isEncrypted) throw userError(PDF_ERRORS.encrypted);
  let count = 0;
  try {
    count = doc.getPageCount();
  } catch {
    throw userError(PDF_ERRORS.damaged);
  }
  if (count === 0) throw userError(PDF_ERRORS.empty);
  return doc;
}

export async function createPdfDocument(): Promise<PDFDocument> {
  const { PDFDocument } = await loadPdfLib();
  return PDFDocument.create({ updateMetadata: false });
}

/** Saves a document as a PDF Blob, recording this site as the producer. */
export async function savePdf(doc: PDFDocument, options: { updateFieldAppearances?: boolean } = {}): Promise<Blob> {
  doc.setProducer("All To All (pdf-lib)");
  doc.setModificationDate(new Date());
  const bytes = await doc.save({ updateFieldAppearances: options.updateFieldAppearances ?? false });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
}
