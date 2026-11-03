"use client";

import { detectKindFromBytes } from "@/lib/files/detect";

export type EmbeddableImage = { bytes: Uint8Array; type: "png" | "jpeg"; width: number; height: number };

/**
 * Reads an image for embedding in a PDF. JPG and PNG are kept byte-for-byte;
 * other formats the browser can decode (WebP, GIF, BMP…) become PNG.
 */
export async function readEmbeddableImage(file: Blob): Promise<EmbeddableImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectKindFromBytes(bytes.subarray(0, 1024));
  const bitmap = await createImageBitmap(file);
  try {
    if (kind === "jpeg" || kind === "png") return { bytes, type: kind, width: bitmap.width, height: bitmap.height };
    return { bytes: await bitmapToPng(bitmap), type: "png", width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export async function bitmapToPng(bitmap: ImageBitmap): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("Could not convert the image.");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("Could not create the image.");
  return new Uint8Array(await blob.arrayBuffer());
}
