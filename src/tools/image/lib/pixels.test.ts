import { describe, expect, it } from "vitest";
import { applyAdjustments, applyColorAdjustments, boxesForGauss, gaussianBlur, NEUTRAL_ADJUSTMENTS, pixelate, sharpen, toneLut, type Pixels } from "./pixels";

function solid(w: number, h: number, rgba: [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { data, width: w, height: h };
}
const px = (p: Pixels, x: number, y: number) => Array.from(p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4));

describe("tone and colour", () => {
  it("neutral settings change nothing", () => {
    const p = solid(4, 4, [10, 120, 250, 255]);
    applyAdjustments(p, NEUTRAL_ADJUSTMENTS);
    expect(px(p, 1, 1)).toEqual([10, 120, 250, 255]);
    expect(Array.from(toneLut({ brightness: 0, contrast: 0, exposure: 0 }))).toEqual(Array.from({ length: 256 }, (_, i) => i));
  });
  it("brightness and exposure brighten, contrast spreads from the middle", () => {
    expect(toneLut({ brightness: 20, contrast: 0, exposure: 0 })[100]).toBe(151);
    expect(toneLut({ brightness: 0, contrast: 0, exposure: 1 })[100]).toBe(200);
    const c = toneLut({ brightness: 0, contrast: 50, exposure: 0 });
    expect(c[128]).toBe(128);
    expect(c[200]).toBeGreaterThan(200);
    expect(c[50]).toBeLessThan(50);
  });
  it("grayscale 100 makes r = g = b; saturation -100 too", () => {
    const a = solid(1, 1, [200, 50, 10, 255]);
    applyColorAdjustments(a, { ...NEUTRAL_ADJUSTMENTS, grayscale: 100 });
    const [r, g, b] = px(a, 0, 0);
    expect(r).toBe(g);
    expect(g).toBe(b);
    const s = solid(1, 1, [200, 50, 10, 255]);
    applyColorAdjustments(s, { ...NEUTRAL_ADJUSTMENTS, saturation: -100 });
    expect(px(s, 0, 0).slice(0, 3)).toEqual([r, g, b]);
  });
  it("sepia gives warm tones (r > g > b) and keeps alpha", () => {
    const p = solid(1, 1, [100, 100, 100, 77]);
    applyColorAdjustments(p, { ...NEUTRAL_ADJUSTMENTS, sepia: 100 });
    const [r, g, b, a] = px(p, 0, 0);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(a).toBe(77);
  });
});

describe("blur, sharpen, pixelate", () => {
  it("box sizes approximate the Gaussian", () => {
    const boxes = boxesForGauss(5);
    expect(boxes).toHaveLength(3);
    // Variance of three boxes ≈ sigma².
    const variance = boxes.reduce((v, r) => v + ((2 * r + 1) ** 2 - 1) / 12, 0);
    expect(Math.abs(variance - 25)).toBeLessThan(4);
  });
  it("blur keeps a flat image flat and smooths an edge", () => {
    const flat = solid(20, 20, [90, 90, 90, 255]);
    gaussianBlur(flat, 3);
    expect(px(flat, 10, 10)).toEqual([90, 90, 90, 255]);

    const edge = solid(40, 4, [0, 0, 0, 255]);
    for (let y = 0; y < 4; y++) for (let x = 20; x < 40; x++) edge.data.set([255, 255, 255, 255], (y * 40 + x) * 4);
    gaussianBlur(edge, 3);
    expect(px(edge, 19, 2)[0]).toBeGreaterThan(60);
    expect(px(edge, 19, 2)[0]).toBeLessThan(200);
    expect(px(edge, 0, 2)[0]).toBeLessThan(5);
    expect(px(edge, 39, 2)[0]).toBeGreaterThan(250);
  });
  it("blur doesn't darken colour next to transparent pixels", () => {
    const p = solid(20, 1, [0, 0, 0, 0]);
    for (let x = 10; x < 20; x++) p.data.set([255, 0, 0, 255], x * 4);
    gaussianBlur(p, 2);
    const [r, , , a] = px(p, 10, 0);
    expect(a).toBeGreaterThan(0);
    expect(r).toBeGreaterThan(240);
  });
  it("sharpen increases contrast at an edge and leaves flat areas", () => {
    const p = solid(20, 1, [100, 100, 100, 255]);
    for (let x = 10; x < 20; x++) p.data.set([160, 160, 160, 255], x * 4);
    sharpen(p, 100);
    expect(px(p, 9, 0)[0]).toBeLessThan(100);
    expect(px(p, 10, 0)[0]).toBeGreaterThan(160);
    expect(px(p, 2, 0)[0]).toBe(100);
  });
  it("pixelate fills each block with its average", () => {
    const p = solid(4, 2, [0, 0, 0, 255]);
    p.data.set([200, 100, 0, 255], 0);
    p.data.set([0, 100, 200, 255], 4);
    pixelate(p, 2);
    expect(px(p, 0, 0)).toEqual(px(p, 1, 1));
    expect(px(p, 0, 0)).toEqual([50, 50, 50, 255]);
    expect(px(p, 2, 0)).toEqual([0, 0, 0, 255]);
  });
});
