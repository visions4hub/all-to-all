import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { crc32, encodePng, quantize, encodeIndexed } from "./png";
import type { Pixels } from "./pixels";

/** Minimal PNG decoder for the formats our encoder writes (8-bit gray/GA/RGB/RGBA, palette 1–8 bit). */
function decodePng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array; colorType: number; bitDepth: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(Array.from(bytes.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let o = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  let plte: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (o < bytes.length) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(...bytes.subarray(o + 4, o + 8));
    const data = bytes.subarray(o + 8, o + 8 + len);
    expect(view.getUint32(o + 8 + len)).toBe(crc32(bytes, o + 4, o + 8 + len));
    if (type === "IHDR") {
      width = view.getUint32(o + 8);
      height = view.getUint32(o + 12);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const raw = new Uint8Array(inflateSync(Buffer.concat(idat)));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]!;
  const bpp = Math.max(1, (channels * bitDepth) / 8);
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const out = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (rowBytes + 1)];
    for (let i = 0; i < rowBytes; i++) {
      const x = raw[y * (rowBytes + 1) + 1 + i];
      const a = i >= bpp ? out[y * rowBytes + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * rowBytes + i] : 0;
      const c = y > 0 && i >= bpp ? out[(y - 1) * rowBytes + i - bpp] : 0;
      const p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      out[y * rowBytes + i] = (x + [0, a, b, (a + b) >> 1, pr][f]) & 0xff;
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      const row = y * rowBytes;
      if (colorType === 3) {
        const per = 8 / bitDepth;
        const byte = out[row + Math.floor(x / per)];
        const idx = (byte >> (8 - bitDepth * ((x % per) + 1))) & ((1 << bitDepth) - 1);
        rgba.set([plte![idx * 3], plte![idx * 3 + 1], plte![idx * 3 + 2], trns && idx < trns.length ? trns[idx] : 255], d);
      } else {
        const s = row + x * channels;
        if (colorType === 0) rgba.set([out[s], out[s], out[s], 255], d);
        if (colorType === 4) rgba.set([out[s], out[s], out[s], out[s + 1]], d);
        if (colorType === 2) rgba.set([out[s], out[s + 1], out[s + 2], 255], d);
        if (colorType === 6) rgba.set([out[s], out[s + 1], out[s + 2], out[s + 3]], d);
      }
    }
  return { width, height, rgba, colorType, bitDepth };
}

function make(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return { data, width: w, height: h };
}

describe("PNG encoder (lossless)", () => {
  it("crc32 matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  const cases: [string, Pixels, number, number][] = [
    ["2 colours → 1-bit palette", make(37, 9, (x) => (x % 2 ? [255, 0, 0, 255] : [0, 0, 255, 255])), 3, 1],
    ["4 colours with transparency → 2-bit palette + tRNS", make(10, 10, (x, y) => [[0, 0, 0, 0], [255, 0, 0, 255], [0, 255, 0, 128], [9, 9, 9, 255]][(x + y) % 4] as [number, number, number, number]), 3, 2],
    ["grey gradient → greyscale", make(300, 3, (x) => [x % 256, x % 256, x % 256, 255]), 0, 8],
    ["grey with alpha → grey+alpha", make(300, 2, (x) => [x % 256, x % 256, x % 256, 255 - Math.floor(x / 2)]), 4, 8],
    ["photo-like opaque → RGB (no alpha)", make(64, 64, (x, y) => [(x * 4) % 256, (y * 4) % 256, (x * y) % 256, 255]), 2, 8],
    ["photo-like with alpha → RGBA", make(64, 64, (x, y) => [(x * 4) % 256, (y * 4) % 256, (x * y) % 256, (x + y) % 256]), 6, 8],
  ];
  for (const [name, input, colorType, bitDepth] of cases) {
    it(`${name}, pixels identical after decoding`, async () => {
      const { bytes } = await encodePng(input);
      const out = decodePng(bytes);
      expect([out.width, out.height]).toEqual([input.width, input.height]);
      expect(out.colorType).toBe(colorType);
      expect(out.bitDepth).toBe(bitDepth);
      expect(Buffer.from(out.rgba).equals(Buffer.from(input.data))).toBe(true);
    });
  }

  it("a 4-colour graphic is far smaller than raw RGBA", async () => {
    const input = make(640, 480, (x, y) => (x < 320 ? (y < 240 ? [255, 0, 0, 255] : [0, 0, 255, 255]) : y < 240 ? [0, 255, 0, 255] : [255, 255, 0, 255]));
    const { bytes } = await encodePng(input);
    expect(bytes.length).toBeLessThan(2000);
  });
});

describe("colour reduction", () => {
  const photo = make(80, 60, (x, y) => [(x * 3) % 256, (y * 4) % 256, ((x + y) * 2) % 256, 255]);
  it("never exceeds the requested colours and stays close to the original", async () => {
    for (const colors of [256, 64, 16]) {
      for (const dither of [false, true]) {
        const { indices, palette } = quantize(photo, colors, dither);
        expect(palette.length / 4).toBeLessThanOrEqual(colors);
        expect(indices.length).toBe(80 * 60);
        const bytes = await encodeIndexed(indices, palette, 80, 60);
        const out = decodePng(bytes);
        let diff = 0;
        for (let i = 0; i < out.rgba.length; i++) diff += Math.abs(out.rgba[i] - photo.data[i]);
        expect(diff / out.rgba.length).toBeLessThan(colors >= 64 ? 8 : 20);
      }
    }
  });
  it("keeps fully transparent pixels transparent", () => {
    const p = make(10, 10, (x) => (x < 5 ? [0, 0, 0, 0] : [200, 10, 10, 255]));
    const { indices, palette } = quantize(p, 8, true);
    expect(palette[indices[0] * 4 + 3]).toBe(0);
    expect(palette[indices[9] * 4 + 3]).toBe(255);
  });
});
