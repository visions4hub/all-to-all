"use client";

/** Reads the pixel size of an image the browser can decode. */
export async function readImageSize(file: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function" && file.type !== "image/svg+xml") {
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      // fall through to <img>, which handles a few more cases
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Longest side of the small preview made for lists and grids. */
export const THUMB_MAX = 320;

/**
 * Size of the small preview for an image, or null when the original is small
 * enough to show as it is. Keeps the aspect ratio; never upscales.
 */
export function thumbSize(width: number, height: number, max = THUMB_MAX): { width: number; height: number } | null {
  if (width <= 0 || height <= 0 || Math.max(width, height) <= max * 2) return null;
  const scale = max / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Pixel size plus, for large photos, a small preview (object URL; the caller
 * owns it). A browser keeps a decoded copy of every image it shows, so showing
 * a 12-megapixel photo as a 48-pixel thumbnail holds ~48 MB per photo; the
 * small preview holds a few hundred KB. Animated GIFs and SVGs keep their
 * original (a still preview would lose the animation; SVG has no pixels).
 */
export async function readImageDetails(file: Blob): Promise<{ width: number; height: number; thumbUrl?: string }> {
  const vector = file.type === "image/svg+xml";
  if (vector || file.type === "image/gif" || typeof createImageBitmap !== "function") return readImageSize(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return readImageSize(file);
  }
  const size = { width: bitmap.width, height: bitmap.height };
  try {
    const thumb = thumbSize(size.width, size.height);
    if (!thumb) return size;
    const canvas = document.createElement("canvas");
    canvas.width = thumb.width;
    canvas.height = thumb.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return size;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, thumb.width, thumb.height);
    // JPEG for photos; PNG keeps transparency for everything else.
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.85));
    canvas.width = canvas.height = 0;
    return blob ? { ...size, thumbUrl: URL.createObjectURL(blob) } : size;
  } finally {
    bitmap.close();
  }
}
