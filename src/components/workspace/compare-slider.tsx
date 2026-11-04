"use client";

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Before/after image comparison. Drag the handle (mouse or touch) or use the
 * arrow keys. Both images are local object URLs.
 */
export function CompareSlider({
  beforeUrl,
  afterUrl,
  className,
}: {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
}) {
  const t = useT();
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);

  const fromPointer = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, pct)));
  };

  return (
    <div
      ref={ref}
      dir="ltr"
      className={cn("relative touch-none overflow-hidden rounded-xl border bg-muted select-none", className)}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        fromPointer(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && fromPointer(e.clientX)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
      <img src={afterUrl} alt={t({ ar: "بعد", en: "After" })} loading="lazy" decoding="async" className="block h-full w-full object-contain" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        <img src={beforeUrl} alt={t({ ar: "قبل", en: "Before" })} loading="lazy" decoding="async" className="block h-full w-full object-contain" draggable={false} />
      </div>
      <span className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {t({ ar: "قبل", en: "Before" })}
      </span>
      <span className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        {t({ ar: "بعد", en: "After" })}
      </span>
      <div
        role="slider"
        tabIndex={0}
        aria-label={t({ ar: "مقارنة قبل وبعد", en: "Before/after comparison" })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 2;
          if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - step));
          if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + step));
        }}
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.2)] outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{ left: `${pos}%` }}
      >
        <span className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-white text-xs font-bold text-foreground shadow-md">
          ⇆
        </span>
      </div>
    </div>
  );
}
