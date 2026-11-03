"use client";

import { createCanvas, getPixels, putPixels, releaseCanvas } from "./canvas";
import { arrowHead, blurSigma, frameLayout, objectBounds, opSize, type EditorDoc, type EditorObject, type GeoOp, type Stroke } from "./editor-model";
import { cssFont, ensureFont } from "./fonts";
import { fitWithin } from "./geometry";
import { textDirection } from "./layout";
import { decodeCached } from "./meme-render";
import { isNeutral, type Adjustments } from "./pixels";
import { runPixelJob } from "./worker-client";

export type Doc = EditorDoc<HTMLCanvasElement>;

/** Applies a crop / rotate / flip / resize to the picture and returns a new canvas. */
export function applyGeoToBase(base: HTMLCanvasElement, op: GeoOp): HTMLCanvasElement {
  const size = { width: base.width, height: base.height };
  const out = opSize(op, size);
  const { canvas, ctx } = createCanvas(out.width, out.height);
  switch (op.kind) {
    case "rotate":
      ctx.translate(out.width / 2, out.height / 2);
      ctx.rotate(((op.cw ? 90 : -90) * Math.PI) / 180);
      ctx.drawImage(base, -size.width / 2, -size.height / 2);
      break;
    case "flip":
      ctx.translate(op.axis === "h" ? out.width : 0, op.axis === "v" ? out.height : 0);
      ctx.scale(op.axis === "h" ? -1 : 1, op.axis === "v" ? -1 : 1);
      ctx.drawImage(base, 0, 0);
      break;
    case "crop":
      ctx.drawImage(base, op.rect.x, op.rect.y, op.rect.width, op.rect.height, 0, 0, op.rect.width, op.rect.height);
      break;
    case "resize":
      ctx.drawImage(base, 0, 0, out.width, out.height);
      break;
  }
  return canvas;
}

/** A smaller copy for fast on-screen editing. */
export function viewCopy(base: HTMLCanvasElement, maxSide = 1600): { canvas: HTMLCanvasElement; scale: number } {
  const size = { width: base.width, height: base.height };
  if (size.width <= maxSide && size.height <= maxSide) return { canvas: base, scale: 1 };
  const target = fitWithin(size, { width: maxSide, height: maxSide });
  const { canvas, ctx } = createCanvas(target.width, target.height);
  ctx.drawImage(base, 0, 0, target.width, target.height);
  return { canvas, scale: target.width / size.width };
}

/**
 * The picture with light/colour/blur/sharpen applied (in the worker).
 * Blur is relative to the picture size, so a small preview looks like the export.
 */
export async function adjustedCanvas(picture: HTMLCanvasElement, adjust: Adjustments, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  if (isNeutral(adjust)) return picture;
  const size = { width: picture.width, height: picture.height };
  const px = await runPixelJob({ op: "adjust", px: getPixels(picture), adj: { ...adjust, blur: blurSigma(adjust.blur, size) } }, signal);
  const { canvas } = createCanvas(size.width, size.height);
  putPixels(canvas, px);
  return canvas;
}

function strokePath(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.beginPath();
  const p = s.points;
  if (p.length < 2) return;
  ctx.moveTo(p[0], p[1]);
  if (p.length === 2) ctx.lineTo(p[0] + 0.01, p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
}

async function drawObject(ctx: CanvasRenderingContext2D, o: EditorObject, measured: Record<string, { w: number; h: number }>) {
  ctx.save();
  switch (o.type) {
    case "rect":
    case "ellipse":
      ctx.beginPath();
      if (o.type === "rect") ctx.rect(o.x, o.y, o.w, o.h);
      else ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.abs(o.w / 2), Math.abs(o.h / 2), 0, 0, Math.PI * 2);
      if (o.fill !== "none") {
        ctx.fillStyle = o.fill;
        ctx.fill();
      }
      if (o.strokeWidth > 0) {
        ctx.lineWidth = o.strokeWidth;
        ctx.strokeStyle = o.stroke;
        ctx.stroke();
      }
      break;
    case "line":
    case "arrow": {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = o.width;
      ctx.strokeStyle = o.color;
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y1);
      ctx.lineTo(o.x2, o.y2);
      ctx.stroke();
      if (o.type === "arrow") {
        const [l, r] = arrowHead({ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }, Math.max(10, o.width * 4));
        ctx.beginPath();
        ctx.moveTo(o.x2, o.y2);
        ctx.lineTo(l.x, l.y);
        ctx.lineTo(r.x, r.y);
        ctx.closePath();
        ctx.fillStyle = o.color;
        ctx.fill();
      }
      break;
    }
    case "image": {
      const d = await decodeCached(o.file);
      ctx.translate(o.x, o.y);
      ctx.rotate((o.rotation * Math.PI) / 180);
      ctx.drawImage(d.source, -o.w / 2, -o.h / 2, o.w, o.h);
      break;
    }
    case "text": {
      if (!o.text.trim()) break;
      const font = cssFont(o.font, o.size, o.bold);
      await ensureFont(font, o.text);
      ctx.font = font;
      ctx.direction = textDirection(o.text);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = o.text.split(/\r?\n/);
      const lineH = o.size * 1.25;
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
      measured[o.id] = { w: w + o.size * 0.3, h: lines.length * lineH + o.size * 0.2 };
      ctx.translate(o.x, o.y);
      ctx.rotate((o.rotation * Math.PI) / 180);
      ctx.lineJoin = "round";
      lines.forEach((line, i) => {
        const y = (i - (lines.length - 1) / 2) * lineH;
        if (o.outline > 0) {
          ctx.lineWidth = o.outline;
          ctx.strokeStyle = o.outlineColor;
          ctx.strokeText(line, 0, y);
        }
        ctx.fillStyle = o.color;
        ctx.fillText(line, 0, y);
      });
      break;
    }
  }
  ctx.restore();
}

export type RenderOptions = {
  /** Output pixels per picture pixel. */
  scale: number;
  /** Strokes / objects not yet committed (live drawing). */
  extraStrokes?: Stroke[];
  extraObjects?: EditorObject[];
  /** Draw a selection outline around this object (preview only). */
  selectedId?: string | null;
  /** Leave out the frame (used while cropping). */
  noFrame?: boolean;
};

/**
 * Draws the whole document into ctx (whose canvas must be frame-size × scale).
 * Layers, bottom to top: frame, picture (+ adjustments), freehand drawing, objects.
 * Returns measured text boxes (picture pixels) for hit-testing.
 */
export async function renderEditor(ctx: CanvasRenderingContext2D, doc: Doc, picture: CanvasImageSource, opts: RenderOptions) {
  const k = opts.scale;
  const frame = opts.noFrame ? { kind: "none" as const, color: "#fff", sizePct: 0 } : doc.frame;
  const layout = frameLayout(doc.size, frame);
  const measured: Record<string, { w: number; h: number }> = {};
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (frame.kind === "border" || frame.kind === "polaroid") {
    ctx.fillStyle = frame.color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  ctx.translate(layout.inner.x * k, layout.inner.y * k);
  if (layout.radius > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, doc.size.width * k, doc.size.height * k, layout.radius * k);
    ctx.clip();
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(picture, 0, 0, doc.size.width * k, doc.size.height * k);

  const strokes = opts.extraStrokes ? [...doc.strokes, ...opts.extraStrokes] : doc.strokes;
  if (strokes.length) {
    const { canvas: layer, ctx: l } = createCanvas(Math.max(1, Math.round(doc.size.width * k)), Math.max(1, Math.round(doc.size.height * k)));
    l.scale(k, k);
    l.lineCap = "round";
    l.lineJoin = "round";
    for (const s of strokes) {
      l.globalCompositeOperation = s.mode === "erase" ? "destination-out" : "source-over";
      l.strokeStyle = s.mode === "erase" ? "#000" : s.color;
      l.lineWidth = s.width;
      strokePath(l, s);
      l.stroke();
    }
    ctx.drawImage(layer, 0, 0);
    releaseCanvas(layer);
  }

  ctx.scale(k, k);
  for (const o of opts.extraObjects ? [...doc.objects, ...opts.extraObjects] : doc.objects) await drawObject(ctx, o, measured);
  const sel = opts.selectedId ? doc.objects.find((o) => o.id === opts.selectedId) : undefined;
  if (sel) {
    const b = objectBounds(sel, measured[sel.id]);
    ctx.setLineDash([6 / k, 4 / k]);
    ctx.lineWidth = 2 / k;
    ctx.strokeStyle = "#2563eb";
    ctx.strokeRect(b.x, b.y, b.width, b.height);
    ctx.setLineDash([]);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#2563eb";
    const r = 7 / k;
    ctx.beginPath();
    ctx.arc(b.x + b.width, b.y + b.height, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  return measured;
}

/** Full-resolution export of the document. */
export async function exportDoc(doc: Doc, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const picture = await adjustedCanvas(doc.base, doc.adjust, signal);
  const layout = frameLayout(doc.size, doc.frame);
  const { canvas, ctx } = createCanvas(layout.outer.width, layout.outer.height);
  await renderEditor(ctx, doc, picture, { scale: 1 });
  if (picture !== doc.base) releaseCanvas(picture);
  return canvas;
}
