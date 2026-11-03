"use client";

import type { ProcessInput, ProcessOutput } from "@/lib/engine/types";
import { throwIfCancelled } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import type { Localized } from "@/lib/i18n";
import { createCanvas, decodeImage, drawScaled, encodeCanvas, fillBackground, getPixels, releaseCanvas } from "./canvas";
import { FORMAT_INFO, type OutputFormat } from "./format";
import type { Size } from "./geometry";
import { runImageJob } from "./worker-client";

/** Decodes an input into a canvas (optionally resized). EXIF orientation is applied. */
export async function loadToCanvas(
  input: ProcessInput,
  target?: Size | ((src: Size) => Size),
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; src: Size }> {
  const decoded = await decodeImage(input.file);
  try {
    const src = { width: decoded.width, height: decoded.height };
    const size = typeof target === "function" ? target(src) : target;
    if (size && (size.width !== src.width || size.height !== src.height)) {
      const canvas = drawScaled(decoded.source, src, size);
      return { canvas, ctx: canvas.getContext("2d")!, src };
    }
    const { canvas, ctx } = createCanvas(src.width, src.height);
    ctx.drawImage(decoded.source, 0, 0);
    return { canvas, ctx, src };
  } finally {
    decoded.close();
  }
}

/**
 * Encodes a finished canvas. JPG has no transparency, so transparent areas are
 * filled with `background` first. PNG goes through our own encoder (smallest
 * exact encoding), which runs in the worker.
 */
export async function exportCanvas(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  { quality = 92, background = "#ffffff", signal }: { quality?: number; background?: string; signal?: AbortSignal } = {},
): Promise<Blob> {
  if (format === "jpeg") fillBackground(canvas.getContext("2d")!, canvas.width, canvas.height, background);
  if (format === "png") {
    const result = await runImageJob({ op: "png", px: getPixels(canvas) }, signal);
    if (result.op !== "png") throw new Error("Unexpected worker result");
    return new Blob([result.bytes as BlobPart], { type: "image/png" });
  }
  return encodeCanvas(canvas, format, quality / 100);
}

export function outputName(input: ProcessInput, suffix: string, format: OutputFormat) {
  return buildOutputName(input.name, { suffix, ext: FORMAT_INFO[format].ext });
}

export const META = {
  size: (s: Size) => ({ label: { ar: "الأبعاد", en: "Size" } as Localized, value: `${s.width}×${s.height}` }),
  format: (f: OutputFormat) => ({ label: { ar: "الصيغة", en: "Format" } as Localized, value: FORMAT_INFO[f].label }),
};

/** Common end of a single-canvas tool: encode, release, describe. */
export async function finishCanvas(
  input: ProcessInput,
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  opts: { suffix: string; quality?: number; background?: string; signal: AbortSignal; meta?: ProcessOutput["meta"] },
): Promise<ProcessOutput> {
  try {
    throwIfCancelled(opts.signal);
    const blob = await exportCanvas(canvas, format, opts);
    return {
      name: outputName(input, opts.suffix, format),
      blob,
      sourceIds: [input.id],
      meta: [META.size({ width: canvas.width, height: canvas.height }), META.format(format), ...(opts.meta ?? [])],
    };
  } finally {
    releaseCanvas(canvas);
  }
}
