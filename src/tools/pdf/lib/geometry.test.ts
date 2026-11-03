import { describe, expect, it } from "vitest";
import {
  anchorPoint,
  applyMatrix,
  displayRectToUser,
  displaySize,
  displayToUser,
  mmToPt,
  normalizeRotation,
  ptToMm,
  rotatedBounds,
  rotatedOrigin,
  type Rotation,
} from "./geometry";

const box = { x: 10, y: 20, width: 200, height: 300 };

describe("display space → user space", () => {
  it("normalizes rotations", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
  });

  it("swaps width and height for quarter turns", () => {
    expect(displaySize(box, 90)).toEqual({ width: 300, height: 200 });
    expect(displaySize(box, 180)).toEqual({ width: 200, height: 300 });
  });

  // Where the visible bottom-left / top-left corners land in user space for each /Rotate.
  // A reader's top-left is the user-space corner that a clockwise turn brings to the top-left.
  const cases: [Rotation, { bl: [number, number]; tl: [number, number] }][] = [
    [0, { bl: [10, 20], tl: [10, 320] }],
    [90, { bl: [210, 20], tl: [10, 20] }],
    [180, { bl: [210, 320], tl: [210, 20] }],
    [270, { bl: [10, 320], tl: [210, 320] }],
  ];
  it.each(cases)("maps corners for rotation %i", (rotation, expected) => {
    const m = displayToUser(box, rotation);
    const size = displaySize(box, rotation);
    const bl = applyMatrix(m, 0, 0);
    const tl = applyMatrix(m, 0, size.height);
    expect([bl.x, bl.y]).toEqual(expected.bl);
    expect([tl.x, tl.y]).toEqual(expected.tl);
  });

  it("maps a whole display rect to the matching user rect", () => {
    // Rotation 90: the visible page is 300 wide × 200 high.
    // Cutting 30 from the visible left removes 30 from the user bottom.
    const r = displayRectToUser(box, 90, { x: 30, y: 0, width: 270, height: 200 });
    expect(r).toEqual({ x: 10, y: 50, width: 200, height: 270 });
  });
});

describe("anchors", () => {
  const page = { width: 600, height: 800 };
  const item = { width: 100, height: 20 };
  it("places items at each anchor with margins", () => {
    expect(anchorPoint("bottom-center", page, item, 36, 28)).toEqual({ x: 250, y: 28 });
    expect(anchorPoint("top-right", page, item, 36, 28)).toEqual({ x: 464, y: 752 });
    expect(anchorPoint("top-left", page, item, 36, 28)).toEqual({ x: 36, y: 752 });
    expect(anchorPoint("center", page, item, 36, 28)).toEqual({ x: 250, y: 390 });
    expect(anchorPoint("middle-left", page, item, 10, 10)).toEqual({ x: 10, y: 390 });
  });
});

describe("rotation helpers", () => {
  it("keeps the centre fixed when rotating about the bottom-left corner", () => {
    const w = 100;
    const h = 40;
    for (const deg of [0, 30, 45, 90, 180, -60]) {
      const o = rotatedOrigin(300, 400, w, h, deg);
      const t = (deg * Math.PI) / 180;
      // Rotate the rectangle's centre offset about the origin and check it lands on (300, 400).
      const cx = o.x + (w / 2) * Math.cos(t) - (h / 2) * Math.sin(t);
      const cy = o.y + (w / 2) * Math.sin(t) + (h / 2) * Math.cos(t);
      expect(cx).toBeCloseTo(300, 6);
      expect(cy).toBeCloseTo(400, 6);
    }
  });

  it("computes rotated bounds", () => {
    const b = rotatedBounds(100, 50, 90);
    expect(b.width).toBeCloseTo(50);
    expect(b.height).toBeCloseTo(100);
  });

  it("converts mm and points", () => {
    expect(mmToPt(25.4)).toBeCloseTo(72);
    expect(ptToMm(72)).toBeCloseTo(25.4);
  });
});
