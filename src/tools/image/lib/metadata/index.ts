// Reading and lossless removal of image metadata, done on the file's bytes.
// No pixel is decoded or re-encoded here.

import { DamagedFileError } from "./bytes";
import { readJpeg, stripJpeg } from "./jpeg";
import { readPng, stripPng } from "./png-meta";
import { readWebp, stripWebp } from "./webp";
import type { MetaFormat, MetadataReport, StripOptions, StripResult } from "./types";

export * from "./types";
export { DamagedFileError } from "./bytes";

export function detectMetaFormat(b: Uint8Array): MetaFormat | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

export async function readMetadata(b: Uint8Array): Promise<MetadataReport> {
  const format = detectMetaFormat(b);
  if (format === "jpeg") return readJpeg(b);
  if (format === "png") return readPng(b);
  if (format === "webp") return readWebp(b);
  throw new DamagedFileError("Unsupported format");
}

/**
 * Removes metadata without touching the image data. `orientation` is the
 * current EXIF orientation (from readMetadata), used when it is kept.
 */
export function stripMetadata(b: Uint8Array, opts: StripOptions, orientation: number | null = null): StripResult {
  const format = detectMetaFormat(b);
  if (format === "jpeg") return stripJpeg(b, opts, orientation);
  if (format === "png") return stripPng(b, opts, orientation);
  if (format === "webp") return stripWebp(b, opts, orientation);
  throw new DamagedFileError("Unsupported format");
}
