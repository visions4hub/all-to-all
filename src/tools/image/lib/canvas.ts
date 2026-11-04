"use client";

// Browser helpers for decoding, drawing and encoding images with <canvas>.
// Every canvas made here should be released with releaseCanvas() when done,
// so large images don't keep memory alive.

import { MESSAGES, userError } from "./errors";
import { FORMAT_INFO, sniffFormat, type OutputFormat } from "./format";
import { stepDownPlan, type Size } from "./geometry";
import type { PixelSource } from "./jobs";
import type { Pixels } from "./pixels";

export type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

/**
 * Decodes an image file. Camera EXIF orientation is applied, so the pixels are
 * upright exactly as the photo is shown in the browser.
 */
export async function decodeImage(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // fall back to <img>, which some browsers handle for more files
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty");
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    userError(MESSAGES.decode);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Creates a canvas and checks that the browser can really use it at this size
 * (mobile browsers silently refuse very large canvases).
 */
export function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx || canvas.width !== w || canvas.height !== h) {
    releaseCanvas(canvas);
    userError(MESSAGES.tooLarge(w, h));
  }
  // A canvas above the browser's limit returns a context that draws nothing.
  ctx.fillStyle = "#000";
  ctx.fillRect(w - 1, h - 1, 1, 1);
  const probe = ctx.getImageData(w - 1, h - 1, 1, 1).data[3];
  ctx.clearRect(w - 1, h - 1, 1, 1);
  if (probe !== 255) {
    releaseCanvas(canvas);
    userError(MESSAGES.tooLarge(w, h));
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

export function fillBackground(ctx: CanvasRenderingContext2D, width: number, height: number, color: string) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Draws an image at a new size with high-quality smoothing. Large reductions
 * are done in halving steps, which keeps fine detail from aliasing.
 */
export function drawScaled(source: CanvasImageSource, src: Size, dst: Size): HTMLCanvasElement {
  const steps = stepDownPlan(src, dst);
  let current: CanvasImageSource = source;
  let currentCanvas: HTMLCanvasElement | null = null;
  let currentSize = src;
  for (const step of steps) {
    const { canvas, ctx } = createCanvas(step.width, step.height);
    ctx.drawImage(current, 0, 0, currentSize.width, currentSize.height, 0, 0, step.width, step.height);
    releaseCanvas(currentCanvas);
    current = canvas;
    currentCanvas = canvas;
    currentSize = step;
  }
  if (currentCanvas) return currentCanvas;
  const { canvas, ctx } = createCanvas(dst.width, dst.height);
  ctx.drawImage(source, 0, 0, dst.width, dst.height);
  return canvas;
}

export function getPixels(canvas: HTMLCanvasElement): Pixels {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: img.data, width: img.width, height: img.height };
}

/**
 * Pixels of a canvas for a worker job. Reading a large canvas back
 * (getImageData) can block the page for half a second, so where the browser
 * allows it the canvas is snapshotted as an ImageBitmap (fast, asynchronous)
 * and the worker reads the pixels itself. Otherwise the pixels are read here.
 */
export async function pixelSource(canvas: HTMLCanvasElement): Promise<PixelSource> {
  if (typeof createImageBitmap === "function" && typeof OffscreenCanvas !== "undefined") {
    try {
      const bitmap = await createImageBitmap(canvas);
      return { bitmap, width: canvas.width, height: canvas.height };
    } catch {
      // fall through to a direct read
    }
  }
  return getPixels(canvas);
}

export function putPixels(canvas: HTMLCanvasElement, px: Pixels, x = 0, y = 0) {
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(px.data as Uint8ClampedArray<ArrayBuffer>, px.width, px.height), x, y);
}

/**
 * Encodes a canvas. `quality` is 0–1 (ignored for PNG). Checks the bytes so a
 * browser that silently falls back to PNG (e.g. no WebP encoder) is reported.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement, format: OutputFormat, quality = 0.92): Promise<Blob> {
  const info = FORMAT_INFO[format];
  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, info.mime, info.lossy ? quality : undefined);
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") userError(MESSAGES.svgBlocked);
      resolve(null);
    }
  });
  if (!blob || blob.size === 0) userError(MESSAGES.encode);
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (sniffFormat(head) !== format) userError(MESSAGES.formatUnsupported(info.label));
  return blob.type === info.mime ? blob : new Blob([blob], { type: info.mime });
}

/** Whether this browser can encode the format (WebP is missing in some Safari versions). */
export async function canEncode(format: OutputFormat): Promise<boolean> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2;
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, FORMAT_INFO[format].mime, 0.8));
  releaseCanvas(canvas);
  if (!blob) return false;
  return sniffFormat(new Uint8Array(await blob.slice(0, 16).arrayBuffer())) === format;
}
