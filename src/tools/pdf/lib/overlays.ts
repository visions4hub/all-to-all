// Objects added on top of pages by the PDF editor and the signature tool.
// The original page content is never changed; these are drawn above it.

import type { PDFDocument, PDFImage, PDFPage } from "pdf-lib";
import { throwIfCancelled, type ProcessContext, type ProcessInput, type ProcessOutput } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import { userError } from "./errors";
import { drawInDisplaySpace, drawPreparedText, pdfColor, prepareText, type StandardFontName, type TextRasterizer } from "./page-space";
import { loadPdfLib, openPdfDocument, savePdf } from "./pdf-lib";

export type OverlayKind = "text" | "image" | "rect" | "ellipse" | "line" | "arrow" | "path" | "highlight";

/**
 * Positions are fractions (0–1) of the page as the reader sees it, origin at the
 * top-left, y pointing down (like the screen), so they don't depend on zoom.
 */
export type Overlay = {
  id: string;
  /** 0-based page index. */
  page: number;
  kind: OverlayKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Clockwise degrees, about the box centre. */
  rotation: number;
  color: string;
  /** Fill for rectangles and ellipses; null = none. */
  fill: string | null;
  /** Stroke width in points. */
  strokeWidth: number;
  opacity: number;
  text?: string;
  fontSize?: number;
  font?: StandardFontName;
  bold?: boolean;
  imageId?: string;
  /** line / arrow / path: points as fractions of the box (0–1, y down). */
  points?: [number, number][];
};

export type OverlayImage = { bytes: Uint8Array; type: "png" | "jpeg"; width: number; height: number };

export type OverlaySettings = { overlays: Overlay[]; images: Record<string, OverlayImage> };

export const EMPTY_OVERLAYS: OverlaySettings = { overlays: [], images: {} };

/** Moves every point of a box-relative polyline into the box so its bounds are exactly 0–1. */
export function normalizePoints(points: [number, number][]): { points: [number, number][]; minX: number; minY: number; spanX: number; spanY: number } {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  return {
    points: points.map(([x, y]) => [spanX ? (x - minX) / spanX : 0.5, spanY ? (y - minY) / spanY : 0.5]),
    minX,
    minY,
    spanX,
    spanY,
  };
}

/** The object's box in display space (points, y up): centre and size. */
export function overlayFrame(o: Pick<Overlay, "x" | "y" | "w" | "h">, page: { width: number; height: number }) {
  const w = o.w * page.width;
  const h = o.h * page.height;
  return { cx: o.x * page.width + w / 2, cy: page.height - (o.y * page.height + h / 2), w, h };
}

/** Local coordinates (centre origin, y up) of a box-relative point. */
export function localPoint(p: [number, number], w: number, h: number): { x: number; y: number } {
  return { x: (p[0] - 0.5) * w, y: (0.5 - p[1]) * h };
}

/** Two short strokes forming an arrowhead at `tip`, pointing away from `from`. */
export function arrowHead(from: { x: number; y: number }, tip: { x: number; y: number }, size: number) {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const spread = (28 * Math.PI) / 180;
  return [angle + Math.PI - spread, angle + Math.PI + spread].map((a) => ({ x: tip.x + size * Math.cos(a), y: tip.y + size * Math.sin(a) }));
}

async function drawOverlay(
  doc: PDFDocument,
  page: PDFPage,
  o: Overlay,
  geom: { width: number; height: number },
  images: Map<string, PDFImage>,
  rasterize: TextRasterizer | undefined,
) {
  const lib = await loadPdfLib();
  const { cx, cy, w, h } = overlayFrame(o, geom);
  const t = (-o.rotation * Math.PI) / 180; // screen clockwise → PDF counter-clockwise
  page.pushOperators(lib.pushGraphicsState(), lib.concatTransformationMatrix(Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), cx, cy));
  const color = await pdfColor(o.color);
  const opacity = Math.min(1, Math.max(0, o.opacity));
  const stroke = Math.max(0.1, o.strokeWidth);
  try {
    switch (o.kind) {
      case "rect":
        page.drawRectangle({
          x: -w / 2,
          y: -h / 2,
          width: w,
          height: h,
          borderColor: stroke > 0 ? color : undefined,
          borderWidth: stroke,
          color: o.fill ? await pdfColor(o.fill) : undefined,
          opacity,
          borderOpacity: opacity,
        });
        break;
      case "ellipse":
        page.drawEllipse({
          x: 0,
          y: 0,
          xScale: w / 2,
          yScale: h / 2,
          borderColor: color,
          borderWidth: stroke,
          color: o.fill ? await pdfColor(o.fill) : undefined,
          opacity,
          borderOpacity: opacity,
        });
        break;
      case "highlight":
        page.drawRectangle({ x: -w / 2, y: -h / 2, width: w, height: h, color, opacity, blendMode: lib.BlendMode.Multiply });
        break;
      case "line":
      case "arrow":
      case "path": {
        const pts = (o.points ?? [[0, 0.5], [1, 0.5]]).map((p) => localPoint(p, w, h));
        if (pts.length < 2) break;
        // SVG path with y pointing down (drawSvgPath flips it), round caps and joins.
        const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`).join(" ");
        const style = { x: 0, y: 0, borderColor: color, borderWidth: stroke, borderOpacity: opacity, borderLineCap: lib.LineCapStyle.Round };
        page.drawSvgPath(d, style);
        if (o.kind === "arrow") {
          const tip = pts[pts.length - 1];
          const [a, b] = arrowHead(pts[pts.length - 2], tip, Math.max(8, stroke * 4));
          page.drawSvgPath(`M${a.x} ${-a.y} L${tip.x} ${-tip.y} L${b.x} ${-b.y}`, style);
        }
        break;
      }
      case "image": {
        const img = o.imageId ? images.get(o.imageId) : undefined;
        if (img) page.drawImage(img, { x: -w / 2, y: -h / 2, width: w, height: h, opacity });
        break;
      }
      case "text": {
        const value = o.text ?? "";
        if (!value.trim()) break;
        const prepared = await prepareText(doc, value, { fontSize: o.fontSize ?? 16, color: o.color, font: o.font, bold: o.bold }, rasterize);
        if (prepared.kind === "raster") {
          page.drawImage(prepared.image, { x: -w / 2, y: -h / 2, width: w, height: h, opacity });
        } else {
          // Top-left of the text block at the top-left of the box.
          await drawPreparedText(page, prepared, -w / 2, h / 2 - prepared.height, { opacity });
        }
        break;
      }
    }
  } finally {
    page.pushOperators(lib.popGraphicsState());
  }
}

export async function applyOverlays(
  doc: PDFDocument,
  settings: OverlaySettings,
  rasterize: TextRasterizer | undefined,
  signal?: AbortSignal,
  only?: number,
) {
  const embedded = new Map<string, PDFImage>();
  for (const [id, img] of Object.entries(settings.images)) {
    if (!settings.overlays.some((o) => o.imageId === id && (only === undefined || o.page === only))) continue;
    embedded.set(id, img.type === "png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes));
  }
  const byPage = new Map<number, Overlay[]>();
  for (const o of settings.overlays) {
    if (o.page < 0 || o.page >= doc.getPageCount()) continue;
    if (only !== undefined && o.page !== only) continue;
    byPage.set(o.page, [...(byPage.get(o.page) ?? []), o]);
  }
  for (const [index, list] of byPage) {
    if (signal) throwIfCancelled(signal);
    const page = doc.getPage(index);
    await drawInDisplaySpace(page, async (geom) => {
      for (const o of list) await drawOverlay(doc, page, o, geom, embedded, rasterize);
    });
  }
  return byPage.size;
}

export async function exportOverlays(
  inputs: ProcessInput[],
  settings: OverlaySettings,
  ctx: ProcessContext,
  rasterize: TextRasterizer | undefined,
  suffix: string,
): Promise<ProcessOutput[]> {
  const [input] = inputs;
  if (!settings.overlays.length) throw userError({ ar: "لم تُضف أي عناصر بعد.", en: "Nothing has been added yet." });
  const doc = await openPdfDocument(input.file);
  const pages = await applyOverlays(doc, settings, rasterize, ctx.signal);
  return [
    {
      name: buildOutputName(input.name, { suffix, ext: "pdf" }),
      blob: await savePdf(doc),
      sourceIds: [input.id],
      meta: [
        { label: { ar: "العناصر المضافة", en: "Objects added" }, value: settings.overlays.length },
        { label: { ar: "صفحات معدّلة", en: "Pages changed" }, value: pages },
      ],
    },
  ];
}
