// Animated GIF: frame layout (shared by the live preview and the export) and
// encoding. Encoding runs in the image worker; LZW + file structure come from
// gifenc (MIT), colour reduction is our median-cut quantiser from png.ts.

import { GIFEncoder, type Palette } from "gifenc";
import { fitWithin, type Size } from "./geometry";
import { quantize } from "./png";
import type { Pixels } from "./pixels";

export type GifFit = "contain" | "cover" | "stretch";

export type DrawRect = { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number };

/** Where a source image goes inside the output frame. */
export function frameRect(src: Size, out: Size, fit: GifFit): DrawRect {
  const full = { sx: 0, sy: 0, sw: src.width, sh: src.height };
  if (fit === "stretch") return { ...full, dx: 0, dy: 0, dw: out.width, dh: out.height };
  if (fit === "contain") {
    const s = Math.min(out.width / src.width, out.height / src.height);
    const dw = Math.max(1, Math.round(src.width * s));
    const dh = Math.max(1, Math.round(src.height * s));
    return { ...full, dx: Math.floor((out.width - dw) / 2), dy: Math.floor((out.height - dh) / 2), dw, dh };
  }
  // cover: crop the source to the output's ratio, centred
  const s = Math.max(out.width / src.width, out.height / src.height);
  const sw = Math.min(src.width, out.width / s);
  const sh = Math.min(src.height, out.height / s);
  return { sx: (src.width - sw) / 2, sy: (src.height - sh) / 2, sw, sh, dx: 0, dy: 0, dw: out.width, dh: out.height };
}

export type GifSizeSettings = { sizeMode: "auto" | "custom"; maxSide: number | null; width: number | null; height: number | null };

/** Output frame size: the first image's size (fitted within maxSide), or a custom size. */
export function gifOutputSize(first: Size, s: GifSizeSettings): Size {
  if (s.sizeMode === "custom") {
    const w = s.width && s.width > 0 ? s.width : null;
    const h = s.height && s.height > 0 ? s.height : null;
    if (w && h) return { width: Math.round(w), height: Math.round(h) };
    if (w) return { width: Math.round(w), height: Math.max(1, Math.round((w * first.height) / first.width)) };
    if (h) return { width: Math.max(1, Math.round((h * first.width) / first.height)), height: Math.round(h) };
    return first;
  }
  if (s.maxSide && (first.width > s.maxSide || first.height > s.maxSide)) return fitWithin(first, { width: s.maxSide, height: s.maxSide });
  return first;
}

/** User-facing "plays N times" (0 = forever) → GIF NETSCAPE repeat value for gifenc (-1 = no loop block). */
export function gifRepeat(plays: number): number {
  if (plays <= 0) return 0;
  if (plays === 1) return -1;
  return Math.min(65535, Math.round(plays) - 1);
}

export type GifJob = {
  frames: Pixels[];
  /** Milliseconds per frame (stored in GIF as 1/100 s). */
  delays: number[];
  plays: number;
  colors: number;
  globalPalette: boolean;
  dither: boolean;
  /** Keep transparent pixels (alpha < 128 becomes fully transparent). */
  transparent: boolean;
};

function toPalette(rgba: Uint8Array): Palette {
  const out: Palette = [];
  for (let i = 0; i < rgba.length; i += 4) out.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  while (out.length < 2) out.push([0, 0, 0]);
  return out;
}

/** GIF has 1-bit transparency: pixels are either fully transparent or opaque. */
function prepareAlpha(px: Pixels, transparent: boolean) {
  const d = px.data;
  for (let i = 3; i < d.length; i += 4) d[i] = transparent && d[i] < 128 ? 0 : 255;
  if (transparent) for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 0) d[i] = d[i + 1] = d[i + 2] = 0;
}

/**
 * Uses the exact colours when the pixels have no more than `max` of them
 * (graphics, screenshots, flat colours); returns null otherwise. Transparent
 * pixels (alpha 0) get index 0, like quantize().
 */
export function exactPalette(px: Pixels, max: number): { indices: Uint8Array; palette: Uint8Array } | null {
  const d = px.data;
  const map = new Map<number, number>();
  const colours: number[] = [];
  let hasTransparent = false;
  for (let i = 3; i < d.length; i += 4) if (d[i] === 0) hasTransparent = true;
  if (hasTransparent) colours.push(-1);
  const indices = new Uint8Array(d.length / 4);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (d[i + 3] === 0) continue; // index 0
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let idx = map.get(key);
    if (idx === undefined) {
      if (colours.length >= max) return null;
      idx = colours.length;
      map.set(key, idx);
      colours.push(key);
    }
    indices[p] = idx;
  }
  const palette = new Uint8Array(colours.length * 4);
  colours.forEach((c, i) => (c < 0 ? palette.set([0, 0, 0, 0], i * 4) : palette.set([c >> 16, (c >> 8) & 255, c & 255, 255], i * 4)));
  return { indices, palette };
}

const reduce = (px: Pixels, colors: number, dither: boolean) => exactPalette(px, Math.max(2, Math.min(256, colors))) ?? quantize(px, colors, dither);

export function encodeGif(job: GifJob): Uint8Array {
  const { frames } = job;
  if (!frames.length) throw new Error("No frames");
  const { width, height } = frames[0];
  for (const f of frames) {
    if (f.width !== width || f.height !== height) throw new Error("Frames must share one size");
    prepareAlpha(f, job.transparent);
  }
  const gif = GIFEncoder();
  const repeat = gifRepeat(job.plays);
  const frameSize = width * height;

  let shared: { indices: Uint8Array; palette: Uint8Array } | null = null;
  if (job.globalPalette) {
    const stacked = new Uint8ClampedArray(frameSize * 4 * frames.length);
    frames.forEach((f, i) => stacked.set(f.data, i * frameSize * 4));
    shared = reduce({ data: stacked, width, height: height * frames.length }, job.colors, job.dither);
  }

  frames.forEach((f, i) => {
    const q = shared ? { indices: shared.indices.subarray(i * frameSize, (i + 1) * frameSize), palette: shared.palette } : reduce(f, job.colors, job.dither);
    const transparentIndex = q.palette[3] === 0 ? 0 : -1;
    gif.writeFrame(q.indices, width, height, {
      // With a global palette only the first frame carries it; others reuse it.
      palette: !shared || i === 0 ? toPalette(q.palette) : null,
      delay: job.delays[i] ?? 100,
      repeat,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
    });
  });
  gif.finish();
  return gif.bytes();
}
