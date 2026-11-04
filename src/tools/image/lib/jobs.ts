// Heavy pixel work, run in the image worker (or on the main thread as a fallback).

import { encodeGif, type GifJob } from "./gif";
import { encodeIndexed, encodePng, quantize, type PngInfo } from "./png";
import { applyAdjustments, gaussianBlur, pixelate, type Adjustments, type Pixels } from "./pixels";

/**
 * Pixels for a job: either read already, or an ImageBitmap snapshot of a canvas
 * that the worker reads itself, so the slow read-back of a large canvas doesn't
 * freeze the page (see pixelSource in canvas.ts).
 */
export type PixelSource = Pixels | { bitmap: ImageBitmap; width: number; height: number };

/** Turns a PixelSource into pixels (in the worker, or on the main thread as the fallback). */
export function readPixelSource(src: PixelSource): Pixels {
  if (!("bitmap" in src)) return src;
  const { bitmap, width, height } = src;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, width, height);
  canvas.width = canvas.height = 0;
  return { data: img.data, width, height };
}

export type Job =
  | { op: "ping" }
  | { op: "adjust"; px: Pixels; adj: Adjustments }
  | { op: "blur"; px: Pixels; radius: number }
  | { op: "pixelate"; px: Pixels; block: number }
  | { op: "png"; px: PixelSource }
  | { op: "png-quantized"; px: PixelSource; colors: number; dither: boolean }
  | ({ op: "gif" } & GifJob);

export type JobResult =
  | { op: "ping" }
  | { op: "pixels"; px: Pixels }
  | { op: "png"; bytes: Uint8Array; info: PngInfo }
  | { op: "gif"; bytes: Uint8Array };

export async function runJob(job: Job): Promise<JobResult> {
  switch (job.op) {
    case "ping":
      return { op: "ping" };
    case "adjust":
      applyAdjustments(job.px, job.adj);
      return { op: "pixels", px: job.px };
    case "blur":
      gaussianBlur(job.px, job.radius);
      return { op: "pixels", px: job.px };
    case "pixelate":
      pixelate(job.px, job.block);
      return { op: "pixels", px: job.px };
    case "png": {
      const { bytes, info } = await encodePng(readPixelSource(job.px));
      return { op: "png", bytes, info };
    }
    case "png-quantized": {
      const px = readPixelSource(job.px);
      const { indices, palette } = quantize(px, job.colors, job.dither);
      const bytes = await encodeIndexed(indices, palette, px.width, px.height);
      return { op: "png", bytes, info: { kind: "palette", colors: palette.length / 4, bitDepth: 8 } };
    }
    case "gif":
      return { op: "gif", bytes: encodeGif(job) };
  }
}

/** Buffers to transfer (not copy) along with a job or result. */
export function transferables(value: Job | JobResult): Transferable[] {
  if ("px" in value) return "bitmap" in value.px ? [value.px.bitmap] : [value.px.data.buffer as ArrayBuffer];
  if ("frames" in value) return value.frames.map((f) => f.data.buffer as ArrayBuffer);
  if ("bytes" in value) return [value.bytes.buffer as ArrayBuffer];
  return [];
}
