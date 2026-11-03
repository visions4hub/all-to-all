// Heavy pixel work, run in the image worker (or on the main thread as a fallback).

import { encodeIndexed, encodePng, quantize, type PngInfo } from "./png";
import { applyAdjustments, gaussianBlur, pixelate, type Adjustments, type Pixels } from "./pixels";

export type Job =
  | { op: "ping" }
  | { op: "adjust"; px: Pixels; adj: Adjustments }
  | { op: "blur"; px: Pixels; radius: number }
  | { op: "pixelate"; px: Pixels; block: number }
  | { op: "png"; px: Pixels }
  | { op: "png-quantized"; px: Pixels; colors: number; dither: boolean };

export type JobResult =
  | { op: "ping" }
  | { op: "pixels"; px: Pixels }
  | { op: "png"; bytes: Uint8Array; info: PngInfo };

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
      const { bytes, info } = await encodePng(job.px);
      return { op: "png", bytes, info };
    }
    case "png-quantized": {
      const { indices, palette } = quantize(job.px, job.colors, job.dither);
      const bytes = await encodeIndexed(indices, palette, job.px.width, job.px.height);
      return { op: "png", bytes, info: { kind: "palette", colors: palette.length / 4, bitDepth: 8 } };
    }
  }
}

/** Buffers to transfer (not copy) along with a job or result. */
export function transferables(value: Job | JobResult): Transferable[] {
  if ("px" in value) return [value.px.data.buffer as ArrayBuffer];
  if ("bytes" in value) return [value.bytes.buffer as ArrayBuffer];
  return [];
}
