// Lossless metadata removal with a self-check: the result is read back, and it
// must contain only what we chose to keep, with the same image size.

import { readMetadata, stripMetadata } from "./index";
import { blockLabel } from "./describe";
import type { Block, MetadataReport, StripOptions, StripResult } from "./types";
import { formatBytes } from "@/lib/files/format";
import type { Localized } from "@/lib/i18n";

export async function cleanLossless(bytes: Uint8Array, report: MetadataReport, opts: StripOptions): Promise<StripResult> {
  const result = stripMetadata(bytes, opts, report.orientation);
  const after = await readMetadata(result.bytes);
  const leftovers = after.blocks.filter((b) => !(b.kind === "icc" && opts.keepIcc) && !(b.kind === "exif" && result.orientationKept));
  if (leftovers.length || after.width !== report.width || after.height !== report.height) {
    throw new Error("Metadata self-check failed");
  }
  if (result.orientationKept && after.exif && Object.keys(after.exif.tags).some((k) => k !== "Orientation")) {
    throw new Error("Metadata self-check failed");
  }
  return result;
}

/** "EXIF (camera, date, location) · 1.2 KB, XMP · 3 KB" in one language. Repeated kinds are merged. */
export function summarizeBlocks(blocks: Block[], pick: (l: Localized) => string): string {
  const merged = new Map<string, { label: string; bytes: number; count: number }>();
  for (const b of blocks) {
    const label = pick(blockLabel({ kind: b.kind, bytes: b.bytes, detail: b.kind === "text" || b.kind === "app" ? b.detail : undefined }));
    const m = merged.get(label) ?? { label, bytes: 0, count: 0 };
    m.bytes += b.bytes;
    m.count++;
    merged.set(label, m);
  }
  return [...merged.values()].map((m) => `${m.label}${m.count > 1 ? ` ×${m.count}` : ""} · ${formatBytes(m.bytes)}`).join(pick({ ar: "، ", en: ", " }));
}
