"use client";

// Meme rendering, shared by the live preview and the export.
// Layouts are generic, original arrangements (no copyrighted template images):
// text over the picture, or a caption bar above / below it.

import { decodeImage, type Decoded } from "./canvas";
import { cssFont, ensureFont, type FontKey } from "./fonts";
import type { Size } from "./geometry";
import { textDirection, wrapText } from "./layout";

export type MemeLayout = "classic" | "top-bar" | "bottom-bar";

export type TextLayer = {
  id: string;
  text: string;
  /** Centre of the text block, as fractions of the whole meme canvas. */
  x: number;
  y: number;
  /** Font size as % of the canvas width. */
  sizePct: number;
  font: FontKey;
  bold: boolean;
  color: string;
  outlineColor: string;
  /** Outline thickness as % of the font size (0 = none). */
  outlinePct: number;
  shadow: boolean;
  uppercase: boolean;
  /** Wrap width as % of the canvas width. */
  widthPct: number;
};

export type ImageLayer = {
  id: string;
  file: File;
  x: number;
  y: number;
  /** Width as % of the canvas width. */
  widthPct: number;
};

export type MemeDoc = {
  layout: MemeLayout;
  /** Caption bar height, % of the image height. */
  barPct: number;
  barColor: string;
  texts: TextLayer[];
  images: ImageLayer[];
};

/** Box of a drawn layer, as fractions of the canvas (for dragging in the preview). */
export type LayerBox = { id: string; x: number; y: number; w: number; h: number };

/** Canvas size and where the picture sits inside it. */
export function memeFrame(img: Size, doc: Pick<MemeDoc, "layout" | "barPct">): { size: Size; image: { x: number; y: number; width: number; height: number }; bar: { y: number; height: number } | null } {
  if (doc.layout === "classic") return { size: img, image: { x: 0, y: 0, ...img }, bar: null };
  const bar = Math.max(1, Math.round((img.height * doc.barPct) / 100));
  const size = { width: img.width, height: img.height + bar };
  return doc.layout === "top-bar"
    ? { size, image: { x: 0, y: bar, ...img }, bar: { y: 0, height: bar } }
    : { size, image: { x: 0, y: 0, ...img }, bar: { y: img.height, height: bar } };
}

const decodeCache = new WeakMap<File, Promise<Decoded>>();
export function decodeCached(file: File): Promise<Decoded> {
  let p = decodeCache.get(file);
  if (!p) {
    p = decodeImage(file);
    decodeCache.set(file, p);
    p.catch(() => decodeCache.delete(file));
  }
  return p;
}

/**
 * Draws the meme into `ctx` (sized to memeFrame().size × scale). `scale`
 * lets the preview draw at a smaller size with identical proportions.
 */
export async function renderMeme(
  ctx: CanvasRenderingContext2D,
  picture: CanvasImageSource,
  img: Size,
  doc: MemeDoc,
): Promise<LayerBox[]> {
  const frame = memeFrame(img, doc);
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const k = W / frame.size.width;
  const boxes: LayerBox[] = [];

  ctx.save();
  if (frame.bar) {
    ctx.fillStyle = doc.barColor;
    ctx.fillRect(0, frame.bar.y * k, W, frame.bar.height * k);
  }
  ctx.drawImage(picture, frame.image.x * k, frame.image.y * k, frame.image.width * k, frame.image.height * k);

  for (const layer of doc.images) {
    const d = await decodeCached(layer.file);
    const w = (W * layer.widthPct) / 100;
    const h = (w * d.height) / d.width;
    ctx.drawImage(d.source, layer.x * W - w / 2, layer.y * H - h / 2, w, h);
    boxes.push({ id: layer.id, x: layer.x - w / W / 2, y: layer.y - h / H / 2, w: w / W, h: h / H });
  }

  for (const layer of doc.texts) {
    const raw = layer.uppercase ? layer.text.toLocaleUpperCase() : layer.text;
    if (!raw.trim()) continue;
    const fontPx = Math.max(4, (W * layer.sizePct) / 100);
    const font = cssFont(layer.font, fontPx, layer.bold);
    await ensureFont(font, raw);
    ctx.font = font;
    ctx.direction = textDirection(raw);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxW = (W * layer.widthPct) / 100;
    const lines = wrapText(raw, maxW, (s) => ctx.measureText(s).width);
    const lineH = fontPx * 1.15;
    const blockH = lines.length * lineH;
    const cx = layer.x * W;
    const top = layer.y * H - blockH / 2;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    lines.forEach((line, i) => {
      const y = top + lineH * (i + 0.5);
      ctx.save();
      if (layer.shadow) {
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = fontPx * 0.15;
        ctx.shadowOffsetX = fontPx * 0.04;
        ctx.shadowOffsetY = fontPx * 0.06;
      }
      if (layer.outlinePct > 0) {
        ctx.lineWidth = (fontPx * layer.outlinePct) / 100;
        ctx.strokeStyle = layer.outlineColor;
        ctx.strokeText(line, cx, y);
        ctx.shadowColor = "transparent";
      }
      ctx.fillStyle = layer.color;
      ctx.fillText(line, cx, y);
      ctx.restore();
    });
    const pad = fontPx * 0.15;
    boxes.push({ id: layer.id, x: (cx - widest / 2 - pad) / W, y: (top - pad) / H, w: (widest + 2 * pad) / W, h: (blockH + 2 * pad) / H });
  }
  ctx.restore();
  return boxes;
}
