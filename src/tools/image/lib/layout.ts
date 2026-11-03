// Placement math for watermarks, captions and tiles. Pure; unit-tested.

import type { Size } from "./geometry";

export type Point = { x: number; y: number };

/** Nine positions on the image. Physical (top-left is always top-left), whatever the UI language. */
export type Anchor = "tl" | "tc" | "tr" | "ml" | "c" | "mr" | "bl" | "bc" | "br";
export const ANCHORS: Anchor[] = ["tl", "tc", "tr", "ml", "c", "mr", "bl", "bc", "br"];

/**
 * Centre point for a box of size `box` (already including any rotation) placed
 * at `anchor`, `margin` pixels from the edges. If the box is larger than the
 * image the box is centred on that axis.
 */
export function anchorCenter(anchor: Anchor, canvas: Size, box: Size, margin: number): Point {
  const col = anchor === "c" || anchor[1] === "c" ? 1 : anchor[1] === "l" ? 0 : 2;
  const row = anchor === "c" || anchor[0] === "m" ? 1 : anchor[0] === "t" ? 0 : 2;
  const along = (index: number, length: number, size: number) => {
    if (size + 2 * margin >= length || index === 1) return length / 2;
    return index === 0 ? margin + size / 2 : length - margin - size / 2;
  };
  return { x: along(col, canvas.width, box.width), y: along(row, canvas.height, box.height) };
}

/** Rotates point p around c by `degrees` (clockwise on screen, y pointing down). */
export function rotatePoint(p: Point, c: Point, degrees: number): Point {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/**
 * Centres for a tiled (repeated) watermark. The grid is laid out in the
 * rotated frame, with every other row shifted by half a step (brick pattern),
 * and covers the whole image. Only tiles that can touch the image are returned.
 */
export function tileCenters(canvas: Size, box: Size, gap: number, degrees: number): Point[] {
  const stepX = Math.max(1, box.width + gap);
  const stepY = Math.max(1, box.height + gap);
  const c = { x: canvas.width / 2, y: canvas.height / 2 };
  const half = Math.hypot(canvas.width, canvas.height) / 2 + Math.max(stepX, stepY);
  const reach = Math.hypot(box.width, box.height) / 2;
  const out: Point[] = [];
  const rows = Math.ceil(half / stepY);
  const cols = Math.ceil(half / stepX) + 1;
  for (let j = -rows; j <= rows; j++) {
    const shift = Math.abs(j) % 2 === 1 ? stepX / 2 : 0;
    for (let i = -cols; i <= cols; i++) {
      const p = rotatePoint({ x: c.x + i * stepX + shift, y: c.y + j * stepY }, c, degrees);
      if (p.x < -reach || p.y < -reach || p.x > canvas.width + reach || p.y > canvas.height + reach) continue;
      out.push(p);
    }
  }
  return out;
}

const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;
const LTR_CHAR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

/** Direction of the first strong character, like the HTML dir="auto" rule. */
export function textDirection(text: string): "rtl" | "ltr" {
  for (const ch of text) {
    if (RTL_CHAR.test(ch)) return "rtl";
    if (LTR_CHAR.test(ch)) return "ltr";
  }
  return "ltr";
}

/** Converts a percentage of the image's shorter side into pixels (keeps batches consistent). */
export function pctOfShortSide(canvas: Size, pct: number): number {
  return (Math.min(canvas.width, canvas.height) * pct) / 100;
}

/**
 * Greedy word wrap. `measure` returns the width of a string in pixels.
 * Explicit newlines are kept; a single word longer than the line stays whole.
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (measure(candidate) <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}
