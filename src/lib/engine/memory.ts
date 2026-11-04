import type { ProcessMode } from "./types";

// Rough peak-memory estimate for a job, used only to warn before a clearly
// memory-heavy run (spec 12). It never blocks anything: the user can always
// go ahead, and a real out-of-memory failure is still reported clearly.

export type MemoryInput = {
  size: number;
  kind: string;
  pageCount?: number;
  width?: number;
  height?: number;
};

/** Bytes of one decoded RGBA image. */
const pixelsBytes = (w: number, h: number) => w * h * 4;

// A decoded image usually exists ~3 times at the peak: the decoded bitmap, the
// working canvas, and a pixel read-back or the encoder's copy.
const IMAGE_COPIES = 3;
// PDF parsers (pdf-lib, PDF.js) hold the bytes plus an object tree several times larger.
const PDF_FACTOR = 4;
// Before an image's pixel size is known (it is read lazily, as the file scrolls
// into view), its decoded size is guessed from the file: camera JPEGs and WebPs
// are roughly a tenth of their decoded RGBA size.
const RASTER = new Set(["jpeg", "png", "webp", "gif", "bmp"]);
const DECODED_PER_FILE_BYTE = 10;

/** Working memory of one file while it is processed, and what stays of it in a batch. */
function itemCost(f: MemoryInput): { peak: number; kept: number } {
  const decoded = f.width && f.height ? pixelsBytes(f.width, f.height) : RASTER.has(f.kind) ? f.size * DECODED_PER_FILE_BYTE : 0;
  if (decoded) return { peak: decoded * IMAGE_COPIES, kept: decoded };
  if (f.kind === "pdf") return { peak: f.size * PDF_FACTOR, kept: f.size * PDF_FACTOR };
  return { peak: f.size * 2, kept: f.size };
}

/**
 * Estimated peak bytes. Inputs stay in memory for the whole run and outputs
 * pile up next to them (about the inputs' size again). Per-file tools work on
 * one file at a time, so only the largest one counts on top. Batch tools (merge,
 * GIF, images to PDF…) keep every file's decoded / parsed form until the end,
 * plus the one being worked on.
 */
export function estimatePeakMemory(files: MemoryInput[], mode: ProcessMode): number {
  if (!files.length) return 0;
  const held = files.reduce((n, f) => n + f.size, 0) * 2;
  const costs = files.map(itemCost);
  const largest = Math.max(...costs.map((c) => c.peak));
  return held + largest + (mode === "batch" ? costs.reduce((n, c) => n + c.kept, 0) : 0);
}

const GB = 1024 ** 3;

/**
 * The budget a single tab can comfortably use on this device: a quarter of the
 * device memory the browser reports (Chrome caps the report at 8 GB). Browsers
 * that don't say (Firefox, Safari) get the budget of a 4 GB device.
 */
export function memoryBudget(deviceMemoryGB: number | undefined): number {
  const gb = deviceMemoryGB && deviceMemoryGB > 0 ? deviceMemoryGB : 4;
  return (gb * GB) / 4;
}

export type MemoryLevel = "ok" | "high";

export function memoryLevel(peak: number, budget: number): MemoryLevel {
  return peak > budget ? "high" : "ok";
}

/** Reads navigator.deviceMemory where it exists. */
export function deviceMemoryGB(): number | undefined {
  if (typeof navigator === "undefined") return undefined;
  const value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof value === "number" ? value : undefined;
}
