// Compress PDF engine. Runs inside the Web Worker (and in Node tests); it never
// rasterises a page. The main thread checks the result (compress-result.ts).

import { PDFDict, PDFDocument, PDFName, PDFParser, PDFWriter } from "pdf-lib";
import type { CompressReport, CompressSettings, CompressStage } from "./compress-settings";
import { recompressImages, type ImageCodec } from "./image-recompress";
import { optimizeWithQpdf, qpdfEncryption, type QpdfFactory, type QpdfInstance } from "./qpdf";

export class CompressError extends Error {
  constructor(public code: "password" | "damaged") {
    super(code);
    this.name = "CompressError";
  }
}

/** Runs the full engine on one PDF. Throws CompressError for password-protected or unreadable files. */
export async function compressPdfBytes(
  input: Uint8Array,
  settings: CompressSettings,
  deps: { qpdf: QpdfFactory; codec?: ImageCodec },
  onProgress?: (stage: CompressStage, done: number, total: number) => void,
): Promise<{ bytes: Uint8Array; report: CompressReport }> {
  onProgress?.("reading", 0, 1);
  const encryption = await detectEncryption(deps.qpdf, input);

  const report: CompressReport = { encryption, images: null, imagesSkipped: null, repaired: false };
  let staged: Uint8Array | null = null;
  if (settings.images) {
    if (encryption !== "none") report.imagesSkipped = "encrypted";
    else if (!deps.codec) report.imagesSkipped = "unsupported";
    else {
      try {
        const quality = Math.min(0.95, Math.max(0.3, settings.quality / 100));
        const result = await recompressImages(input, { maxDpi: settings.maxDpi, quality }, deps.codec, (d, t) => onProgress?.("images", d, t));
        report.images = result.stats;
        if (result.bytes !== input) staged = result.bytes;
      } catch {
        // pdf-lib couldn't parse this file: only the lossless step runs.
        report.imagesSkipped = "unsupported";
      }
    }
  }

  onProgress?.("optimizing", 0, 1);
  let result = staged ? await optimize(deps.qpdf, staged) : null;
  if (!result) {
    if (staged) {
      report.images = null;
      report.imagesSkipped = "unsupported";
    }
    result = await optimize(deps.qpdf, input);
  }
  if (!result && encryption === "none") {
    // qpdf can't repair files in this build; pdf-lib reads objects even when the
    // cross-reference table is broken, so rebuild the file and try once more.
    const rebuilt = await rebuildWithPdfLib(input);
    if (rebuilt) {
      result = await optimize(deps.qpdf, rebuilt);
      report.repaired = !!result;
    }
  }
  if (!result) throw new CompressError("damaged");
  report.repaired ||= result.warnings;
  onProgress?.("optimizing", 1, 1);
  return { bytes: result.bytes, report };
}

// A qpdf instance isn't reliable after a command fails, so every command gets a new one.
async function fresh(factory: QpdfFactory, bytes: Uint8Array): Promise<QpdfInstance> {
  const q = await factory();
  q.FS.writeFile("/in.pdf", bytes);
  return q;
}

async function optimize(factory: QpdfFactory, bytes: Uint8Array): Promise<{ bytes: Uint8Array; warnings: boolean } | null> {
  const q = await fresh(factory, bytes);
  const result = optimizeWithQpdf(q, "/in.pdf", "/out.pdf");
  return result.ok ? { bytes: q.FS.readFile("/out.pdf").slice(), warnings: result.warnings } : null;
}

async function detectEncryption(factory: QpdfFactory, input: Uint8Array): Promise<CompressReport["encryption"]> {
  const fromQpdf = qpdfEncryption(await fresh(factory, input), "/in.pdf");
  if (fromQpdf === "password") throw new CompressError("password");
  if (fromQpdf === "no-password") return "no-password";
  // Not conclusive (see qpdfEncryption): an encrypted file that qpdf couldn't open needs a password.
  try {
    const doc = await PDFDocument.load(input, { ignoreEncryption: true, updateMetadata: false });
    if (doc.isEncrypted) throw new CompressError("password");
  } catch (error) {
    if (error instanceof CompressError) throw error;
    // Unparseable: the optimisation step reports it as damaged.
  }
  return "none";
}

/**
 * Re-serialises a damaged file with pdf-lib's parser, which reads objects in order and
 * doesn't need a valid cross-reference table. If the trailer was lost (common when a
 * cross-reference stream is broken), the document catalog is found by its /Type.
 */
async function rebuildWithPdfLib(input: Uint8Array): Promise<Uint8Array | null> {
  try {
    const context = await PDFParser.forBytesWithOptions(input).parseDocument();
    if (context.trailerInfo.Encrypt) return null;
    if (!context.lookupMaybe(context.trailerInfo.Root, PDFDict)) {
      const catalog = context.enumerateIndirectObjects().find(([, obj]) => obj instanceof PDFDict && obj.get(PDFName.of("Type")) === PDFName.of("Catalog"));
      if (!catalog) return null;
      context.trailerInfo.Root = catalog[0];
    }
    return await PDFWriter.forContext(context, Infinity).serializeToBuffer();
  } catch {
    return null;
  }
}
