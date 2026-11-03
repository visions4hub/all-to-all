"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { WorkspaceFile } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import { decodeImage, drawScaled, releaseCanvas, type Decoded } from "./canvas";
import { fitWithin, type Size } from "./geometry";

export type PreviewBase = {
  /** The image, scaled down for fast previews. */
  canvas: HTMLCanvasElement;
  /** Size of the preview canvas. */
  size: Size;
  /** Size of the original image. */
  original: Size;
  /** preview pixels per original pixel (≤ 1). */
  scale: number;
};

/** Decodes a workspace image once into a downscaled canvas for live previews. */
export function usePreviewBase(file: WorkspaceFile | undefined, maxSide = 1200): PreviewBase | null {
  const [base, setBase] = useState<{ id: string; base: PreviewBase } | null>(null);
  // Depend on the file itself, not the store object (which changes when its size is filled in).
  const id = file?.id;
  const blob = file?.file;
  useEffect(() => {
    if (!id || !blob) return;
    let alive = true;
    decodeImage(blob)
      .then((d) => {
        const original = { width: d.width, height: d.height };
        const size = original.width > maxSide || original.height > maxSide ? fitWithin(original, { width: maxSide, height: maxSide }) : original;
        const made = drawScaled(d.source, original, size);
        d.close();
        if (alive) setBase({ id, base: { canvas: made, size, original, scale: size.width / original.width } });
        else releaseCanvas(made);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, blob, maxSide]);
  // Free the previous preview canvas once it has been replaced, and on unmount.
  useEffect(() => () => releaseCanvas(base?.base.canvas), [base]);
  return base && base.id === id ? base.base : null;
}

/** Decodes an extra image (logo, overlay) for drawing; closed on change. */
export function useDecoded(blob: Blob | null | undefined): Decoded | null {
  const [state, setState] = useState<{ blob: Blob; d: Decoded } | null>(null);
  useEffect(() => {
    if (!blob) return;
    let alive = true;
    let decoded: Decoded | null = null;
    decodeImage(blob)
      .then((d) => {
        decoded = d;
        if (alive) setState({ blob, d });
        else d.close();
      })
      .catch(() => {});
    return () => {
      alive = false;
      decoded?.close();
    };
  }, [blob]);
  return state && state.blob === blob ? state.d : null;
}

/**
 * A visible canvas that redraws whenever `draw` changes. `draw` receives the
 * context already holding the base image.
 */
export function PreviewCanvas({
  base,
  draw,
  className,
  children,
  label,
}: {
  base: PreviewBase | null;
  draw?: (ctx: CanvasRenderingContext2D, base: PreviewBase) => void | Promise<void>;
  className?: string;
  children?: ReactNode;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !base || !base.canvas.width) return;
    let cancelled = false;
    // Draw off-screen first so an async draw never shows a half-finished frame.
    const work = document.createElement("canvas");
    work.width = base.size.width;
    work.height = base.size.height;
    const ctx = work.getContext("2d")!;
    ctx.drawImage(base.canvas, 0, 0);
    Promise.resolve()
      .then(() => draw?.(ctx, base))
      .then(() => {
        if (cancelled) return;
        canvas.width = base.size.width;
        canvas.height = base.size.height;
        canvas.getContext("2d")!.drawImage(work, 0, 0);
      })
      .catch(() => {
        // A failed preview frame must never break the page; the export reports real errors.
      })
      .finally(() => releaseCanvas(work));
    return () => {
      cancelled = true;
    };
  }, [base, draw]);

  if (!base) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-muted">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className={cn("flex justify-center", className)}>
      <div
        dir="ltr"
        className="relative overflow-hidden rounded-lg bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
        style={{ aspectRatio: `${base.size.width} / ${base.size.height}`, width: `min(100%, calc(65vh * ${base.size.width / base.size.height}))` }}
      >
        <canvas ref={ref} aria-label={label} role={label ? "img" : undefined} className="absolute inset-0 h-full w-full" />
        {children}
      </div>
    </div>
  );
}
