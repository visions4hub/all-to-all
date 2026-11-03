"use client";

import { throwIfCancelled } from "@/lib/engine/types";
import { createCanvas, putPixels, releaseCanvas } from "./canvas";
import { effectPixels, regionPixels, type Region } from "./regions";
import { runPixelJob } from "./worker-client";

function shapePath(ctx: CanvasRenderingContext2D, r: Region, w: number, h: number) {
  ctx.beginPath();
  if (r.shape === "ellipse") ctx.ellipse((r.x + r.w / 2) * w, (r.y + r.h / 2) * h, (r.w / 2) * w, (r.h / 2) * h, 0, 0, Math.PI * 2);
  else ctx.rect(r.x * w, r.y * h, r.w * w, r.h * h);
}

/**
 * Applies blur / pixelate / solid mask regions to a canvas, in order.
 * Pixel work runs in the image worker. Works the same at preview and full size.
 */
export async function applyRegions(canvas: HTMLCanvasElement, regions: Region[], signal?: AbortSignal) {
  const ctx = canvas.getContext("2d")!;
  const img = { width: canvas.width, height: canvas.height };
  for (const r of regions) {
    if (signal) throwIfCancelled(signal);
    const box = regionPixels(r, img);
    if (r.effect === "mask") {
      ctx.save();
      ctx.fillStyle = r.color;
      shapePath(ctx, r, img.width, img.height);
      ctx.fill();
      ctx.restore();
      continue;
    }
    const amount = effectPixels(r.effect, r.strength, img);
    // Blur reads beyond the region edge so its border blends naturally; pixelate uses the region only.
    const pad = r.effect === "blur" ? Math.ceil(amount * 3) : 0;
    const ex = Math.max(0, box.x - pad);
    const ey = Math.max(0, box.y - pad);
    const ew = Math.min(img.width, box.x + box.width + pad) - ex;
    const eh = Math.min(img.height, box.y + box.height + pad) - ey;
    const data = ctx.getImageData(ex, ey, ew, eh);
    const px = await runPixelJob(
      r.effect === "blur"
        ? { op: "blur", px: { data: data.data, width: ew, height: eh }, radius: amount }
        : { op: "pixelate", px: { data: data.data, width: ew, height: eh }, block: amount },
      signal,
    );
    const { canvas: patch } = createCanvas(ew, eh);
    putPixels(patch, px);
    ctx.save();
    shapePath(ctx, r, img.width, img.height);
    ctx.clip();
    ctx.drawImage(patch, ex, ey);
    ctx.restore();
    releaseCanvas(patch);
  }
}
