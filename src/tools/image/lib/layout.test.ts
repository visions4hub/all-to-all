import { describe, expect, it } from "vitest";
import { anchorCenter, pctOfShortSide, rotatePoint, textDirection, tileCenters, wrapText } from "./layout";
import { effectPixels, commit, moveRegion, redo, regionFromPoints, regionPixels, undo, type RegionMap } from "./regions";
import { parseLength, parseViewBox, svgIntrinsicSize } from "./svg";
import { formatForKind, resolveFormat, sniffFormat } from "./format";

const canvas = { width: 1000, height: 500 };
const box = { width: 200, height: 100 };

describe("watermark placement", () => {
  it("places the nine anchors with a margin", () => {
    expect(anchorCenter("tl", canvas, box, 20)).toEqual({ x: 120, y: 70 });
    expect(anchorCenter("br", canvas, box, 20)).toEqual({ x: 880, y: 430 });
    expect(anchorCenter("c", canvas, box, 20)).toEqual({ x: 500, y: 250 });
    expect(anchorCenter("tc", canvas, box, 20)).toEqual({ x: 500, y: 70 });
    expect(anchorCenter("ml", canvas, box, 0)).toEqual({ x: 100, y: 250 });
  });
  it("centres a box that doesn't fit", () => {
    expect(anchorCenter("tl", { width: 100, height: 100 }, { width: 300, height: 50 }, 10)).toEqual({ x: 50, y: 35 });
  });
  it("rotates points clockwise on screen", () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
  });
  it("tiles cover the whole image, also when rotated", () => {
    for (const angle of [0, 30, -45, 90]) {
      const tiles = tileCenters(canvas, box, 40, angle);
      expect(tiles.length).toBeGreaterThan(8);
      // Every corner and the centre has a tile within one step.
      for (const pt of [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 500 }, { x: 1000, y: 500 }, { x: 500, y: 250 }]) {
        const nearest = Math.min(...tiles.map((t) => Math.hypot(t.x - pt.x, t.y - pt.y)));
        expect(nearest).toBeLessThan(Math.hypot(240, 140));
      }
    }
  });
  it("sizes relative to the shorter side", () => {
    expect(pctOfShortSide(canvas, 10)).toBe(50);
  });
});

describe("text", () => {
  it("detects direction from the first strong character", () => {
    expect(textDirection("مرحبا Hello")).toBe("rtl");
    expect(textDirection("© 2026 حقوق")).toBe("rtl");
    expect(textDirection("Hello مرحبا")).toBe("ltr");
    expect(textDirection("123")).toBe("ltr");
  });
  it("wraps words to a width and keeps newlines", () => {
    const measure = (s: string) => s.length * 10;
    expect(wrapText("one two three four", 90, measure)).toEqual(["one two", "three", "four"]);
    expect(wrapText("a\n\nb", 100, measure)).toEqual(["a", "", "b"]);
    expect(wrapText("supercalifragilistic", 50, measure)).toEqual(["supercalifragilistic"]);
  });
});

describe("blur regions", () => {
  it("normalises drag points in any direction and clamps", () => {
    expect(regionFromPoints({ x: 0.8, y: 0.9 }, { x: 0.2, y: -0.5 })).toEqual({ x: 0.2, y: 0, w: expect.closeTo(0.6), h: 0.9 });
  });
  it("moves inside the image", () => {
    expect(moveRegion({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, 0.5, -1)).toEqual({ x: 0.6, y: 0, w: 0.4, h: 0.4 });
  });
  it("converts to whole pixels covering the area", () => {
    expect(regionPixels({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 }, { width: 400, height: 300 })).toEqual({ x: 40, y: 30, width: 160, height: 120 });
    expect(regionPixels({ x: 0.999, y: 0, w: 0.0001, h: 0.0001 }, { width: 400, height: 300 })).toEqual({ x: 399, y: 0, width: 1, height: 1 });
  });
  it("effect strength scales with the image", () => {
    expect(effectPixels("pixelate", 100, { width: 1000, height: 500 })).toBe(50);
    expect(effectPixels("pixelate", 100, { width: 500, height: 250 })).toBe(25);
    expect(effectPixels("pixelate", 1, { width: 100, height: 100 })).toBe(2);
    expect(effectPixels("blur", 50, { width: 1000, height: 1000 })).toBe(20);
  });
  it("undo / redo history", () => {
    const a: RegionMap = {};
    const b: RegionMap = { f: [] };
    const c: RegionMap = { f: [], g: [] };
    let st = commit(a, { past: [], future: [] }, b);
    st = commit(st.regions, st.history, c);
    expect(st.regions).toBe(c);
    let u = undo(st.regions, st.history);
    expect(u.regions).toBe(b);
    u = undo(u.regions, u.history);
    expect(u.regions).toBe(a);
    expect(undo(u.regions, u.history).regions).toBe(a);
    const r = redo(u.regions, u.history);
    expect(r.regions).toBe(b);
    // A new change clears the redo list.
    const n = commit(r.regions, r.history, { new: [] });
    expect(n.history.future).toEqual([]);
  });
});

describe("SVG sizes", () => {
  it("parses absolute lengths", () => {
    expect(parseLength("120")).toBe(120);
    expect(parseLength("2in")).toBe(192);
    expect(parseLength("72pt")).toBe(96);
    expect(parseLength("100%")).toBeNull();
    expect(parseLength("3em")).toBeNull();
    expect(parseLength("")).toBeNull();
  });
  it("uses width/height, or the viewBox", () => {
    expect(svgIntrinsicSize({ width: "80", height: "40" })).toEqual({ width: 80, height: 40 });
    expect(svgIntrinsicSize({ viewBox: "0 0 100 50" })).toEqual({ width: 100, height: 50 });
    expect(svgIntrinsicSize({ width: "200", viewBox: "0,0,100,50" })).toEqual({ width: 200, height: 100 });
    expect(svgIntrinsicSize({ width: "100%", height: "100%", viewBox: "0 0 30 10" })).toEqual({ width: 30, height: 10 });
    expect(svgIntrinsicSize({})).toBeNull();
    expect(parseViewBox("0 0 -1 5")).toBeNull();
  });
});

describe("formats", () => {
  it("maps input kinds to output formats", () => {
    expect(formatForKind("jpeg")).toBe("jpeg");
    expect(formatForKind("webp")).toBe("webp");
    expect(formatForKind("png")).toBe("png");
    expect(formatForKind("gif")).toBe("png");
    expect(resolveFormat("keep", "jpeg")).toBe("jpeg");
    expect(resolveFormat("webp", "jpeg")).toBe("webp");
  });
  it("sniffs encoded bytes", () => {
    expect(sniffFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("png");
    expect(sniffFormat(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffFormat(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
