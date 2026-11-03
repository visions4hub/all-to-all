import { describe, expect, it } from "vitest";
import {
  centeredRect,
  clampRect,
  computeResize,
  fitRectToRatio,
  fitWithin,
  moveRect,
  ratioValue,
  resizeRect,
  rotatedBounds,
  stepDownPlan,
} from "./geometry";

const base = { keepRatio: true, noUpscale: false } as const;

describe("computeResize", () => {
  it("keeps the ratio from one side", () => {
    expect(computeResize({ width: 800, height: 600 }, { ...base, mode: "pixels", width: 400 })).toEqual({ width: 400, height: 300 });
    expect(computeResize({ width: 800, height: 600 }, { ...base, mode: "pixels", height: 150 })).toEqual({ width: 200, height: 150 });
  });
  it("fits inside both sides when the ratio is locked (mixed batches)", () => {
    expect(computeResize({ width: 800, height: 600 }, { ...base, mode: "pixels", width: 300, height: 300 })).toEqual({ width: 300, height: 225 });
    expect(computeResize({ width: 600, height: 800 }, { ...base, mode: "pixels", width: 300, height: 300 })).toEqual({ width: 225, height: 300 });
  });
  it("gives the exact size without the ratio, keeping an empty side", () => {
    expect(computeResize({ width: 300, height: 300 }, { mode: "pixels", width: 500, height: 120, keepRatio: false, noUpscale: false })).toEqual({ width: 500, height: 120 });
    expect(computeResize({ width: 300, height: 200 }, { mode: "pixels", width: 50, keepRatio: false, noUpscale: false })).toEqual({ width: 50, height: 200 });
  });
  it("scales by percent", () => {
    expect(computeResize({ width: 640, height: 480 }, { ...base, mode: "percent", percent: 25 })).toEqual({ width: 160, height: 120 });
    expect(computeResize({ width: 3, height: 3 }, { ...base, mode: "percent", percent: 1 })).toEqual({ width: 1, height: 1 });
  });
  it("max mode only shrinks", () => {
    expect(computeResize({ width: 4000, height: 3000 }, { ...base, mode: "max", maxWidth: 1920, maxHeight: 1920 })).toEqual({ width: 1920, height: 1440 });
    expect(computeResize({ width: 100, height: 80 }, { ...base, mode: "max", maxWidth: 300, maxHeight: 300 })).toEqual({ width: 100, height: 80 });
    expect(computeResize({ width: 1000, height: 500 }, { ...base, mode: "max", maxWidth: null, maxHeight: 100 })).toEqual({ width: 200, height: 100 });
  });
  it("never enlarges when asked", () => {
    expect(computeResize({ width: 200, height: 100 }, { ...base, mode: "pixels", width: 1000, noUpscale: true })).toEqual({ width: 200, height: 100 });
    expect(computeResize({ width: 200, height: 100 }, { ...base, mode: "percent", percent: 300, noUpscale: true })).toEqual({ width: 200, height: 100 });
    expect(computeResize({ width: 200, height: 100 }, { mode: "pixels", width: 1000, height: 50, keepRatio: false, noUpscale: true })).toEqual({ width: 200, height: 50 });
  });
});

describe("fitWithin / rotatedBounds", () => {
  it("fits keeping the ratio", () => {
    expect(fitWithin({ width: 4000, height: 2000 }, { width: 1000, height: 1000 })).toEqual({ width: 1000, height: 500 });
  });
  it("swaps sides for quarter turns and grows for 45°", () => {
    expect(rotatedBounds({ width: 200, height: 100 }, 90)).toEqual({ width: 100, height: 200 });
    expect(rotatedBounds({ width: 200, height: 100 }, 180)).toEqual({ width: 200, height: 100 });
    expect(rotatedBounds({ width: 200, height: 200 }, 45)).toEqual({ width: 283, height: 283 });
    expect(rotatedBounds({ width: 200, height: 100 }, -90)).toEqual({ width: 100, height: 200 });
  });
});

describe("stepDownPlan", () => {
  it("halves while far from the target and ends exactly on it", () => {
    const plan = stepDownPlan({ width: 4000, height: 3000 }, { width: 500, height: 375 });
    expect(plan[plan.length - 1]).toEqual({ width: 500, height: 375 });
    expect(plan.length).toBeGreaterThan(1);
    for (let i = 1; i < plan.length; i++) expect(plan[i].width).toBeLessThanOrEqual(plan[i - 1].width);
  });
  it("is a single step for small changes and enlargements", () => {
    expect(stepDownPlan({ width: 800, height: 600 }, { width: 600, height: 450 })).toEqual([{ width: 600, height: 450 }]);
    expect(stepDownPlan({ width: 100, height: 100 }, { width: 300, height: 300 })).toEqual([{ width: 300, height: 300 }]);
  });
});

describe("crop rectangles", () => {
  const img = { width: 400, height: 300 };
  it("ratio presets", () => {
    expect(ratioValue("free")).toBeNull();
    expect(ratioValue("16:9")).toBeCloseTo(16 / 9);
    expect(ratioValue("4:5")).toBeCloseTo(0.8);
    expect(ratioValue("custom", { w: 2, h: 1 })).toBe(2);
    expect(ratioValue("custom", { w: 0, h: 1 })).toBeNull();
  });
  it("centred rectangle for a ratio", () => {
    expect(centeredRect(img, 1)).toEqual({ x: 50, y: 0, width: 300, height: 300 });
    expect(centeredRect({ width: 800, height: 800 }, 16 / 9)).toEqual({ x: 0, y: 175, width: 800, height: 450 });
    expect(centeredRect(img, null)).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });
  it("clamps inside the image", () => {
    expect(clampRect({ x: -10, y: 280, width: 50.4, height: 50 }, img)).toEqual({ x: 0, y: 250, width: 50, height: 50 });
    expect(clampRect({ x: 0, y: 0, width: 999, height: 0 }, img)).toEqual({ x: 0, y: 0, width: 400, height: 1 });
  });
  it("moves without leaving the image", () => {
    expect(moveRect({ x: 10, y: 10, width: 100, height: 100 }, 1000, -1000, img)).toEqual({ x: 300, y: 0, width: 100, height: 100 });
  });
  it("resizes freely from a corner, keeping the opposite corner", () => {
    expect(resizeRect({ x: 0, y: 0, width: 400, height: 300 }, "se", -200, -150, null, img)).toEqual({ x: 0, y: 0, width: 200, height: 150 });
    expect(resizeRect({ x: 100, y: 100, width: 100, height: 100 }, "nw", -50, -20, null, img)).toEqual({ x: 50, y: 80, width: 150, height: 120 });
  });
  it("keeps the ratio when resizing and stays inside", () => {
    const r = resizeRect({ x: 50, y: 0, width: 300, height: 300 }, "se", 500, 10, 1, img);
    expect(r.width).toBe(r.height);
    expect(r.x + r.width).toBeLessThanOrEqual(400);
    expect(r.y + r.height).toBeLessThanOrEqual(300);
    const e = resizeRect({ x: 100, y: 100, width: 100, height: 50 }, "e", 40, 0, 2, img);
    expect(e).toEqual({ x: 100, y: 90, width: 140, height: 70 });
  });
  it("never goes below the minimum size", () => {
    const r = resizeRect({ x: 0, y: 0, width: 100, height: 100 }, "se", -500, -500, null, img, 8);
    expect(r).toEqual({ x: 0, y: 0, width: 8, height: 8 });
  });
  it("re-fits a rectangle to a new ratio around its centre", () => {
    const r = fitRectToRatio({ x: 0, y: 0, width: 400, height: 300 }, 1, img);
    expect(r.width).toBe(r.height);
    expect(r.width).toBeLessThanOrEqual(300);
  });
});
