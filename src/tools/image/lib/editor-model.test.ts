import { describe, expect, it } from "vitest";
import {
  arrowHead,
  blurSigma,
  frameLayout,
  hitTest,
  mapPoint,
  moveObject,
  opSize,
  pushHistory,
  redoHistory,
  scaleObject,
  transformObjects,
  transformStrokes,
  undoHistory,
  type EditorObject,
  type GeoOp,
} from "./editor-model";

const size = { width: 400, height: 300 };
const text: EditorObject = { id: "t", type: "text", x: 100, y: 50, text: "مرحبا", font: "plex", size: 20, bold: true, color: "#000", outlineColor: "#fff", outline: 2, rotation: 10 };
const rect: EditorObject = { id: "r", type: "rect", x: 10, y: 20, w: 100, h: 50, stroke: "#f00", fill: "none", strokeWidth: 4 };
const line: EditorObject = { id: "l", type: "line", x1: 0, y1: 0, x2: 40, y2: 30, color: "#00f", width: 2 };

describe("geometric operations", () => {
  it("maps corners correctly for rotations and flips", () => {
    const cw: GeoOp = { kind: "rotate", cw: true };
    const ccw: GeoOp = { kind: "rotate", cw: false };
    expect(opSize(cw, size)).toEqual({ width: 300, height: 400 });
    // Top-left goes to top-right for a clockwise turn, bottom-left for counter-clockwise.
    expect(mapPoint(cw, { x: 0, y: 0 }, size)).toEqual({ x: 300, y: 0 });
    expect(mapPoint(ccw, { x: 0, y: 0 }, size)).toEqual({ x: 0, y: 400 });
    expect(mapPoint({ kind: "flip", axis: "h" }, { x: 10, y: 20 }, size)).toEqual({ x: 390, y: 20 });
    expect(mapPoint({ kind: "flip", axis: "v" }, { x: 10, y: 20 }, size)).toEqual({ x: 10, y: 280 });
    expect(mapPoint({ kind: "crop", rect: { x: 50, y: 40, width: 100, height: 100 } }, { x: 60, y: 45 }, size)).toEqual({ x: 10, y: 5 });
    expect(mapPoint({ kind: "resize", size: { width: 200, height: 150 } }, { x: 100, y: 50 }, size)).toEqual({ x: 50, y: 25 });
  });
  it("four clockwise turns bring a point back", () => {
    let p = { x: 37, y: 91 };
    let s = size;
    for (let i = 0; i < 4; i++) {
      p = mapPoint({ kind: "rotate", cw: true }, p, s);
      s = opSize({ kind: "rotate", cw: true }, s);
    }
    expect(p).toEqual({ x: 37, y: 91 });
  });
  it("objects follow the picture", () => {
    const [t, r, l] = transformObjects([text, rect, line], { kind: "rotate", cw: true }, size);
    expect(t).toMatchObject({ x: 250, y: 100, rotation: 100 });
    // Rect centre (60, 45) → (255, 60); sides swap.
    expect(r).toMatchObject({ x: 230, y: 10, w: 50, h: 100 });
    expect(l).toMatchObject({ x1: 300, y1: 0, x2: 270, y2: 40 });

    const [ft] = transformObjects([text], { kind: "flip", axis: "h" }, size);
    expect(ft).toMatchObject({ x: 300, y: 50, rotation: -10 });

    const [rt, rr] = transformObjects([text, rect], { kind: "resize", size: { width: 200, height: 150 } }, size);
    expect(rt).toMatchObject({ x: 50, y: 25, size: 10, outline: 1 });
    expect(rr).toMatchObject({ x: 5, y: 10, w: 50, h: 25, strokeWidth: 2 });
  });
  it("strokes follow the picture and scale their width", () => {
    const [s] = transformStrokes([{ mode: "draw", color: "#000", width: 10, points: [0, 0, 400, 300] }], { kind: "resize", size: { width: 200, height: 150 } }, size);
    expect(s.points).toEqual([0, 0, 200, 150]);
    expect(s.width).toBe(5);
  });
});

describe("frames", () => {
  it("border adds equal padding, polaroid a deeper bottom, rounded keeps the size", () => {
    expect(frameLayout(size, { kind: "border", color: "#fff", sizePct: 4 })).toEqual({ outer: { width: 424, height: 324 }, inner: { x: 12, y: 12 }, radius: 0 });
    expect(frameLayout(size, { kind: "polaroid", color: "#fff", sizePct: 4 })).toEqual({ outer: { width: 424, height: 354 }, inner: { x: 12, y: 12 }, radius: 0 });
    expect(frameLayout(size, { kind: "rounded", color: "#fff", sizePct: 10 })).toEqual({ outer: size, inner: { x: 0, y: 0 }, radius: 30 });
    expect(frameLayout(size, { kind: "none", color: "#fff", sizePct: 10 }).outer).toEqual(size);
  });
});

describe("selection and editing", () => {
  it("hit-tests the topmost object", () => {
    const top: EditorObject = { ...rect, id: "top", x: 50, y: 30 };
    expect(hitTest([rect, top], { x: 60, y: 40 }, 0)).toBe("top");
    expect(hitTest([rect, top], { x: 15, y: 25 }, 0)).toBe("r");
    expect(hitTest([rect], { x: 300, y: 250 }, 5)).toBeNull();
    expect(hitTest([text], { x: 100, y: 50 }, 0, { t: { w: 60, h: 24 } })).toBe("t");
  });
  it("moves and scales", () => {
    expect(moveObject(line, 5, 5)).toMatchObject({ x1: 5, y1: 5, x2: 45, y2: 35 });
    expect(moveObject(rect, -10, 0)).toMatchObject({ x: 0, y: 20 });
    expect(scaleObject(rect, 2)).toMatchObject({ x: -40, y: -5, w: 200, h: 100 });
    expect(scaleObject(text, 0.5)).toMatchObject({ size: 10 });
  });
  it("arrow head points back along the line", () => {
    const [a, b] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(a.x).toBeLessThan(100);
    expect(b.x).toBeLessThan(100);
    expect(a.y).toBeCloseTo(-b.y);
  });
  it("blur strength is relative to the picture", () => {
    expect(blurSigma(100, { width: 1000, height: 500 })).toBe(10);
    expect(blurSigma(50, { width: 200, height: 100 })).toBe(1);
  });
  it("history: undo, redo, and a new change clears redo", () => {
    let h = pushHistory<string>("a", { past: [], future: [] });
    h = pushHistory("b", h);
    const u = undoHistory("c", h);
    expect(u.value).toBe("b");
    const r = redoHistory(u.value, u.history);
    expect(r.value).toBe("c");
    expect(pushHistory("x", u.history).future).toEqual([]);
  });
});
