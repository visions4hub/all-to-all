// A small PNG encoder for the compress tool.
//
// Browsers' canvas.toBlob("image/png") always writes 8-bit RGBA with fast
// settings. This encoder picks the smallest exact representation instead:
// palette (≤256 colours, 1/2/4/8-bit), greyscale, RGB without alpha, or RGBA,
// and chooses a row filter per scanline. Pixels are written exactly as given,
// so "lossless" here is real. `quantize` adds an optional lossy step that
// reduces the colour count (like TinyPNG/pngquant) before encoding.
//
// Pure apart from `deflate`, which uses the standard CompressionStream API
// (browsers, workers and Node ≥ 18).

import type { Pixels } from "./pixels";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type Deflate = (data: Uint8Array) => Promise<Uint8Array>;

/** zlib-wrapped deflate, as PNG's IDAT requires. */
export const deflate: Deflate = async (data) => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ihdr(width: number, height: number, bitDepth: number, colorType: number): Uint8Array {
  const d = new Uint8Array(13);
  const v = new DataView(d.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  d[8] = bitDepth;
  d[9] = colorType;
  // compression 0, filter 0, interlace 0
  return chunk("IHDR", d);
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Filters raw scanlines (each `rowBytes` long). With `adaptive`, each row gets
 * the filter with the smallest sum of absolute values (the usual heuristic);
 * otherwise filter 0 (best for palette images).
 */
function filterRows(raw: Uint8Array, height: number, rowBytes: number, bpp: number, adaptive: boolean): Uint8Array {
  const out = new Uint8Array(height * (rowBytes + 1));
  const candidates = adaptive ? [0, 1, 2, 3, 4].map(() => new Uint8Array(rowBytes)) : [];
  for (let y = 0; y < height; y++) {
    const cur = raw.subarray(y * rowBytes, (y + 1) * rowBytes);
    const prev = y > 0 ? raw.subarray((y - 1) * rowBytes, y * rowBytes) : null;
    const o = y * (rowBytes + 1);
    if (!adaptive) {
      out[o] = 0;
      out.set(cur, o + 1);
      continue;
    }
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const line = candidates[f];
      let score = 0;
      for (let i = 0; i < rowBytes; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev ? prev[i] : 0;
        const c = prev && i >= bpp ? prev[i - bpp] : 0;
        const x = cur[i];
        let v: number;
        if (f === 0) v = x;
        else if (f === 1) v = x - a;
        else if (f === 2) v = x - b;
        else if (f === 3) v = x - ((a + b) >> 1);
        else v = x - paeth(a, b, c);
        v &= 0xff;
        line[i] = v;
        score += v < 128 ? v : 256 - v;
        if (score >= bestScore) break;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    // Recompute the winner fully (the scoring loop may have stopped early for others).
    const line = candidates[best];
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      const x = cur[i];
      const v =
        best === 0 ? x : best === 1 ? x - a : best === 2 ? x - b : best === 3 ? x - ((a + b) >> 1) : x - paeth(a, b, c);
      line[i] = v & 0xff;
    }
    out[o] = best;
    out.set(line, o + 1);
  }
  return out;
}

export type PngKind = "palette" | "gray" | "gray-alpha" | "rgb" | "rgba";

export type PngInfo = { kind: PngKind; colors: number | null; bitDepth: number };

/**
 * Inspects pixels: up to 256 distinct colours → palette; otherwise greyscale
 * and/or opaque variants when every pixel allows it.
 */
export function analyzePixels(px: Pixels): { palette: Uint32Array | null; opaque: boolean; gray: boolean } {
  const d = px.data;
  const seen = new Map<number, number>();
  let opaque = true;
  let gray = true;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const a = d[i + 3];
    if (a !== 255) opaque = false;
    if (r !== g || g !== b) gray = false;
    if (seen.size <= 256) {
      const key = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
      if (!seen.has(key)) seen.set(key, seen.size);
    }
  }
  return { palette: seen.size <= 256 ? Uint32Array.from(seen.keys()) : null, opaque, gray };
}

function bitDepthFor(colors: number) {
  return colors <= 2 ? 1 : colors <= 4 ? 2 : colors <= 16 ? 4 : 8;
}

/** Encodes palette indices (one byte per pixel) with an RGBA palette. */
export async function encodeIndexed(
  indices: Uint8Array,
  palette: Uint8Array,
  width: number,
  height: number,
  z: Deflate = deflate,
): Promise<Uint8Array> {
  const count = palette.length / 4;
  // Put translucent entries first so tRNS can stop at the last one.
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => {
    const ta = palette[a * 4 + 3] !== 255 ? 0 : 1;
    const tb = palette[b * 4 + 3] !== 255 ? 0 : 1;
    return ta - tb;
  });
  const remap = new Uint8Array(count);
  order.forEach((oldIdx, newIdx) => (remap[oldIdx] = newIdx));
  const plte = new Uint8Array(count * 3);
  let lastTrans = -1;
  const trns = new Uint8Array(count);
  order.forEach((oldIdx, newIdx) => {
    plte[newIdx * 3] = palette[oldIdx * 4];
    plte[newIdx * 3 + 1] = palette[oldIdx * 4 + 1];
    plte[newIdx * 3 + 2] = palette[oldIdx * 4 + 2];
    trns[newIdx] = palette[oldIdx * 4 + 3];
    if (trns[newIdx] !== 255) lastTrans = newIdx;
  });

  const depth = bitDepthFor(count);
  const perByte = 8 / depth;
  const rowBytes = Math.ceil(width / perByte);
  const raw = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = remap[indices[y * width + x]];
      if (depth === 8) raw[y * rowBytes + x] = idx;
      else {
        const byte = y * rowBytes + Math.floor(x / perByte);
        const shift = 8 - depth * ((x % perByte) + 1);
        raw[byte] |= idx << shift;
      }
    }
  }
  const idat = await z(filterRows(raw, height, rowBytes, 1, false));
  const parts = [SIGNATURE, ihdr(width, height, depth, 3), chunk("PLTE", plte)];
  if (lastTrans >= 0) parts.push(chunk("tRNS", trns.subarray(0, lastTrans + 1)));
  parts.push(chunk("IDAT", idat), chunk("IEND", new Uint8Array(0)));
  return concat(parts);
}

/** Lossless PNG: the smallest exact representation of these pixels. */
export async function encodePng(px: Pixels, z: Deflate = deflate): Promise<{ bytes: Uint8Array; info: PngInfo }> {
  const { width, height, data } = px;
  const { palette, opaque, gray } = analyzePixels(px);

  if (palette && !(gray && opaque && palette.length > 16)) {
    const map = new Map<number, number>();
    palette.forEach((key, i) => map.set(key, i));
    const indices = new Uint8Array(width * height);
    const rgba = new Uint8Array(palette.length * 4);
    palette.forEach((key, i) => {
      rgba[i * 4] = key >>> 24;
      rgba[i * 4 + 1] = (key >>> 16) & 0xff;
      rgba[i * 4 + 2] = (key >>> 8) & 0xff;
      rgba[i * 4 + 3] = key & 0xff;
    });
    for (let p = 0, i = 0; i < data.length; i += 4, p++) {
      const key = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
      indices[p] = map.get(key)!;
    }
    const bytes = await encodeIndexed(indices, rgba, width, height, z);
    return { bytes, info: { kind: "palette", colors: palette.length, bitDepth: bitDepthFor(palette.length) } };
  }

  const kind: PngKind = gray ? (opaque ? "gray" : "gray-alpha") : opaque ? "rgb" : "rgba";
  const bpp = kind === "gray" ? 1 : kind === "gray-alpha" ? 2 : kind === "rgb" ? 3 : 4;
  const colorType = kind === "gray" ? 0 : kind === "gray-alpha" ? 4 : kind === "rgb" ? 2 : 6;
  const rowBytes = width * bpp;
  const raw = new Uint8Array(rowBytes * height);
  for (let p = 0, i = 0; i < data.length; i += 4, p++) {
    const o = p * bpp;
    if (kind === "gray") raw[o] = data[i];
    else if (kind === "gray-alpha") {
      raw[o] = data[i];
      raw[o + 1] = data[i + 3];
    } else {
      raw[o] = data[i];
      raw[o + 1] = data[i + 1];
      raw[o + 2] = data[i + 2];
      if (bpp === 4) raw[o + 3] = data[i + 3];
    }
  }
  const idat = await z(filterRows(raw, height, rowBytes, bpp, true));
  const bytes = concat([SIGNATURE, ihdr(width, height, 8, colorType), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))]);
  return { bytes, info: { kind, colors: null, bitDepth: 8 } };
}

// ---------- Colour reduction (lossy) ----------

const BITS = 5; // per channel in the histogram: 32 levels
const SHIFT = 8 - BITS;
const binKey = (r: number, g: number, b: number, a: number) =>
  a === 0 ? 0 : ((r >> SHIFT) << (3 * BITS)) | ((g >> SHIFT) << (2 * BITS)) | ((b >> SHIFT) << BITS) | (a >> SHIFT);
const binChannel = (key: number, c: number) => (key >> ((3 - c) * BITS)) & ((1 << BITS) - 1);

type Box = { keys: number[]; count: number };

/**
 * Median-cut colour quantisation to at most `colors` colours, with optional
 * Floyd–Steinberg dithering. Returns palette indices and an RGBA palette.
 */
export function quantize(px: Pixels, colors: number, dither: boolean): { indices: Uint8Array; palette: Uint8Array } {
  const target = Math.max(2, Math.min(256, Math.round(colors)));
  const { width: w, height: h, data: d } = px;
  const hist = new Uint32Array(1 << (4 * BITS));
  let hasTransparent = false;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) hasTransparent = true;
    hist[binKey(d[i], d[i + 1], d[i + 2], d[i + 3])]++;
  }
  const used: number[] = [];
  for (let k = 0; k < hist.length; k++) if (hist[k] && !(k === 0 && hasTransparent)) used.push(k);

  const boxes: Box[] = [{ keys: used, count: used.reduce((n, k) => n + hist[k], 0) }];
  const want = hasTransparent ? target - 1 : target;
  const range = (box: Box) => {
    let best = 0;
    let channel = 0;
    for (let c = 0; c < 4; c++) {
      let lo = 31;
      let hi = 0;
      for (const k of box.keys) {
        const v = binChannel(k, c);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > best) {
        best = hi - lo;
        channel = c;
      }
    }
    return { size: best, channel };
  };
  while (boxes.length < want) {
    let pick = -1;
    let score = 0;
    let channel = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].keys.length < 2) continue;
      const r = range(boxes[i]);
      const s = r.size * boxes[i].count;
      if (s > score) {
        score = s;
        pick = i;
        channel = r.channel;
      }
    }
    if (pick < 0) break;
    const box = boxes[pick];
    box.keys.sort((a, b) => binChannel(a, channel) - binChannel(b, channel));
    let half = 0;
    let cut = 0;
    while (cut < box.keys.length - 1 && half + hist[box.keys[cut]] <= box.count / 2) half += hist[box.keys[cut++]];
    if (cut === 0) {
      half = hist[box.keys[0]];
      cut = 1;
    }
    boxes.splice(pick, 1, { keys: box.keys.slice(0, cut), count: half }, { keys: box.keys.slice(cut), count: box.count - half });
  }

  const paletteList: number[][] = [];
  if (hasTransparent) paletteList.push([0, 0, 0, 0]);
  const center = (v: number) => (v << SHIFT) + (1 << (SHIFT - 1));
  for (const box of boxes) {
    if (!box.keys.length) continue;
    const sum = [0, 0, 0, 0];
    for (const k of box.keys) for (let c = 0; c < 4; c++) sum[c] += center(binChannel(k, c)) * hist[k];
    const color = sum.map((s) => Math.round(s / box.count));
    if (color[3] >= 252) color[3] = 255;
    paletteList.push(color);
  }
  const palette = new Uint8Array(paletteList.length * 4);
  paletteList.forEach((c, i) => palette.set(c, i * 4));

  const cache = new Int16Array(1 << (4 * BITS)).fill(-1);
  const nearest = (r: number, g: number, b: number, a: number) => {
    if (a === 0 && hasTransparent) return 0;
    const key = binKey(r, g, b, a);
    const hit = cache[key];
    if (hit >= 0) return hit;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < paletteList.length; i++) {
      const p = paletteList[i];
      const dr = p[0] - r;
      const dg = p[1] - g;
      const db = p[2] - b;
      const da = p[3] - a;
      const dist = dr * dr + dg * dg + db * db + da * da;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    cache[key] = best;
    return best;
  };

  const indices = new Uint8Array(w * h);
  if (!dither) {
    for (let p = 0, i = 0; i < d.length; i += 4, p++) indices[p] = nearest(d[i], d[i + 1], d[i + 2], d[i + 3]);
    return { indices, palette };
  }

  // Floyd–Steinberg on RGB; alpha is matched without diffusion.
  let cur = new Float32Array((w + 2) * 3);
  let next = new Float32Array((w + 2) * 3);
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let y = 0; y < h; y++) {
    next.fill(0);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const e = (x + 1) * 3;
      const r = clamp(d[i] + cur[e]);
      const g = clamp(d[i + 1] + cur[e + 1]);
      const b = clamp(d[i + 2] + cur[e + 2]);
      const a = d[i + 3];
      const idx = nearest(Math.round(r), Math.round(g), Math.round(b), a);
      indices[y * w + x] = idx;
      if (a === 0) continue;
      const p = paletteList[idx];
      const er = r - p[0];
      const eg = g - p[1];
      const eb = b - p[2];
      const spread = (arr: Float32Array, at: number, k: number) => {
        arr[at] += er * k;
        arr[at + 1] += eg * k;
        arr[at + 2] += eb * k;
      };
      spread(cur, e + 3, 7 / 16);
      spread(next, e - 3, 3 / 16);
      spread(next, e, 5 / 16);
      spread(next, e + 3, 1 / 16);
    }
    [cur, next] = [next, cur];
  }
  return { indices, palette };
}
