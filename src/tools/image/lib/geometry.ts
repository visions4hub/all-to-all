// Pure size and rectangle math shared by the image tools. No DOM access here,
// so everything is unit-tested in Node (geometry.test.ts).

export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

const round = (n: number) => Math.max(1, Math.round(n));

/** Largest size with the same aspect ratio that fits inside `box`. */
export function fitWithin(src: Size, box: Size): Size {
  const scale = Math.min(box.width / src.width, box.height / src.height);
  return { width: round(src.width * scale), height: round(src.height * scale) };
}

export type ResizeMode = "pixels" | "percent" | "max";

export type ResizeOptions = {
  mode: ResizeMode;
  /** pixels mode: target width / height (0 or null = not set). */
  width?: number | null;
  height?: number | null;
  keepRatio: boolean;
  /** percent mode, e.g. 50 = half size. */
  percent?: number;
  /** max mode: the result fits inside maxWidth × maxHeight (0/null = no limit on that side). */
  maxWidth?: number | null;
  maxHeight?: number | null;
  /** Never make an image larger than it is. */
  noUpscale: boolean;
};

/**
 * Output dimensions for the resize tool.
 * - pixels + keep ratio + both sides set → fits inside width × height (works for mixed portrait/landscape batches)
 * - pixels + keep ratio + one side set → the other side follows the ratio
 * - pixels without ratio → exact size; an empty side keeps the original value
 * - percent → scaled by percent
 * - max → only shrinks, to fit inside the limits
 */
export function computeResize(src: Size, o: ResizeOptions): Size {
  const w = o.width && o.width > 0 ? o.width : 0;
  const h = o.height && o.height > 0 ? o.height : 0;
  let out: Size;

  if (o.mode === "percent") {
    const p = o.percent && o.percent > 0 ? o.percent : 100;
    out = { width: round((src.width * p) / 100), height: round((src.height * p) / 100) };
  } else if (o.mode === "max") {
    const mw = o.maxWidth && o.maxWidth > 0 ? o.maxWidth : Infinity;
    const mh = o.maxHeight && o.maxHeight > 0 ? o.maxHeight : Infinity;
    const scale = Math.min(1, mw / src.width, mh / src.height);
    return { width: round(src.width * scale), height: round(src.height * scale) };
  } else if (o.keepRatio) {
    if (w && h) out = fitWithin(src, { width: w, height: h });
    else if (w) out = { width: round(w), height: round((w * src.height) / src.width) };
    else if (h) out = { width: round((h * src.width) / src.height), height: round(h) };
    else out = { ...src };
  } else {
    out = { width: round(w || src.width), height: round(h || src.height) };
  }

  if (o.noUpscale) {
    if (o.mode === "pixels" && !o.keepRatio) {
      out = { width: Math.min(out.width, src.width), height: Math.min(out.height, src.height) };
    } else if (out.width > src.width || out.height > src.height) {
      const scale = Math.min(src.width / out.width, src.height / out.height);
      out = { width: round(out.width * scale), height: round(out.height * scale) };
    }
  }
  return out;
}

/**
 * Intermediate sizes for high-quality downscaling: halve repeatedly while the
 * image is more than twice the target, then do the final step. Each step is a
 * canvas drawImage with high-quality smoothing, which avoids the aliasing of a
 * single large reduction.
 */
export function stepDownPlan(src: Size, dst: Size): Size[] {
  const steps: Size[] = [];
  let cur = { ...src };
  while (cur.width / 2 >= dst.width && cur.height / 2 >= dst.height && cur.width > 2 * dst.width - 1) {
    cur = { width: Math.max(dst.width, Math.floor(cur.width / 2)), height: Math.max(dst.height, Math.floor(cur.height / 2)) };
    steps.push(cur);
  }
  const last = steps[steps.length - 1];
  if (!last || last.width !== dst.width || last.height !== dst.height) steps.push({ ...dst });
  return steps;
}

/** Size of the box that holds an image rotated by `degrees`. */
export function rotatedBounds(src: Size, degrees: number): Size {
  const r = (degrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  // Snap tiny float errors (e.g. cos 90° = 6e-17) so right angles give exact sizes.
  const snap = (n: number) => (Math.abs(n - Math.round(n)) < 1e-6 ? Math.round(n) : Math.ceil(n));
  return { width: Math.max(1, snap(src.width * c + src.height * s)), height: Math.max(1, snap(src.width * s + src.height * c)) };
}

// ---------- Crop ----------

export type RatioPreset = "free" | "1:1" | "4:3" | "3:2" | "4:5" | "9:16" | "16:9" | "custom";
export const RATIO_PRESETS: RatioPreset[] = ["free", "1:1", "4:3", "3:2", "4:5", "9:16", "16:9", "custom"];

/** width / height for a preset, or null for free cropping. */
export function ratioValue(preset: RatioPreset, custom?: { w: number; h: number }): number | null {
  if (preset === "free") return null;
  if (preset === "custom") return custom && custom.w > 0 && custom.h > 0 ? custom.w / custom.h : null;
  const [a, b] = preset.split(":").map(Number);
  return a / b;
}

/** The largest rectangle with the given ratio, centred in the image (the whole image for free crop). */
export function centeredRect(img: Size, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, width: img.width, height: img.height };
  let width = img.width;
  let height = width / ratio;
  if (height > img.height) {
    height = img.height;
    width = height * ratio;
  }
  width = Math.min(img.width, Math.round(width));
  height = Math.min(img.height, Math.round(height));
  return { x: Math.round((img.width - width) / 2), y: Math.round((img.height - height) / 2), width, height };
}

/** Rounds a rectangle to whole pixels and keeps it inside the image (at least 1×1). */
export function clampRect(r: Rect, img: Size): Rect {
  const width = Math.min(img.width, Math.max(1, Math.round(r.width)));
  const height = Math.min(img.height, Math.max(1, Math.round(r.height)));
  const x = Math.min(img.width - width, Math.max(0, Math.round(r.x)));
  const y = Math.min(img.height - height, Math.max(0, Math.round(r.y)));
  return { x, y, width, height };
}

/** Re-shapes a rectangle to a ratio around its centre, staying inside the image. */
export function fitRectToRatio(r: Rect, ratio: number | null, img: Size): Rect {
  if (!ratio) return clampRect(r, img);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const area = r.width * r.height;
  let width = Math.sqrt(area * ratio);
  let height = width / ratio;
  const scale = Math.min(1, img.width / width, img.height / height);
  width *= scale;
  height *= scale;
  return clampRect({ x: cx - width / 2, y: cy - height / 2, width, height }, img);
}

export function moveRect(r: Rect, dx: number, dy: number, img: Size): Rect {
  return clampRect({ ...r, x: r.x + dx, y: r.y + dy }, img);
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * Resizes a crop rectangle by dragging one handle by (dx, dy) image pixels.
 * The opposite edge/corner stays fixed; with a ratio the other side follows.
 * Never leaves the image and never gets smaller than `min`.
 */
export function resizeRect(r: Rect, handle: Handle, dx: number, dy: number, ratio: number | null, img: Size, min = 8): Rect {
  const minW = Math.min(min, img.width);
  const minH = Math.min(min, img.height);
  let left = r.x;
  let top = r.y;
  let right = r.x + r.width;
  let bottom = r.y + r.height;
  const hasN = handle.includes("n");
  const hasS = handle.includes("s");
  const hasW = handle.includes("w");
  const hasE = handle.includes("e");

  if (hasW) left = Math.min(right - minW, Math.max(0, left + dx));
  if (hasE) right = Math.max(left + minW, Math.min(img.width, right + dx));
  if (hasN) top = Math.min(bottom - minH, Math.max(0, top + dy));
  if (hasS) bottom = Math.max(top + minH, Math.min(img.height, bottom + dy));

  if (!ratio) return clampRect({ x: left, y: top, width: right - left, height: bottom - top }, img);

  let width = right - left;
  let height = bottom - top;
  const corner = (hasN || hasS) && (hasE || hasW);
  // Which side drives the other: the dragged one for edges, the larger change for corners.
  const widthDrives = corner ? Math.abs(dx) >= Math.abs(dy) : hasE || hasW;
  if (widthDrives) height = width / ratio;
  else width = height * ratio;

  // Room available from the fixed anchor.
  const anchorX = hasW ? r.x + r.width : hasE ? r.x : r.x + r.width / 2;
  const anchorY = hasN ? r.y + r.height : hasS ? r.y : r.y + r.height / 2;
  const maxW = hasW ? anchorX : hasE ? img.width - anchorX : 2 * Math.min(anchorX, img.width - anchorX);
  const maxH = hasN ? anchorY : hasS ? img.height - anchorY : 2 * Math.min(anchorY, img.height - anchorY);
  const scale = Math.min(1, maxW / width, maxH / height);
  width = Math.max(Math.min(minW, maxW), width * scale);
  height = Math.max(Math.min(minH, maxH), width / ratio);

  const x = hasW ? anchorX - width : hasE ? anchorX : anchorX - width / 2;
  const y = hasN ? anchorY - height : hasS ? anchorY : anchorY - height / 2;
  return clampRect({ x, y, width, height }, img);
}
