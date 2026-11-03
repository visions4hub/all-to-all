// Detects a file's real type from its first bytes (magic numbers),
// not from its name or the browser-reported MIME type.

export type FileKind =
  | "pdf"
  | "jpeg"
  | "png"
  | "webp"
  | "gif"
  | "svg"
  | "bmp"
  | "heic"
  | "avif"
  | "tiff"
  | "unknown";

export type FileGroup = "pdf" | "image" | "other";

export const KIND_INFO: Record<FileKind, { mime: string; ext: string; group: FileGroup; label: string }> = {
  pdf: { mime: "application/pdf", ext: "pdf", group: "pdf", label: "PDF" },
  jpeg: { mime: "image/jpeg", ext: "jpg", group: "image", label: "JPG" },
  png: { mime: "image/png", ext: "png", group: "image", label: "PNG" },
  webp: { mime: "image/webp", ext: "webp", group: "image", label: "WebP" },
  gif: { mime: "image/gif", ext: "gif", group: "image", label: "GIF" },
  svg: { mime: "image/svg+xml", ext: "svg", group: "image", label: "SVG" },
  bmp: { mime: "image/bmp", ext: "bmp", group: "image", label: "BMP" },
  heic: { mime: "image/heic", ext: "heic", group: "image", label: "HEIC" },
  avif: { mime: "image/avif", ext: "avif", group: "image", label: "AVIF" },
  tiff: { mime: "image/tiff", ext: "tiff", group: "image", label: "TIFF" },
  unknown: { mime: "application/octet-stream", ext: "", group: "other", label: "?" },
};

/** Number of leading bytes needed by detectKindFromBytes. */
export const SNIFF_BYTES = 1024;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

export function detectKindFromBytes(bytes: Uint8Array): FileKind {
  if (bytes.length < 4) return "unknown";
  const b = bytes;

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "png";
  if (ascii(b, 0, 4) === "GIF8") return "gif";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (b[0] === 0x42 && b[1] === 0x4d && b.length >= 14) return "bmp";
  if (
    (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
    (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)
  )
    return "tiff";

  // ISO-BMFF containers: "ftyp" at offset 4, the brand decides HEIC vs AVIF.
  if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (brand === "avif" || brand === "avis") return "avif";
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return "heic";
  }

  // The PDF header may be preceded by junk; readers accept it within the first 1024 bytes.
  if (ascii(b, 0, Math.min(b.length, SNIFF_BYTES)).includes("%PDF-")) return "pdf";

  // SVG is text: skip BOM / XML prolog / comments / doctype; the root element must be <svg>
  // (an HTML page with an inline <svg> is not an SVG file).
  const text = new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(0, Math.min(b.length, SNIFF_BYTES)));
  const root = text
    .replace(/^﻿/, "")
    .replace(/^(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>)*/i, "");
  if (/^<svg[\s>/]/i.test(root)) return "svg";

  return "unknown";
}

export async function detectFileKind(file: Blob): Promise<FileKind> {
  const buffer = await file.slice(0, SNIFF_BYTES).arrayBuffer();
  return detectKindFromBytes(new Uint8Array(buffer));
}

/** Formats every browser we target can decode with <img> / canvas. */
export const BROWSER_DECODABLE: FileKind[] = ["jpeg", "png", "webp", "gif", "svg", "bmp"];

export function groupOf(kind: FileKind): FileGroup {
  return KIND_INFO[kind].group;
}
