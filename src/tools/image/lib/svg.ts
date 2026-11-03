// SVG size handling for rasterising. Pure parts are unit-tested.

import type { Size } from "./geometry";

const UNIT_PX: Record<string, number> = { "": 1, px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };

/** A CSS length in absolute units → pixels. Percentages, em etc. return null (they need a container). */
export function parseLength(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^\s*([+]?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(value);
  if (!m) return null;
  const unit = m[2].toLowerCase();
  if (!(unit in UNIT_PX)) return null;
  const n = Number(m[1]) * UNIT_PX[unit];
  return n > 0 && Number.isFinite(n) ? n : null;
}

export function parseViewBox(value: string | null | undefined): { x: number; y: number; width: number; height: number } | null {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || parts[2] <= 0 || parts[3] <= 0) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/**
 * The size an SVG wants to be drawn at: width/height attributes, or the
 * viewBox when they're missing or relative; null if neither gives a size.
 */
export function svgIntrinsicSize(attrs: { width?: string | null; height?: string | null; viewBox?: string | null }): Size | null {
  const w = parseLength(attrs.width);
  const h = parseLength(attrs.height);
  const vb = parseViewBox(attrs.viewBox);
  if (w && h) return { width: w, height: h };
  if (vb) {
    const ratio = vb.width / vb.height;
    if (w) return { width: w, height: w / ratio };
    if (h) return { width: h * ratio, height: h };
    return { width: vb.width, height: vb.height };
  }
  return null;
}
