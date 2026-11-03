"use client";

// Draws text that pdf-lib can't (Arabic and other non-Latin scripts) with the
// browser's text engine, which shapes Arabic and lays out right-to-left text,
// using the site's self-hosted IBM Plex Sans Arabic. The result is a transparent
// PNG embedded in the PDF; it looks right but can't be selected or searched.

import { hasRtl, type RasterText, type TextRasterizer, type TextStyle } from "./page-space";

/** Canvas pixels per PDF point: 4 ≈ 288 DPI, sharp in print. */
const PX_PER_PT = 4;
const MAX_PIXELS = 12_000_000;

function siteFontFamily(): string {
  if (typeof document === "undefined") return "sans-serif";
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

function fontString(style: TextStyle, px: number) {
  return `${style.bold ? 700 : 400} ${px}px ${siteFontFamily()}`;
}

async function ensureFont(style: TextStyle, text: string) {
  try {
    await document.fonts.load(fontString(style, 32), text);
  } catch {
    // Font loading API missing: the canvas falls back to a system font.
  }
}

/** Size, in points, that the text will take up. */
export function measureRasterText(text: string, style: TextStyle): { width: number; height: number } {
  const canvas = document.createElement("canvas");
  const c = canvas.getContext("2d")!;
  c.font = fontString(style, style.fontSize);
  const lines = text.split("\n");
  const width = Math.max(1, ...lines.map((l) => c.measureText(l).width));
  const lh = style.fontSize * (style.lineHeight ?? 1.25);
  return { width: width + style.fontSize * 0.1, height: lines.length * lh };
}

export const rasterizeText: TextRasterizer = async (text: string, style: TextStyle): Promise<RasterText> => {
  await ensureFont(style, text);
  const { width, height } = measureRasterText(text, style);
  const scale = Math.min(PX_PER_PT, Math.sqrt(MAX_PIXELS / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const c = canvas.getContext("2d")!;
  c.scale(scale, scale);
  c.font = fontString(style, style.fontSize);
  c.fillStyle = style.color;
  const rtl = hasRtl(text);
  c.direction = rtl ? "rtl" : "ltr";
  c.textBaseline = "middle";
  const align = style.align ?? "start";
  // Physical x for the logical alignment.
  const atRight = (align === "start" && rtl) || (align === "end" && !rtl);
  c.textAlign = align === "center" ? "center" : atRight ? "right" : "left";
  const x = align === "center" ? width / 2 : atRight ? width - style.fontSize * 0.05 : style.fontSize * 0.05;
  const lh = style.fontSize * (style.lineHeight ?? 1.25);
  text.split("\n").forEach((line, i) => c.fillText(line, x, i * lh + lh / 2));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("Could not render text.");
  return { png: new Uint8Array(await blob.arrayBuffer()), width, height };
};
