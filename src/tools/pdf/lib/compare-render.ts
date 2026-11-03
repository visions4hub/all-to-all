// Compare PDF: renders the same page of both files at one shared scale, so the
// two pictures line up pixel for pixel. Browser only (uses canvas).

import type { TextSourceDoc } from "./text-extract";
import { readPagesText } from "./text-extract";

type RenderablePage = {
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
  cleanup(): void;
};
export type RenderableDoc = { numPages: number; getPage(n: number): Promise<RenderablePage> };

export type PagePair = {
  width: number;
  height: number;
  a: Uint8ClampedArray | null;
  b: Uint8ClampedArray | null;
  /** Visible page sizes differ by more than a point. */
  sizeDiffers: boolean;
};

/**
 * Renders page `n` of both documents into same-size RGBA buffers, `width` pixels wide
 * for the wider page. Each page is drawn from the top-left corner on white; a page
 * that doesn't exist in one file gives null.
 */
export async function renderPair(docA: RenderableDoc, docB: RenderableDoc, n: number, width: number): Promise<PagePair> {
  const pa = n <= docA.numPages ? await docA.getPage(n) : null;
  const pb = n <= docB.numPages ? await docB.getPage(n) : null;
  const va = pa?.getViewport({ scale: 1 });
  const vb = pb?.getViewport({ scale: 1 });
  const maxW = Math.max(va?.width ?? 0, vb?.width ?? 0, 1);
  const maxH = Math.max(va?.height ?? 0, vb?.height ?? 0, 1);
  const scale = width / maxW;
  const w = Math.max(1, Math.round(maxW * scale));
  const h = Math.max(1, Math.round(maxH * scale));
  const draw = async (p: RenderablePage | null) => {
    if (!p) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    await p.render({ canvas, canvasContext: ctx, viewport: p.getViewport({ scale }) }).promise;
    p.cleanup();
    const data = ctx.getImageData(0, 0, w, h).data;
    canvas.width = canvas.height = 0;
    return data;
  };
  const a = await draw(pa);
  const b = await draw(pb);
  const sizeDiffers = !!va && !!vb && (Math.abs(va.width - vb.width) > 1 || Math.abs(va.height - vb.height) > 1);
  return { width: w, height: h, a, b, sizeDiffers };
}

/** Text of page n in reading order, or null when the file has no such page. */
export async function pageText(doc: TextSourceDoc, n: number, signal?: AbortSignal): Promise<{ text: string } | null> {
  if (n > doc.numPages) return null;
  const [p] = await readPagesText(doc, [n], signal);
  return { text: p.text };
}

/** RGBA → JPEG data: URL (for the report), scaled to at most `maxWidth`. */
export function toDataUrl(rgba: Uint8ClampedArray, width: number, height: number, maxWidth = 900): string {
  const src = document.createElement("canvas");
  src.width = width;
  src.height = height;
  src.getContext("2d")!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  const scale = Math.min(1, maxWidth / width);
  const out = document.createElement("canvas");
  out.width = Math.round(width * scale);
  out.height = Math.round(height * scale);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, out.width, out.height);
  const url = out.toDataURL("image/jpeg", 0.85);
  src.width = src.height = out.width = out.height = 0;
  return url;
}
