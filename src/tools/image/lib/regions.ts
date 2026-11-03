// Regions for the blur / pixelate tool, and a small undo/redo history kept in
// the tool's settings. Pure; unit-tested.

import type { Rect, Size } from "./geometry";

export type RegionShape = "rect" | "ellipse";
export type RegionEffect = "blur" | "pixelate" | "mask";

/** Position and size are fractions (0–1) of the image, so they survive any preview scale. */
export type Region = {
  id: string;
  shape: RegionShape;
  effect: RegionEffect;
  /** 1–100 */
  strength: number;
  /** Mask colour. */
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RegionMap = Record<string, Region[]>;

export type RegionHistory = { past: RegionMap[]; future: RegionMap[] };

const HISTORY_LIMIT = 60;

export function commit(current: RegionMap, history: RegionHistory, next: RegionMap): { regions: RegionMap; history: RegionHistory } {
  return { regions: next, history: { past: [...history.past, current].slice(-HISTORY_LIMIT), future: [] } };
}

export function undo(current: RegionMap, history: RegionHistory): { regions: RegionMap; history: RegionHistory } {
  if (!history.past.length) return { regions: current, history };
  return {
    regions: history.past[history.past.length - 1],
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
  };
}

export function redo(current: RegionMap, history: RegionHistory): { regions: RegionMap; history: RegionHistory } {
  if (!history.future.length) return { regions: current, history };
  return { regions: history.future[0], history: { past: [...history.past, current], future: history.future.slice(1) } };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A region from two corner points (any drag direction), kept inside the image. */
export function regionFromPoints(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x1 = clamp01(Math.min(a.x, b.x));
  const y1 = clamp01(Math.min(a.y, b.y));
  const x2 = clamp01(Math.max(a.x, b.x));
  const y2 = clamp01(Math.max(a.y, b.y));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function moveRegion<T extends { x: number; y: number; w: number; h: number }>(r: T, dx: number, dy: number): T {
  return { ...r, x: Math.min(1 - r.w, Math.max(0, r.x + dx)), y: Math.min(1 - r.h, Math.max(0, r.y + dy)) };
}

/** Region in whole image pixels (at least 1×1, inside the image). */
export function regionPixels(r: Pick<Region, "x" | "y" | "w" | "h">, img: Size): Rect {
  const x = Math.max(0, Math.min(img.width - 1, Math.floor(r.x * img.width)));
  const y = Math.max(0, Math.min(img.height - 1, Math.floor(r.y * img.height)));
  const x2 = Math.max(x + 1, Math.min(img.width, Math.ceil((r.x + r.w) * img.width)));
  const y2 = Math.max(y + 1, Math.min(img.height, Math.ceil((r.y + r.h) * img.height)));
  return { x, y, width: x2 - x, height: y2 - y };
}

/**
 * Effect size in pixels for a strength (1–100), relative to the image's shorter
 * side so the preview matches the export. Pixel blocks are never smaller than
 * 4px at full strength range minimum, blur at least 1px.
 */
export function effectPixels(effect: RegionEffect, strength: number, img: Size): number {
  const short = Math.min(img.width, img.height);
  const s = Math.max(1, Math.min(100, strength)) / 100;
  if (effect === "pixelate") return Math.max(2, Math.round(short * 0.1 * s));
  if (effect === "blur") return Math.max(1, short * 0.04 * s);
  return 0;
}
