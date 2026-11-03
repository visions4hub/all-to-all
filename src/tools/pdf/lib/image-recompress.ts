// Optional, lossy part of Compress PDF: re-encodes large photos inside the PDF.
//
// Only image XObjects used by pages are touched; text, vector graphics and page
// content streams are never changed, so pages are never turned into pictures.
// An image is replaced only when the new version is smaller.
//
// Downsampling uses a safe bound: an image is never reduced below `maxDpi` for the
// largest page it appears on, i.e. it keeps at least maxDpi × (page's long side in
// inches) pixels on its long side. An image shown smaller than the page keeps more
// pixels than strictly needed — less saving, but never more loss than chosen.

import * as pdfLib from "pdf-lib";
import type { PDFDict, PDFDocument, PDFObject, PDFRef } from "pdf-lib";
import type { ImageStats } from "./compress-settings";

/** Pixels the codec receives: either the original JPEG bytes, or decoded RGBA. */
export type ImageSource =
  | { kind: "jpeg"; bytes: Uint8Array; width: number; height: number }
  | { kind: "pixels"; rgba: Uint8ClampedArray; width: number; height: number };

export type EncodedImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  filter: "DCTDecode" | "FlateDecode";
  components: 1 | 3;
};

/** Decodes/resizes/encodes images. The browser uses canvas; tests use a pure-JS codec. */
export type ImageCodec = {
  encode(source: ImageSource, target: { width: number; height: number }, quality: number): Promise<EncodedImage | null>;
};

export type ImageOptions = { maxDpi: number; quality: number };


/** Images smaller than this (stream bytes) aren't worth re-encoding. */
const MIN_STREAM_BYTES = 8 * 1024;
/** Larger images are skipped rather than risking running out of memory. */
const MAX_PIXELS = 80_000_000;

/** Pixel size that keeps at least `maxDpi` across a page whose long side is `pageLongPt` points. */
export function targetSize(width: number, height: number, pageLongPt: number, maxDpi: number): { width: number; height: number } {
  const maxLongPx = Math.ceil((pageLongPt / 72) * maxDpi);
  const scale = Math.min(1, maxLongPx / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Removes EXIF (APP1) segments so a decoder can't rotate pixels; PDF viewers ignore EXIF. */
export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let removed = false;
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker === 0xda || marker === 0xd9) break; // start of scan: the rest is image data
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    const end = i + 2 + len;
    if (end > bytes.length) return bytes;
    const isExif = marker === 0xe1 && String.fromCharCode(...bytes.subarray(i + 4, i + 8)) === "Exif";
    if (isExif) removed = true;
    else parts.push(bytes.subarray(i, end));
    i = end;
  }
  if (!removed) return bytes;
  parts.push(bytes.subarray(i));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Inflates zlib (FlateDecode) data with the platform's DecompressionStream. */
export async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reverses PNG row predictors (Predictor 10–15) for 8-bit samples. */
export function unpredictPng(data: Uint8Array, columns: number, colors: number): Uint8Array {
  const bpp = colors;
  const rowLen = columns * colors;
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const src = r * (rowLen + 1) + 1;
    const dst = r * rowLen;
    const prev = dst - rowLen;
    for (let i = 0; i < rowLen; i++) {
      const x = data[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = r > 0 ? out[prev + i] : 0;
      const c = r > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let v: number;
      switch (type) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`Unknown PNG predictor ${type}`);
      }
      out[dst + i] = v & 0xff;
    }
  }
  return out;
}

/** Gray or RGB samples → RGBA. */
export function toRgba(samples: Uint8Array, width: number, height: number, components: 1 | 3): Uint8ClampedArray {
  const n = width * height;
  if (samples.length < n * components) throw new Error("Image data is shorter than its size");
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    if (components === 1) out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = samples[i];
    else {
      out[i * 4] = samples[i * 3];
      out[i * 4 + 1] = samples[i * 3 + 1];
      out[i * 4 + 2] = samples[i * 3 + 2];
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

type Lib = typeof import("pdf-lib");

type Candidate = {
  ref: PDFRef;
  pageLongPt: number;
};

/** Number of colour components for colour spaces we can re-encode, or null. */
function componentsOf(lib: Lib, doc: PDFDocument, cs: PDFObject | undefined): 1 | 3 | null {
  const { PDFName, PDFArray, PDFRawStream, PDFNumber } = lib;
  const value = cs ? doc.context.lookup(cs) : undefined;
  if (value instanceof PDFName) {
    const name = value.decodeText();
    if (name === "DeviceRGB") return 3;
    if (name === "DeviceGray") return 1;
    return null;
  }
  if (value instanceof PDFArray && value.size() >= 2) {
    const family = value.lookup(0);
    if (!(family instanceof PDFName)) return null;
    const name = family.decodeText();
    if (name === "CalRGB") return 3;
    if (name === "CalGray") return 1;
    if (name === "ICCBased") {
      const stream = value.lookup(1);
      const n = stream instanceof PDFRawStream ? stream.dict.lookup(PDFName.of("N")) : undefined;
      const count = n instanceof PDFNumber ? n.asNumber() : 0;
      return count === 3 ? 3 : count === 1 ? 1 : null;
    }
  }
  return null;
}

/** Image XObjects used by pages (also through form XObjects), with the largest page each appears on. */
function collectCandidates(lib: Lib, doc: PDFDocument): { candidates: Candidate[]; masks: Set<string> } {
  const { PDFName, PDFDict, PDFRef, PDFRawStream } = lib;
  const byRef = new Map<string, Candidate>();
  const masks = new Set<string>();

  const visit = (resources: PDFDict | undefined, pageLongPt: number, seen: Set<string>) => {
    const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!xobjects) return;
    for (const [, value] of xobjects.entries()) {
      if (!(value instanceof PDFRef)) continue;
      const key = value.toString();
      const stream = doc.context.lookup(value);
      if (!(stream instanceof PDFRawStream)) continue;
      const subtype = stream.dict.lookup(PDFName.of("Subtype"));
      if (subtype === PDFName.of("Image")) {
        for (const maskKey of ["SMask", "Mask"]) {
          const mask = stream.dict.get(PDFName.of(maskKey));
          if (mask instanceof PDFRef) masks.add(mask.toString());
        }
        const existing = byRef.get(key);
        if (existing) existing.pageLongPt = Math.max(existing.pageLongPt, pageLongPt);
        else byRef.set(key, { ref: value, pageLongPt });
      } else if (subtype === PDFName.of("Form") && !seen.has(key)) {
        seen.add(key);
        visit(stream.dict.lookupMaybe(PDFName.of("Resources"), PDFDict), pageLongPt, seen);
      }
    }
  };

  for (const page of doc.getPages()) {
    const box = page.getMediaBox();
    visit(page.node.Resources(), Math.max(Math.abs(box.width), Math.abs(box.height)), new Set());
  }
  return { candidates: [...byRef.values()].filter((c) => !masks.has(c.ref.toString())), masks };
}

type Prepared = { source: ImageSource; components: 1 | 3; original: number; noResize: boolean };

/** Reads an image we know how to handle, or returns null to leave it alone. */
async function prepare(lib: Lib, doc: PDFDocument, ref: PDFRef): Promise<Prepared | null> {
  const { PDFName, PDFNumber, PDFArray, PDFRawStream, PDFBool, PDFDict } = lib;
  const stream = doc.context.lookup(ref);
  if (!(stream instanceof PDFRawStream)) return null;
  const dict = stream.dict;
  const num = (k: string) => {
    const v = dict.lookup(PDFName.of(k));
    return v instanceof PDFNumber ? v.asNumber() : undefined;
  };
  const width = num("Width");
  const height = num("Height");
  if (!width || !height || width * height > MAX_PIXELS) return null;
  if (stream.contents.length < MIN_STREAM_BYTES) return null;
  if (dict.lookup(PDFName.of("ImageMask")) === PDFBool.True) return null;
  if (num("BitsPerComponent") !== 8) return null;
  if (dict.has(PDFName.of("Decode"))) return null; // inverted/remapped samples
  if (dict.lookup(PDFName.of("Mask")) instanceof PDFArray) return null; // colour-key masking needs exact colours
  const components = componentsOf(lib, doc, dict.get(PDFName.of("ColorSpace")));
  if (!components) return null;

  // An SMask with /Matte must keep the image's exact size.
  const smask = dict.lookup(PDFName.of("SMask"));
  const noResize = smask instanceof PDFRawStream && smask.dict.has(PDFName.of("Matte"));

  let filter = dict.lookup(PDFName.of("Filter"));
  if (filter instanceof PDFArray) filter = filter.size() === 1 ? filter.lookup(0) : undefined;
  let parms = dict.lookup(PDFName.of("DecodeParms"));
  if (parms instanceof PDFArray) parms = parms.size() === 1 ? parms.lookup(0) : undefined;
  const filterName = filter instanceof PDFName ? filter.decodeText() : filter === undefined && !dict.has(PDFName.of("Filter")) ? "none" : null;
  const original = stream.contents.length;

  if (filterName === "DCTDecode") {
    if (parms instanceof PDFDict) return null; // e.g. a non-default ColorTransform
    return { source: { kind: "jpeg", bytes: stripJpegExif(stream.contents), width, height }, components, original, noResize };
  }

  let samples: Uint8Array;
  if (filterName === "none") samples = stream.contents;
  else if (filterName === "FlateDecode") {
    try {
      samples = await inflate(stream.contents);
    } catch {
      return null;
    }
    if (parms instanceof PDFDict) {
      const p = (k: string, d: number) => {
        const v = parms.lookup(PDFName.of(k));
        return v instanceof PDFNumber ? v.asNumber() : d;
      };
      const predictor = p("Predictor", 1);
      if (predictor >= 10) {
        if (p("Colors", 1) !== components || p("BitsPerComponent", 8) !== 8 || p("Columns", 1) !== width) return null;
        samples = unpredictPng(samples, width, components);
      } else if (predictor !== 1) return null;
    }
  } else return null;

  try {
    return { source: { kind: "pixels", rgba: toRgba(samples, width, height, components), width, height }, components, original, noResize };
  } catch {
    return null;
  }
}

/**
 * Re-encodes eligible images in place and returns the saved document.
 * The caller must not pass an encrypted file (pdf-lib can't write one back).
 */
export async function recompressImages(
  bytes: Uint8Array,
  options: ImageOptions,
  codec: ImageCodec,
  onProgress?: (done: number, total: number) => void,
): Promise<{ bytes: Uint8Array; stats: ImageStats }> {
  const lib = pdfLib;
  const { PDFDocument, PDFName, PDFNumber, PDFRawStream } = lib;
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const { candidates } = collectCandidates(lib, doc);
  const stats: ImageStats = { found: candidates.length, recompressed: 0, bytesBefore: 0, bytesAfter: 0 };

  for (let i = 0; i < candidates.length; i++) {
    onProgress?.(i, candidates.length);
    const { ref, pageLongPt } = candidates[i];
    const prepared = await prepare(lib, doc, ref);
    if (!prepared) continue;
    const { source, components, original, noResize } = prepared;
    const target = noResize ? { width: source.width, height: source.height } : targetSize(source.width, source.height, pageLongPt, options.maxDpi);
    let encoded: EncodedImage | null = null;
    try {
      encoded = await codec.encode(source, target, options.quality);
    } catch {
      encoded = null;
    }
    if (!encoded || encoded.bytes.length >= original) continue;
    if (noResize && (encoded.width !== source.width || encoded.height !== source.height)) continue;

    const old = doc.context.lookup(ref) as pdfLib.PDFRawStream;
    const dict = old.dict.clone(doc.context);
    dict.set(PDFName.of("Width"), PDFNumber.of(encoded.width));
    dict.set(PDFName.of("Height"), PDFNumber.of(encoded.height));
    dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
    dict.set(PDFName.of("Filter"), PDFName.of(encoded.filter));
    dict.delete(PDFName.of("DecodeParms"));
    dict.delete(PDFName.of("Length"));
    if (encoded.components !== components) dict.set(PDFName.of("ColorSpace"), PDFName.of(encoded.components === 3 ? "DeviceRGB" : "DeviceGray"));
    doc.context.assign(ref, PDFRawStream.of(dict, encoded.bytes));
    stats.recompressed++;
    stats.bytesBefore += original;
    stats.bytesAfter += encoded.bytes.length;
  }
  onProgress?.(candidates.length, candidates.length);
  if (!stats.recompressed) return { bytes, stats };
  return { bytes: await doc.save({ useObjectStreams: false, updateFieldAppearances: false }), stats };
}
