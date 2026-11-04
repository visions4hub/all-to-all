import { describe, expect, it } from "vitest";
import { GifReader } from "omggif";
import { encodeGif, frameRect, gifOutputSize, gifRepeat, type GifJob } from "./gif";
import { runJob } from "./jobs";
import type { Pixels } from "./pixels";

function solid(width: number, height: number, rgba: [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { data, width, height };
}

function gradient(width: number, height: number, shift: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data.set([(x * 255) / width, (y * 255) / height, (shift * 60) % 256, 255], i);
    }
  return { data, width, height };
}

const job = (frames: Pixels[], patch: Partial<GifJob> = {}): GifJob => ({
  frames,
  delays: frames.map(() => 500),
  plays: 0,
  colors: 256,
  globalPalette: false,
  dither: false,
  transparent: false,
  ...patch,
});

function decodeAll(bytes: Uint8Array) {
  const reader = new GifReader(bytes);
  const frames = Array.from({ length: reader.numFrames() }, (_, i) => {
    const px = new Uint8Array(reader.width * reader.height * 4);
    reader.decodeAndBlitFrameRGBA(i, px);
    return { info: reader.frameInfo(i), px };
  });
  return { reader, frames };
}

const at = (px: Uint8Array, width: number, x: number, y: number) => Array.from(px.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));

describe("GIF encoder (checked with an independent decoder, omggif)", () => {
  it("3 solid frames: valid GIF89a, frame count, size, delays, loop forever, exact colours", () => {
    const bytes = encodeGif(job([solid(40, 30, [255, 0, 0, 255]), solid(40, 30, [0, 255, 0, 255]), solid(40, 30, [0, 0, 255, 255])], { delays: [100, 250, 1000] }));
    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe("GIF89a");
    expect(bytes.at(-1)).toBe(0x3b);
    const { reader, frames } = decodeAll(bytes);
    expect([reader.width, reader.height]).toEqual([40, 30]);
    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f.info.delay)).toEqual([10, 25, 100]); // 1/100 s
    expect(reader.loopCount()).toBe(0);
    expect(at(frames[0].px, 40, 5, 5)).toEqual([255, 0, 0, 255]);
    expect(at(frames[1].px, 40, 39, 29)).toEqual([0, 255, 0, 255]);
    expect(at(frames[2].px, 40, 20, 15)).toEqual([0, 0, 255, 255]);
  });

  it("play once writes no loop block; N plays write N-1 repeats", () => {
    const frames = () => [solid(8, 8, [10, 20, 30, 255]), solid(8, 8, [200, 100, 50, 255])];
    expect(new GifReader(encodeGif(job(frames(), { plays: 1 }))).loopCount()).toBeNull();
    expect(new GifReader(encodeGif(job(frames(), { plays: 3 }))).loopCount()).toBe(2);
    expect(gifRepeat(0)).toBe(0);
    expect(gifRepeat(1)).toBe(-1);
    expect(gifRepeat(5)).toBe(4);
  });

  it("global palette: one colour table for all frames; per-frame: local tables", () => {
    const frames = () => [gradient(32, 16, 0), gradient(32, 16, 1), gradient(32, 16, 2)];
    const global = encodeGif(job(frames(), { globalPalette: true, colors: 64 }));
    const local = encodeGif(job(frames(), { globalPalette: false, colors: 64 }));
    const g = decodeAll(global);
    const l = decodeAll(local);
    expect(g.frames.map((f) => f.info.palette_offset === g.frames[0].info.palette_offset)).toEqual([true, true, true]);
    expect(new Set(l.frames.map((f) => f.info.palette_offset)).size).toBe(3);
    // Fewer colours than asked are fine; more never.
    for (const f of g.frames) {
      const colours = new Set<string>();
      for (let i = 0; i < f.px.length; i += 4) colours.add(f.px.subarray(i, i + 3).join());
      expect(colours.size).toBeLessThanOrEqual(64);
    }
    // Colours stay close to the source.
    const src = gradient(32, 16, 1);
    let diff = 0;
    for (let i = 0; i < src.data.length; i += 4) for (let c = 0; c < 3; c++) diff += Math.abs(src.data[i + c] - l.frames[1].px[i + c]);
    expect(diff / (src.data.length * 0.75)).toBeLessThan(10);
  });

  it("dithering changes the indices but keeps the frame valid", () => {
    const plain = decodeAll(encodeGif(job([gradient(32, 16, 0), gradient(32, 16, 1)], { colors: 8 })));
    const dithered = decodeAll(encodeGif(job([gradient(32, 16, 0), gradient(32, 16, 1)], { colors: 8, dither: true })));
    expect(dithered.frames).toHaveLength(2);
    expect(Buffer.from(dithered.frames[0].px).equals(Buffer.from(plain.frames[0].px))).toBe(false);
  });

  it("transparency: transparent pixels stay transparent and frames are cleared between them", () => {
    const f = solid(10, 10, [0, 0, 0, 0]);
    for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) f.data.set([255, 0, 0, 255], (y * 10 + x) * 4);
    const bytes = encodeGif(job([f, solid(10, 10, [0, 0, 0, 0])], { transparent: true }));
    const { frames } = decodeAll(bytes);
    expect(frames[0].info.transparent_index).not.toBeNull();
    expect(frames[0].info.disposal).toBe(2);
    expect(at(frames[0].px, 10, 0, 0)[3]).toBe(0);
    expect(at(frames[0].px, 10, 5, 5)).toEqual([255, 0, 0, 255]);
  });

  it("without transparency, semi-transparent pixels become opaque", () => {
    const { frames } = decodeAll(encodeGif(job([solid(4, 4, [0, 128, 0, 60]), solid(4, 4, [0, 0, 0, 255])])));
    expect(frames[0].info.transparent_index).toBeNull();
    expect(at(frames[0].px, 4, 1, 1)[3]).toBe(255);
  });

  it("runs through the worker job and rejects frames of different sizes", async () => {
    const result = await runJob({ op: "gif", ...job([solid(6, 6, [1, 2, 3, 255]), solid(6, 6, [9, 8, 7, 255])]) });
    expect(result.op).toBe("gif");
    if (result.op === "gif") expect(new GifReader(result.bytes).numFrames()).toBe(2);
    expect(() => encodeGif(job([solid(6, 6, [0, 0, 0, 255]), solid(5, 6, [0, 0, 0, 255])]))).toThrow();
  });
});

describe("GIF frame layout", () => {
  it("contain letterboxes and centres", () => {
    expect(frameRect({ width: 200, height: 100 }, { width: 100, height: 100 }, "contain")).toEqual({ sx: 0, sy: 0, sw: 200, sh: 100, dx: 0, dy: 25, dw: 100, dh: 50 });
  });
  it("cover crops the middle of the source", () => {
    expect(frameRect({ width: 200, height: 100 }, { width: 100, height: 100 }, "cover")).toEqual({ sx: 50, sy: 0, sw: 100, sh: 100, dx: 0, dy: 0, dw: 100, dh: 100 });
  });
  it("stretch fills the frame", () => {
    expect(frameRect({ width: 30, height: 10 }, { width: 50, height: 50 }, "stretch")).toMatchObject({ dx: 0, dy: 0, dw: 50, dh: 50 });
  });
  it("output size: first image fitted within the max side, or custom with ratio", () => {
    const first = { width: 1200, height: 800 };
    expect(gifOutputSize(first, { sizeMode: "auto", maxSide: 600, width: null, height: null })).toEqual({ width: 600, height: 400 });
    expect(gifOutputSize(first, { sizeMode: "auto", maxSide: null, width: null, height: null })).toEqual(first);
    expect(gifOutputSize({ width: 300, height: 200 }, { sizeMode: "auto", maxSide: 600, width: null, height: null })).toEqual({ width: 300, height: 200 });
    expect(gifOutputSize(first, { sizeMode: "custom", maxSide: null, width: 300, height: null })).toEqual({ width: 300, height: 200 });
    expect(gifOutputSize(first, { sizeMode: "custom", maxSide: null, width: 320, height: 240 })).toEqual({ width: 320, height: 240 });
  });
});

describe("exact palette", () => {
  it("keeps exact colours up to the limit, puts transparency at 0, and gives up above it", async () => {
    const { exactPalette } = await import("./gif");
    const px = solid(4, 1, [0, 0, 0, 0]);
    px.data.set([10, 20, 30, 255, 200, 100, 50, 255, 10, 20, 30, 255], 4);
    const res = exactPalette(px, 3)!;
    expect(Array.from(res.indices)).toEqual([0, 1, 2, 1]);
    expect(Array.from(res.palette)).toEqual([0, 0, 0, 0, 10, 20, 30, 255, 200, 100, 50, 255]);
    expect(exactPalette(px, 2)).toBeNull();
  });
});
