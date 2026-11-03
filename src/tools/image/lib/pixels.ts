// Per-pixel image operations on RGBA buffers (the same layout as canvas ImageData).
// Pure functions: they run in the image worker, and in Node for unit tests.

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

export type Adjustments = {
  /** -100…100 */
  brightness: number;
  /** -100…100 */
  contrast: number;
  /** -100…100 (-100 = grey) */
  saturation: number;
  /** Exposure in stops, -2…2 (each stop doubles or halves the light). */
  exposure: number;
  /** 0…100 */
  grayscale: number;
  /** 0…100 */
  sepia: number;
  /** Gaussian blur radius in pixels of this buffer (0 = off). */
  blur: number;
  /** 0…100 */
  sharpen: number;
};

export const NEUTRAL_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  grayscale: 0,
  sepia: 0,
  blur: 0,
  sharpen: 0,
};

export function isNeutral(a: Adjustments): boolean {
  return (Object.keys(NEUTRAL_ADJUSTMENTS) as (keyof Adjustments)[]).every((k) => !a[k]);
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Lookup table for the per-channel tone controls: exposure → brightness → contrast. */
export function toneLut(a: Pick<Adjustments, "brightness" | "contrast" | "exposure">): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const gain = Math.pow(2, a.exposure);
  const c = a.contrast * 2.55;
  const factor = (259 * (c + 255)) / (255 * (259 - c));
  for (let v = 0; v < 256; v++) {
    let x = v * gain;
    x += a.brightness * 2.55;
    x = factor * (x - 128) + 128;
    lut[v] = Math.round(clamp255(x));
  }
  return lut;
}

/** Tone and colour adjustments (everything except blur/sharpen), in place. */
export function applyColorAdjustments(px: Pixels, a: Adjustments): void {
  const d = px.data;
  const toneActive = a.brightness || a.contrast || a.exposure;
  const lut = toneActive ? toneLut(a) : null;
  const sat = 1 + a.saturation / 100;
  const gray = a.grayscale / 100;
  const sep = a.sepia / 100;
  if (!lut && sat === 1 && !gray && !sep) return;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    if (lut) {
      r = lut[r];
      g = lut[g];
      b = lut[b];
    }
    if (sat !== 1) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * sat;
      g = l + (g - l) * sat;
      b = l + (b - l) * sat;
    }
    if (gray) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r += (l - r) * gray;
      g += (l - g) * gray;
      b += (l - b) * gray;
    }
    if (sep) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r += (sr - r) * sep;
      g += (sg - g) * sep;
      b += (sb - b) * sep;
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}

/** Three box sizes whose repeated box blur approximates a Gaussian with this sigma. */
export function boxesForGauss(sigma: number, n = 3): number[] {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes: number[] = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes.map((s) => Math.max(0, (s - 1) / 2));
}

function boxH(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number) {
  const span = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let c = 0; c < 4; c++) {
      const first = src[row + c];
      const last = src[row + (w - 1) * 4 + c];
      let acc = first * (r + 1);
      for (let x = 1; x < r; x++) acc += src[row + Math.min(x, w - 1) * 4 + c];
      for (let x = 0; x < w; x++) {
        const addX = x + r;
        acc += addX < w ? src[row + addX * 4 + c] : last;
        dst[row + x * 4 + c] = acc / span;
        const subX = x - r;
        acc -= subX >= 0 ? src[row + subX * 4 + c] : first;
      }
    }
  }
}

function boxV(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number) {
  const span = 2 * r + 1;
  const stride = w * 4;
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      const col = x * 4 + c;
      const first = src[col];
      const last = src[(h - 1) * stride + col];
      let acc = first * (r + 1);
      for (let y = 1; y < r; y++) acc += src[Math.min(y, h - 1) * stride + col];
      for (let y = 0; y < h; y++) {
        const addY = y + r;
        acc += addY < h ? src[addY * stride + col] : last;
        dst[y * stride + col] = acc / span;
        const subY = y - r;
        acc -= subY >= 0 ? src[subY * stride + col] : first;
      }
    }
  }
}

/**
 * Gaussian-like blur (three box passes), in place. Colour is blurred
 * premultiplied by alpha so transparent pixels don't darken the edges.
 * `radius` is the Gaussian sigma in pixels.
 */
export function gaussianBlur(px: Pixels, radius: number): void {
  if (!(radius >= 0.5)) return;
  const { width: w, height: h, data } = px;
  const a = new Uint8ClampedArray(data.length);
  const b = new Uint8ClampedArray(data.length);
  let opaque = true;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha !== 255) opaque = false;
    const k = alpha / 255;
    a[i] = data[i] * k;
    a[i + 1] = data[i + 1] * k;
    a[i + 2] = data[i + 2] * k;
    a[i + 3] = alpha;
  }
  for (const r of boxesForGauss(radius)) {
    const ri = Math.round(r);
    if (ri < 1) continue;
    boxH(a, b, w, h, ri);
    boxV(b, a, w, h, ri);
  }
  for (let i = 0; i < data.length; i += 4) {
    const alpha = a[i + 3];
    if (opaque || alpha === 255) {
      data[i] = a[i];
      data[i + 1] = a[i + 1];
      data[i + 2] = a[i + 2];
      data[i + 3] = alpha;
    } else if (alpha === 0) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
    } else {
      const k = 255 / alpha;
      data[i] = a[i] * k;
      data[i + 1] = a[i + 1] * k;
      data[i + 2] = a[i + 2] * k;
      data[i + 3] = alpha;
    }
  }
}

/** Unsharp mask, in place. amount 0…100. */
export function sharpen(px: Pixels, amount: number): void {
  if (!(amount > 0)) return;
  const blurred: Pixels = { width: px.width, height: px.height, data: new Uint8ClampedArray(px.data) };
  gaussianBlur(blurred, 1);
  const k = amount / 50;
  const d = px.data;
  const s = blurred.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] + (d[i] - s[i]) * k;
    d[i + 1] = d[i + 1] + (d[i + 1] - s[i + 1]) * k;
    d[i + 2] = d[i + 2] + (d[i + 2] - s[i + 2]) * k;
  }
}

/**
 * Replaces each block×block square with its average colour, in place.
 * Blocks are aligned to the buffer's top-left corner.
 */
export function pixelate(px: Pixels, block: number): void {
  const size = Math.max(1, Math.round(block));
  if (size <= 1) return;
  const { width: w, height: h, data: d } = px;
  for (let by = 0; by < h; by += size) {
    for (let bx = 0; bx < w; bx += size) {
      const ex = Math.min(w, bx + size);
      const ey = Math.min(h, by + size);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4;
          const alpha = d[i + 3];
          r += d[i] * alpha;
          g += d[i + 1] * alpha;
          b += d[i + 2] * alpha;
          a += alpha;
          n++;
        }
      }
      const outA = a / n;
      const outR = a ? r / a : 0;
      const outG = a ? g / a : 0;
      const outB = a ? b / a : 0;
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * w + x) * 4;
          d[i] = outR;
          d[i + 1] = outG;
          d[i + 2] = outB;
          d[i + 3] = outA;
        }
      }
    }
  }
}

/** All adjustments in the editor's order: colour → blur → sharpen. In place. */
export function applyAdjustments(px: Pixels, a: Adjustments): void {
  applyColorAdjustments(px, a);
  if (a.blur > 0) gaussianBlur(px, a.blur);
  if (a.sharpen > 0) sharpen(px, a.sharpen);
}
