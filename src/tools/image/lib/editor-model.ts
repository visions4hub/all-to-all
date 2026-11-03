// Photo editor document model. Pure (no DOM): geometry of objects and
// strokes under crop / rotate / flip / resize, frames, hit-testing, history.
// The picture itself (a canvas) is carried along as an opaque `base` value.

import type { FontKey } from "./fonts";
import type { Rect, Size } from "./geometry";
import type { Adjustments } from "./pixels";

export type Point = { x: number; y: number };

type Common = { id: string };
export type TextObject = Common & {
  type: "text";
  x: number;
  y: number;
  text: string;
  font: FontKey;
  /** Font size in image pixels. */
  size: number;
  bold: boolean;
  color: string;
  outlineColor: string;
  /** Outline width in image pixels (0 = none). */
  outline: number;
  /** Degrees clockwise. */
  rotation: number;
};
export type ShapeObject = Common & {
  type: "rect" | "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  /** "none" for no fill. */
  fill: string;
  strokeWidth: number;
};
export type LineObject = Common & { type: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number };
export type ImageObject = Common & { type: "image"; x: number; y: number; w: number; h: number; rotation: number; file: File };
export type EditorObject = TextObject | ShapeObject | LineObject | ImageObject;

/** Freehand drawing. Eraser strokes remove drawing only (never the photo). */
export type Stroke = { mode: "draw" | "erase"; color: string; width: number; points: number[] };

export type FrameKind = "none" | "border" | "rounded" | "polaroid";
export type Frame = { kind: FrameKind; color: string; /** % of the shorter side */ sizePct: number };

export type EditorDoc<B = unknown> = {
  fileId: string;
  base: B;
  size: Size;
  adjust: Adjustments;
  objects: EditorObject[];
  strokes: Stroke[];
  frame: Frame;
};

// ---------- History ----------

export type History<T> = { past: T[]; future: T[] };
const LIMIT = 40;

export function pushHistory<T>(current: T, h: History<T>): History<T> {
  return { past: [...h.past, current].slice(-LIMIT), future: [] };
}
export function undoHistory<T>(current: T, h: History<T>): { value: T; history: History<T> } {
  if (!h.past.length) return { value: current, history: h };
  return { value: h.past[h.past.length - 1], history: { past: h.past.slice(0, -1), future: [current, ...h.future] } };
}
export function redoHistory<T>(current: T, h: History<T>): { value: T; history: History<T> } {
  if (!h.future.length) return { value: current, history: h };
  return { value: h.future[0], history: { past: [...h.past, current], future: h.future.slice(1) } };
}

// ---------- Geometric operations ----------

export type GeoOp =
  | { kind: "rotate"; cw: boolean }
  | { kind: "flip"; axis: "h" | "v" }
  | { kind: "crop"; rect: Rect }
  | { kind: "resize"; size: Size };

/** Size of the picture after an operation. */
export function opSize(op: GeoOp, size: Size): Size {
  if (op.kind === "rotate") return { width: size.height, height: size.width };
  if (op.kind === "crop") return { width: op.rect.width, height: op.rect.height };
  if (op.kind === "resize") return { ...op.size };
  return { ...size };
}

/** Where a point of the picture ends up after the operation. */
export function mapPoint(op: GeoOp, p: Point, size: Size): Point {
  switch (op.kind) {
    case "rotate":
      return op.cw ? { x: size.height - p.y, y: p.x } : { x: p.y, y: size.width - p.x };
    case "flip":
      return op.axis === "h" ? { x: size.width - p.x, y: p.y } : { x: p.x, y: size.height - p.y };
    case "crop":
      return { x: p.x - op.rect.x, y: p.y - op.rect.y };
    case "resize":
      return { x: (p.x * op.size.width) / size.width, y: (p.y * op.size.height) / size.height };
  }
}

const norm = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** Moves every object so it stays where it was on the picture. Text and images keep reading upright-relative. */
export function transformObjects(objects: EditorObject[], op: GeoOp, size: Size): EditorObject[] {
  const scale = op.kind === "resize" ? Math.sqrt((op.size.width / size.width) * (op.size.height / size.height)) : 1;
  const sx = op.kind === "resize" ? op.size.width / size.width : 1;
  const sy = op.kind === "resize" ? op.size.height / size.height : 1;
  const turn = op.kind === "rotate" ? (op.cw ? 90 : -90) : 0;
  const mirror = op.kind === "flip";
  const swap = op.kind === "rotate";
  return objects.map((o) => {
    switch (o.type) {
      case "text": {
        const c = mapPoint(op, o, size);
        return { ...o, ...c, size: o.size * scale, outline: o.outline * scale, rotation: norm(mirror ? -o.rotation : o.rotation + turn) };
      }
      case "image": {
        const c = mapPoint(op, o, size);
        return { ...o, ...c, w: o.w * sx, h: o.h * sy, rotation: norm(mirror ? -o.rotation : o.rotation + turn) };
      }
      case "rect":
      case "ellipse": {
        const c = mapPoint(op, { x: o.x + o.w / 2, y: o.y + o.h / 2 }, size);
        const w = (swap ? o.h : o.w) * sx;
        const h = (swap ? o.w : o.h) * sy;
        return { ...o, x: c.x - w / 2, y: c.y - h / 2, w, h, strokeWidth: o.strokeWidth * scale };
      }
      case "line":
      case "arrow": {
        const a = mapPoint(op, { x: o.x1, y: o.y1 }, size);
        const b = mapPoint(op, { x: o.x2, y: o.y2 }, size);
        return { ...o, x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: o.width * scale };
      }
    }
  });
}

export function transformStrokes(strokes: Stroke[], op: GeoOp, size: Size): Stroke[] {
  const scale = op.kind === "resize" ? Math.sqrt((op.size.width / size.width) * (op.size.height / size.height)) : 1;
  return strokes.map((s) => {
    const points: number[] = [];
    for (let i = 0; i < s.points.length; i += 2) {
      const p = mapPoint(op, { x: s.points[i], y: s.points[i + 1] }, size);
      points.push(p.x, p.y);
    }
    return { ...s, width: s.width * scale, points };
  });
}

// ---------- Frames ----------

export function frameLayout(size: Size, frame: Frame): { outer: Size; inner: Point; radius: number } {
  const unit = (Math.min(size.width, size.height) * Math.max(0, frame.sizePct)) / 100;
  if (frame.kind === "border") {
    const p = Math.round(unit);
    return { outer: { width: size.width + 2 * p, height: size.height + 2 * p }, inner: { x: p, y: p }, radius: 0 };
  }
  if (frame.kind === "polaroid") {
    const p = Math.round(unit);
    const bottom = Math.round(unit * 3.5);
    return { outer: { width: size.width + 2 * p, height: size.height + p + bottom }, inner: { x: p, y: p }, radius: 0 };
  }
  if (frame.kind === "rounded") return { outer: { ...size }, inner: { x: 0, y: 0 }, radius: Math.round(unit) };
  return { outer: { ...size }, inner: { x: 0, y: 0 }, radius: 0 };
}

// ---------- Hit testing ----------

/** Axis-aligned bounds of an object (text needs its measured width/height). */
export function objectBounds(o: EditorObject, measured?: { w: number; h: number }): Rect {
  switch (o.type) {
    case "rect":
    case "ellipse":
      return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), width: Math.abs(o.w), height: Math.abs(o.h) };
    case "line":
    case "arrow": {
      const pad = Math.max(6, o.width);
      return { x: Math.min(o.x1, o.x2) - pad, y: Math.min(o.y1, o.y2) - pad, width: Math.abs(o.x2 - o.x1) + 2 * pad, height: Math.abs(o.y2 - o.y1) + 2 * pad };
    }
    case "image":
      return { x: o.x - o.w / 2, y: o.y - o.h / 2, width: o.w, height: o.h };
    case "text": {
      const w = measured?.w ?? o.size * Math.max(1, o.text.length) * 0.6;
      const h = measured?.h ?? o.size * 1.3;
      return { x: o.x - w / 2, y: o.y - h / 2, width: w, height: h };
    }
  }
}

/** Topmost object under a point (in picture pixels), with a little slack for fingers. */
export function hitTest(objects: EditorObject[], p: Point, slack: number, measured: Record<string, { w: number; h: number }> = {}): string | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const b = objectBounds(objects[i], measured[objects[i].id]);
    if (p.x >= b.x - slack && p.x <= b.x + b.width + slack && p.y >= b.y - slack && p.y <= b.y + b.height + slack) return objects[i].id;
  }
  return null;
}

export function moveObject(o: EditorObject, dx: number, dy: number): EditorObject {
  switch (o.type) {
    case "line":
    case "arrow":
      return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
    default:
      return { ...o, x: o.x + dx, y: o.y + dy };
  }
}

/** Uniformly scales an object around its centre (text size, shape size, line length). */
export function scaleObject(o: EditorObject, k: number): EditorObject {
  const f = Math.max(0.05, k);
  switch (o.type) {
    case "text":
      return { ...o, size: Math.max(4, o.size * f), outline: o.outline * f };
    case "image":
      return { ...o, w: Math.max(4, o.w * f), h: Math.max(4, o.h * f) };
    case "rect":
    case "ellipse": {
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      const w = Math.max(4, o.w * f);
      const h = Math.max(4, o.h * f);
      return { ...o, x: cx - w / 2, y: cy - h / 2, w, h };
    }
    case "line":
    case "arrow": {
      const cx = (o.x1 + o.x2) / 2;
      const cy = (o.y1 + o.y2) / 2;
      return { ...o, x1: cx + (o.x1 - cx) * f, y1: cy + (o.y1 - cy) * f, x2: cx + (o.x2 - cx) * f, y2: cy + (o.y2 - cy) * f };
    }
  }
}

/** Arrow head points for a line from a to b. */
export function arrowHead(a: Point, b: Point, size: number): [Point, Point] {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const spread = Math.PI / 7;
  return [
    { x: b.x - size * Math.cos(ang - spread), y: b.y - size * Math.sin(ang - spread) },
    { x: b.x - size * Math.cos(ang + spread), y: b.y - size * Math.sin(ang + spread) },
  ];
}

/** Gaussian sigma in pixels for the editor's blur slider (0–100), relative to the picture. */
export function blurSigma(value: number, size: Size): number {
  return (Math.max(0, value) / 100) * 0.02 * Math.min(size.width, size.height);
}
