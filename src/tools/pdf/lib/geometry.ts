// Page geometry shared by every tool that draws on a page.
//
// "Display space" is the page as a reader sees it: after /Rotate is applied and
// limited to the CropBox, with the origin at the bottom-left and y pointing up
// (PDF convention), in points. Tools position things in display space; the
// matrix below maps them into the page's own user space.

export type Box = { x: number; y: number; width: number; height: number };
export type Rotation = 0 | 90 | 180 | 270;
/** PDF matrix [a b c d e f]: x' = a·x + c·y + e, y' = b·x + d·y + f */
export type Matrix = [number, number, number, number, number, number];

export function normalizeRotation(degrees: number): Rotation {
  const r = (((Math.round(degrees / 90) * 90) % 360) + 360) % 360;
  return r as Rotation;
}

export function displaySize(box: Box, rotation: Rotation): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
}

/** Matrix from display space (y up, origin at the visible bottom-left) to user space. */
export function displayToUser(box: Box, rotation: Rotation): Matrix {
  const { x: cx, y: cy, width: cw, height: ch } = box;
  switch (rotation) {
    case 0:
      return [1, 0, 0, 1, cx, cy];
    case 90:
      return [0, 1, -1, 0, cx + cw, cy];
    case 180:
      return [-1, 0, 0, -1, cx + cw, cy + ch];
    case 270:
      return [0, -1, 1, 0, cx, cy + ch];
  }
}

export function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Maps a display-space rectangle to the user-space rectangle that covers it. */
export function displayRectToUser(box: Box, rotation: Rotation, rect: Box): Box {
  const m = displayToUser(box, rotation);
  const a = applyMatrix(m, rect.x, rect.y);
  const b = applyMatrix(m, rect.x + rect.width, rect.y + rect.height);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export type Anchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const ANCHORS: Anchor[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

/**
 * Bottom-left corner (display space) of an item of size w×h placed at an anchor,
 * keeping `marginX` / `marginY` from the page edges.
 */
export function anchorPoint(
  anchor: Anchor,
  page: { width: number; height: number },
  item: { width: number; height: number },
  marginX: number,
  marginY: number,
): { x: number; y: number } {
  const [v, h] = anchor === "center" ? ["middle", "center"] : anchor.split("-");
  const x = h === "left" ? marginX : h === "right" ? page.width - marginX - item.width : (page.width - item.width) / 2;
  const y = v === "bottom" ? marginY : v === "top" ? page.height - marginY - item.height : (page.height - item.height) / 2;
  return { x, y };
}

/**
 * pdf-lib rotates drawn items about their bottom-left corner (counter-clockwise, degrees).
 * Returns where that corner must be so the item ends up rotated about its centre.
 */
export function rotatedOrigin(cx: number, cy: number, width: number, height: number, degrees: number): { x: number; y: number } {
  const t = (degrees * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const dx = width / 2;
  const dy = height / 2;
  return { x: cx - (dx * cos - dy * sin), y: cy - (dx * sin + dy * cos) };
}

/** Axis-aligned size of a w×h rectangle rotated by `degrees`. */
export function rotatedBounds(width: number, height: number, degrees: number): { width: number; height: number } {
  const t = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(t));
  const s = Math.abs(Math.sin(t));
  return { width: width * c + height * s, height: width * s + height * c };
}

export const MM_PER_PT = 25.4 / 72;
export const mmToPt = (mm: number) => mm / MM_PER_PT;
export const ptToMm = (pt: number) => pt * MM_PER_PT;
