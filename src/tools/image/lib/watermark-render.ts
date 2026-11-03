"use client";

// Draws a watermark (text and/or logo) onto a canvas. Used by both the live
// preview and the final export, so what you see is what you get. All sizes
// are relative to the image, so a batch of different sizes looks consistent.

import { createCanvas, releaseCanvas } from "./canvas";
import { cssFont, ensureFont, type FontKey } from "./fonts";
import { rotatedBounds, type Size } from "./geometry";
import { anchorCenter, pctOfShortSide, textDirection, tileCenters, type Anchor } from "./layout";

export type WatermarkStyle = {
  useText: boolean;
  text: string;
  font: FontKey;
  bold: boolean;
  /** Text size as % of the image's shorter side. */
  sizePct: number;
  color: string;
  /** Thin outline in the opposite tone, for legibility on busy photos. */
  outline: boolean;
  useLogo: boolean;
  /** Logo width as % of the image width. */
  logoPct: number;
  /** 0–100 */
  opacity: number;
  /** Degrees, clockwise. */
  rotation: number;
  anchor: Anchor;
  /** Distance from the edges, % of the shorter side. */
  marginPct: number;
  tiled: boolean;
  /** Space between tiles, % of the shorter side. */
  gapPct: number;
};

export type LogoSource = { source: CanvasImageSource; width: number; height: number } | null;

/** Renders the text + logo "stamp" once, at the size it will appear on this image. */
export async function buildStamp(image: Size, s: WatermarkStyle, logo: LogoSource): Promise<HTMLCanvasElement | null> {
  const text = s.useText ? s.text.trim() : "";
  const hasLogo = s.useLogo && !!logo;
  if (!text && !hasLogo) return null;

  const fontPx = Math.max(4, pctOfShortSide(image, s.sizePct));
  const font = cssFont(s.font, fontPx, s.bold);
  if (text) await ensureFont(font, text);

  const lines = text ? text.split(/\r?\n/) : [];
  const measure = createCanvas(1, 1);
  measure.ctx.font = font;
  const lineHeight = fontPx * 1.35;
  const textW = Math.ceil(Math.max(0, ...lines.map((l) => measure.ctx.measureText(l).width)));
  const textH = Math.ceil(lines.length * lineHeight);
  releaseCanvas(measure.canvas);

  const logoW = hasLogo ? Math.max(1, Math.round((image.width * s.logoPct) / 100)) : 0;
  const logoH = hasLogo ? Math.max(1, Math.round((logoW * logo!.height) / logo!.width)) : 0;
  const gap = text && hasLogo ? Math.round(fontPx * 0.5) : 0;
  const pad = s.outline ? Math.ceil(fontPx * 0.08) + 1 : 1;
  const w = logoW + gap + textW + pad * 2;
  const h = Math.max(logoH, textH) + pad * 2;

  const { canvas, ctx } = createCanvas(w, h);
  const rtl = textDirection(text) === "rtl";
  // The logo comes first in reading order: on the left for LTR text, on the right for Arabic.
  const logoX = rtl ? w - pad - logoW : pad;
  const textX = rtl ? pad : pad + logoW + gap;
  if (hasLogo) ctx.drawImage(logo!.source, logoX, (h - logoH) / 2, logoW, logoH);
  if (text) {
    ctx.font = font;
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = s.color;
    const top = (h - textH) / 2;
    lines.forEach((line, i) => {
      const x = textX + textW / 2;
      const y = top + lineHeight * (i + 0.5);
      if (s.outline) {
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.max(1, fontPx * 0.08);
        ctx.strokeStyle = isLight(s.color) ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)";
        ctx.strokeText(line, x, y);
      }
      ctx.fillText(line, x, y);
    });
  }
  return canvas;
}

function isLight(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/** Draws the stamp onto `ctx` (already holding the image at `image` size). */
export function drawWatermark(ctx: CanvasRenderingContext2D, image: Size, stamp: HTMLCanvasElement, s: WatermarkStyle) {
  const box = { width: stamp.width, height: stamp.height };
  const angle = (s.rotation * Math.PI) / 180;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity / 100));
  const centers = s.tiled
    ? tileCenters(image, box, pctOfShortSide(image, s.gapPct), s.rotation)
    : [anchorCenter(s.anchor, image, rotatedBounds(box, s.rotation), pctOfShortSide(image, s.marginPct))];
  for (const c of centers) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(angle);
    ctx.drawImage(stamp, -box.width / 2, -box.height / 2);
    ctx.restore();
  }
  ctx.restore();
}
