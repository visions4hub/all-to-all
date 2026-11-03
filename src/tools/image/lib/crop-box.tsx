"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { moveRect, resizeRect, type Handle, type Rect, type Size } from "./geometry";

const HANDLES: { h: Handle; style: React.CSSProperties; cursor: string }[] = [
  { h: "nw", style: { left: 0, top: 0 }, cursor: "nwse-resize" },
  { h: "n", style: { left: "50%", top: 0 }, cursor: "ns-resize" },
  { h: "ne", style: { left: "100%", top: 0 }, cursor: "nesw-resize" },
  { h: "e", style: { left: "100%", top: "50%" }, cursor: "ew-resize" },
  { h: "se", style: { left: "100%", top: "100%" }, cursor: "nwse-resize" },
  { h: "s", style: { left: "50%", top: "100%" }, cursor: "ns-resize" },
  { h: "sw", style: { left: 0, top: "100%" }, cursor: "nesw-resize" },
  { h: "w", style: { left: 0, top: "50%" }, cursor: "ew-resize" },
];

/**
 * Interactive crop rectangle over an image. Works with mouse, touch and pen
 * (pointer events, 32px touch targets) and the keyboard (arrows move, Shift
 * for 10px; Alt+arrows resize). All values are in image pixels.
 */
export function CropBox({
  src,
  image,
  rect,
  ratio,
  onChange,
  className,
  maxHeight = "65vh",
}: {
  src: string;
  image: Size;
  rect: Rect;
  ratio: number | null;
  onChange: (rect: Rect) => void;
  className?: string;
  maxHeight?: string;
}) {
  const t = useT();
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; mode: "move" | Handle; x: number; y: number; start: Rect } | null>(null);

  const scale = () => {
    const box = stage.current?.getBoundingClientRect();
    return box && box.width ? image.width / box.width : 1;
  };

  const begin = (mode: "move" | Handle) => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured; moves still reach the stage.
    }
    drag.current = { id: e.pointerId, mode, x: e.clientX, y: e.clientY, start: rect };
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const k = scale();
    const dx = (e.clientX - d.x) * k;
    const dy = (e.clientY - d.y) * k;
    onChange(d.mode === "move" ? moveRect(d.start, dx, dy, image) : resizeRect(d.start, d.mode, dx, dy, ratio, image));
  };

  const end = (e: ReactPointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = (e.shiftKey ? 10 : 1) * Math.max(1, Math.round(scale()));
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    onChange(e.altKey ? resizeRect(rect, "se", d[0], d[1], ratio, image) : moveRect(rect, d[0], d[1], image));
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div className={cn("flex justify-center", className)}>
      <div
        ref={stage}
        dir="ltr"
        className="relative touch-none overflow-hidden rounded-lg bg-muted select-none"
        style={{ aspectRatio: `${image.width} / ${image.height}`, width: `min(100%, calc(${maxHeight} * ${image.width / image.height}))` }}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        <img src={src} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
        <div
          role="group"
          tabIndex={0}
          aria-label={t({ ar: "منطقة القص — اسحبها لتحريكها، أو استخدم الأسهم", en: "Crop area — drag to move, or use the arrow keys" })}
          data-testid="crop-rect"
          onPointerDown={begin("move")}
          onKeyDown={onKey}
          className="absolute cursor-move outline-none focus-visible:ring-2 focus-visible:ring-primary"
          style={{
            left: pct(rect.x, image.width),
            top: pct(rect.y, image.height),
            width: pct(rect.width, image.width),
            height: pct(rect.height, image.height),
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)",
            border: "1.5px solid white",
          }}
        >
          {/* Rule-of-thirds guides */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="border border-white/25" />
            ))}
          </div>
          {HANDLES.map(({ h, style, cursor }) => (
            <span
              key={h}
              data-handle={h}
              onPointerDown={begin(h)}
              className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ ...style, cursor }}
            >
              <span className="size-3.5 rounded-full border-2 border-primary bg-white shadow" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
