import type { PDFDocument, PDFFont, PDFImage, PDFPage } from "pdf-lib";
import { displaySize, displayToUser, normalizeRotation, type Box, type Rotation } from "./geometry";
import { loadPdfLib } from "./pdf-lib";

export type PageGeometry = {
  /** CropBox (falls back to MediaBox), user space. */
  box: Box;
  rotation: Rotation;
  /** Visible width/height as a reader sees the page. */
  width: number;
  height: number;
};

export function pageGeometry(page: PDFPage): PageGeometry {
  const crop = page.getCropBox();
  const media = page.getMediaBox();
  // The visible area is the CropBox clipped to the MediaBox.
  const x = Math.max(crop.x, media.x);
  const y = Math.max(crop.y, media.y);
  const box = {
    x,
    y,
    width: Math.max(1, Math.min(crop.x + crop.width, media.x + media.width) - x),
    height: Math.max(1, Math.min(crop.y + crop.height, media.y + media.height) - y),
  };
  const rotation = normalizeRotation(page.getRotation().angle);
  return { box, rotation, ...displaySize(box, rotation) };
}

/**
 * Runs `draw` with the page's coordinate system set to display space, so items
 * appear upright and in place whatever the page's rotation or CropBox.
 * pdf-lib already wraps the page's existing content in q…Q before adding ours,
 * so a transform left open by the original content can't shift what we draw.
 */
export async function drawInDisplaySpace(page: PDFPage, draw: (geom: PageGeometry) => void | Promise<void>) {
  const { pushGraphicsState, popGraphicsState, concatTransformationMatrix } = await loadPdfLib();
  const geom = pageGeometry(page);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...displayToUser(geom.box, geom.rotation)));
  try {
    await draw(geom);
  } finally {
    page.pushOperators(popGraphicsState());
  }
}

// ---------------------------------------------------------------------------
// Text. pdf-lib's standard fonts only cover WinAnsi (Latin-1-ish) and pdf-lib
// cannot shape Arabic or lay out right-to-left text, so anything else is drawn
// by the browser onto a transparent canvas with the site's Arabic font and
// embedded as an image (not selectable).

export type StandardFontName = "helvetica" | "times" | "courier";

/** Characters the standard PDF fonts can encode (WinAnsi, minus controls). */
const WIN_ANSI = /^[\n\x20-\x7e -ÿ–—‘’“”•…€]*$/;

export function canUseStandardFont(text: string): boolean {
  return WIN_ANSI.test(text);
}

export function hasRtl(text: string): boolean {
  return /[֐-ࣿיִ-﷿ﹰ-ﻼ]/.test(text);
}

export type TextStyle = {
  fontSize: number;
  color: string; // #rrggbb
  font?: StandardFontName;
  bold?: boolean;
  /** Line height as a multiple of the font size. */
  lineHeight?: number;
  align?: "start" | "center" | "end";
};

/** A browser-rendered text image. Sizes in points. */
export type RasterText = { png: Uint8Array; width: number; height: number };

/**
 * Renders text the standard fonts can't encode. Provided by the browser
 * (canvas + bundled font); tests pass a fake.
 */
export type TextRasterizer = (text: string, style: TextStyle) => Promise<RasterText>;

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export async function pdfColor(hex: string) {
  const { rgb } = await loadPdfLib();
  const c = hexToRgb(hex);
  return rgb(c.r, c.g, c.b);
}

const fontCache = new WeakMap<PDFDocument, Map<string, Promise<PDFFont>>>();

export async function standardFont(doc: PDFDocument, name: StandardFontName = "helvetica", bold = false): Promise<PDFFont> {
  const { StandardFonts } = await loadPdfLib();
  const key = `${name}-${bold}`;
  let perDoc = fontCache.get(doc);
  if (!perDoc) fontCache.set(doc, (perDoc = new Map()));
  let font = perDoc.get(key);
  if (!font) {
    const id =
      name === "times"
        ? bold
          ? StandardFonts.TimesRomanBold
          : StandardFonts.TimesRoman
        : name === "courier"
          ? bold
            ? StandardFonts.CourierBold
            : StandardFonts.Courier
          : bold
            ? StandardFonts.HelveticaBold
            : StandardFonts.Helvetica;
    font = doc.embedFont(id);
    perDoc.set(key, font);
  }
  return font;
}

/** A piece of text ready to draw: either real PDF text or an embedded image. */
export type PreparedText =
  | { kind: "vector"; lines: string[]; font: PDFFont; style: TextStyle; width: number; height: number; lineWidths: number[] }
  | { kind: "raster"; image: PDFImage; width: number; height: number };

export async function prepareText(
  doc: PDFDocument,
  text: string,
  style: TextStyle,
  rasterize: TextRasterizer | undefined,
): Promise<PreparedText> {
  if (canUseStandardFont(text)) {
    const font = await standardFont(doc, style.font, style.bold);
    const lines = text.split("\n");
    const lineWidths = lines.map((l) => font.widthOfTextAtSize(l, style.fontSize));
    const lh = style.fontSize * (style.lineHeight ?? 1.25);
    // Height: full lines plus the font's ascent/descent for the last one.
    const height = (lines.length - 1) * lh + font.heightAtSize(style.fontSize);
    return { kind: "vector", lines, font, style, width: Math.max(0, ...lineWidths), height, lineWidths };
  }
  if (!rasterize) throw new Error("Text needs the browser renderer");
  const raster = await rasterize(text, style);
  const image = await doc.embedPng(raster.png);
  return { kind: "raster", image, width: raster.width, height: raster.height };
}

/**
 * Draws prepared text with its bottom-left corner at (x, y) in the current
 * coordinate system, rotated counter-clockwise by `rotate` degrees about that corner.
 */
export async function drawPreparedText(
  page: PDFPage,
  t: PreparedText,
  x: number,
  y: number,
  opts: { rotate?: number; opacity?: number; color?: string } = {},
) {
  const { degrees } = await loadPdfLib();
  const rotate = degrees(opts.rotate ?? 0);
  if (t.kind === "raster") {
    page.drawImage(t.image, { x, y, width: t.width, height: t.height, rotate, opacity: opts.opacity });
    return;
  }
  const color = await pdfColor(opts.color ?? t.style.color);
  const lh = t.style.fontSize * (t.style.lineHeight ?? 1.25);
  const descent = t.font.heightAtSize(t.style.fontSize, { descender: true }) - t.font.heightAtSize(t.style.fontSize, { descender: false });
  const rad = ((opts.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  t.lines.forEach((line, i) => {
    // Offset of this line's baseline from the block's bottom-left, before rotation.
    const align = t.style.align ?? "start";
    const ox = align === "center" ? (t.width - t.lineWidths[i]) / 2 : align === "end" ? t.width - t.lineWidths[i] : 0;
    const oy = (t.lines.length - 1 - i) * lh + descent;
    page.drawText(line, {
      x: x + ox * cos - oy * sin,
      y: y + ox * sin + oy * cos,
      size: t.style.fontSize,
      font: t.font,
      color,
      rotate,
      opacity: opts.opacity,
    });
  });
}
