/// <reference lib="webworker" />
// Browser image codec for Compress PDF, used inside the Web Worker: decodes with
// createImageBitmap, downsizes on an OffscreenCanvas and encodes JPEG.

import type { ImageCodec, ImageSource } from "./image-recompress";

async function decode(source: ImageSource): Promise<ImageBitmap> {
  // "none": keep the samples as stored; the PDF's own colour space still applies to them.
  const options: ImageBitmapOptions = { colorSpaceConversion: "none", premultiplyAlpha: "none" };
  if (source.kind === "jpeg") return createImageBitmap(new Blob([source.bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), options);
  return createImageBitmap(new ImageData(source.rgba as Uint8ClampedArray<ArrayBuffer>, source.width, source.height), options);
}

function draw(from: CanvasImageSource, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(from, 0, 0, width, height);
  return canvas;
}

export const canvasCodec: ImageCodec = {
  async encode(source, target, quality) {
    const bitmap = await decode(source);
    try {
      // A decoder that rotated the pixels (or anything unexpected) → leave the image alone.
      if (bitmap.width !== source.width || bitmap.height !== source.height) return null;
      // Halve in steps first: one big drawImage step skips pixels and aliases.
      let current: CanvasImageSource = bitmap;
      let w = bitmap.width;
      let h = bitmap.height;
      while (w / 2 >= target.width && h / 2 >= target.height) {
        w = Math.round(w / 2);
        h = Math.round(h / 2);
        current = draw(current, w, h);
      }
      const canvas = draw(current, target.width, target.height);
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      if (blob.type !== "image/jpeg") return null;
      return { bytes: new Uint8Array(await blob.arrayBuffer()), width: target.width, height: target.height, filter: "DCTDecode", components: 3 };
    } finally {
      bitmap.close();
    }
  },
};
