"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { usePageThumb, usePdfJs, type PdfState } from "./use-pdf";

export const THUMB_WIDTH = 180;

/** One page image, rendered when it scrolls into view. `rotate` is shown with CSS. */
export function PageImage({ file, page, ready, rotate = 0, className }: { file: Blob; page: number; ready: boolean; rotate?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { thumb, failed } = usePageThumb(file, page, THUMB_WIDTH, ref, ready);
  return (
    <div ref={ref} className={cn("flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted/60 p-1.5", className)}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL
        <img
          src={thumb.url}
          alt=""
          draggable={false}
          className="max-h-full max-w-full bg-white shadow-sm transition-transform duration-200"
          style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined, ...(Math.abs(rotate) % 180 === 90 ? fitRotated(thumb.width, thumb.height) : {}) }}
        />
      ) : failed ? (
        <AlertCircle className="size-5 text-destructive" aria-hidden />
      ) : (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}

/** When an image is turned a quarter, shrink it so the turned image still fits the square. */
function fitRotated(w: number, h: number) {
  const ratio = Math.min(w, h) / Math.max(w, h);
  return { maxWidth: `${ratio * 100}%`, maxHeight: `${ratio * 100}%` };
}

export type PageMark = "none" | "selected" | "removed";

/**
 * Thumbnail grid with selection. Tap/click toggles a page; Shift+click selects a
 * span; Space/Enter toggles the focused page; arrow keys move focus.
 */
export function PageGrid({
  file,
  pdf,
  marks,
  onToggle,
  rotations,
  badge,
  className,
  label,
}: {
  file: Blob;
  pdf: PdfState;
  /** 1-based page → mark. */
  marks: (page: number) => PageMark;
  onToggle?: (page: number, extend: boolean) => void;
  rotations?: (page: number) => number;
  badge?: (page: number) => ReactNode;
  className?: string;
  label: string;
}) {
  const t = useT();
  const gridRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(1);
  const pages = Array.from({ length: pdf.numPages }, (_, i) => i + 1);

  const move = (to: number) => {
    const next = Math.min(pdf.numPages, Math.max(1, to));
    setFocus(next);
    gridRef.current?.querySelector<HTMLElement>(`[data-page="${next}"]`)?.focus();
  };

  return (
    <div
      ref={gridRef}
      role={onToggle ? "listbox" : "list"}
      aria-multiselectable={onToggle ? true : undefined}
      aria-label={label}
      className={cn("grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(128px,1fr))]", className)}
      onKeyDown={(e) => {
        if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
        const cols = Math.max(1, Math.round(e.currentTarget.clientWidth / ((e.currentTarget.firstElementChild as HTMLElement | null)?.clientWidth || 120)));
        const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: cols, ArrowUp: -cols }[e.key as "ArrowRight"];
        if (e.key === "Home") move(1);
        else if (e.key === "End") move(pdf.numPages);
        else move(focus + step);
      }}
    >
      {pages.map((p) => {
        const mark = marks(p);
        const content = (
          <>
            <PageImage file={file} page={p} ready={!!pdf.doc} rotate={rotations?.(p)} className={cn(mark === "removed" && "opacity-35")} />
            <span className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground" dir="ltr">
              {p}
              {badge?.(p)}
            </span>
            {mark !== "none" && (
              <span
                className={cn(
                  "absolute top-1.5 end-1.5 flex size-6 items-center justify-center rounded-full text-white shadow",
                  mark === "removed" ? "bg-destructive" : "bg-primary",
                )}
                aria-hidden
              >
                {mark === "removed" ? <span className="text-sm leading-none font-bold">×</span> : <Check className="size-3.5" />}
              </span>
            )}
          </>
        );
        const cls = cn(
          "relative rounded-xl border-2 p-1 text-start outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
          mark === "selected" ? "border-primary bg-brand-soft" : mark === "removed" ? "border-destructive/60 bg-destructive/5" : "border-transparent",
          onToggle && "cursor-pointer hover:border-border",
        );
        return onToggle ? (
          <button
            key={p}
            type="button"
            role="option"
            aria-selected={mark !== "none"}
            aria-label={t({ ar: `الصفحة ${p}`, en: `Page ${p}` })}
            data-page={p}
            tabIndex={p === focus ? 0 : -1}
            onFocus={() => setFocus(p)}
            onClick={(e) => onToggle(p, e.shiftKey)}
            className={cls}
          >
            {content}
          </button>
        ) : (
          <div key={p} role="listitem" data-page={p} className={cls} aria-label={t({ ar: `الصفحة ${p}`, en: `Page ${p}` })}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

/** Loading / error state for a PDF preview. */
export function PdfStatus({ pdf }: { pdf: PdfState }) {
  const t = useT();
  if (pdf.error) {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-destructive/8 p-4 text-sm text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        {pdf.error === "password"
          ? t({ ar: "هذا الملف محمي بكلمة مرور؛ أزل الحماية أولاً.", en: "This PDF is password-protected; remove the protection first." })
          : t({ ar: "تعذّر فتح هذا الملف؛ قد يكون تالفاً.", en: "This file couldn't be opened; it may be damaged." })}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {t({ ar: "جارٍ فتح الملف…", en: "Opening the file…" })}
    </div>
  );
}

/** Renders one page of a PDF (file or freshly generated preview) at the container's width. */
export function RenderedPage({
  source,
  page = 1,
  className,
  onSize,
  maxHeight,
  children,
}: {
  source: Blob;
  page?: number;
  className?: string;
  /** Page size in points as displayed (after rotation). */
  onSize?: (size: { width: number; height: number }) => void;
  maxHeight?: number;
  children?: ReactNode;
}) {
  const pdf = usePdfJs(source);
  const holder = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [width, setWidth] = useState(0);
  const onSizeRef = useRef(onSize);
  useEffect(() => {
    onSizeRef.current = onSize;
  });

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf.doc || !width || !canvasRef.current) return;
    let alive = true;
    let task: { cancel(): void; promise: Promise<void> } | null = null;
    (async () => {
      const p = await pdf.doc!.getPage(Math.min(page, pdf.doc!.numPages));
      if (!alive) return;
      const base = p.getViewport({ scale: 1 });
      onSizeRef.current?.({ width: base.width, height: base.height });
      const cssWidth = maxHeight ? Math.min(width, (maxHeight * base.width) / base.height) : width;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const viewport = p.getViewport({ scale: (cssWidth * dpr) / base.width });
      const canvas = canvasRef.current!;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#fff";
      c.fillRect(0, 0, canvas.width, canvas.height);
      task = p.render({ canvas, canvasContext: c, viewport });
      await task.promise.catch(() => undefined);
      if (alive) setSize({ w: cssWidth, h: (cssWidth * base.height) / base.width });
    })();
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [pdf.doc, page, width, maxHeight]);

  return (
    <div ref={holder} className={cn("w-full", className)}>
      {pdf.error || (!pdf.doc && !size) ? <PdfStatus pdf={pdf} /> : null}
      <div className="relative mx-auto" style={size ? { width: size.w, height: size.h } : { display: pdf.doc ? undefined : "none" }}>
        <canvas ref={canvasRef} className="block size-full rounded-md bg-white shadow-sm ring-1 ring-border" style={size ? { width: size.w, height: size.h } : undefined} />
        {size && children}
      </div>
    </div>
  );
}
