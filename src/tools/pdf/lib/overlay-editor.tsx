"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  PenLine,
  Redo2,
  RotateCw,
  Square,
  Trash2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHistory } from "@/hooks/use-history";
import { useT, type Localized } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ColorField, Field, FONT_OPTIONS, NumberField, RangeField, SelectField, TextField, ToggleField } from "./controls";
import { readEmbeddableImage } from "./image-input";
import { arrowHead, type Overlay, type OverlayImage, type OverlaySettings } from "./overlays";
import { canUseStandardFont, hasRtl, type StandardFontName } from "./page-space";
import { PdfStatus, RenderedPage } from "./pages";
import { measureRasterText } from "./raster-text";
import { usePdfJs } from "./use-pdf";

export type EditorTool = "select" | "text" | "image" | "rect" | "ellipse" | "line" | "arrow" | "path" | "highlight" | "underline";

const TOOL_INFO: Record<EditorTool, { icon: typeof Type; label: Localized }> = {
  select: { icon: MousePointer2, label: { ar: "تحديد ونقل", en: "Select & move" } },
  text: { icon: Type, label: { ar: "نص", en: "Text" } },
  image: { icon: ImagePlus, label: { ar: "صورة", en: "Image" } },
  rect: { icon: Square, label: { ar: "مستطيل", en: "Rectangle" } },
  ellipse: { icon: Circle, label: { ar: "دائرة", en: "Ellipse" } },
  line: { icon: Minus, label: { ar: "خط", en: "Line" } },
  arrow: { icon: ArrowUpRight, label: { ar: "سهم", en: "Arrow" } },
  path: { icon: PenLine, label: { ar: "رسم حر", en: "Freehand" } },
  highlight: { icon: Highlighter, label: { ar: "تظليل", en: "Highlight" } },
  underline: { icon: Underline, label: { ar: "تسطير", en: "Underline" } },
};

const FONT_CSS: Record<StandardFontName, string> = {
  helvetica: "Helvetica, Arial, sans-serif",
  times: '"Times New Roman", Times, serif',
  courier: '"Courier New", Courier, monospace',
};
const ASCENT: Record<StandardFontName, number> = { helvetica: 0.718, times: 0.683, courier: 0.629 };
const DESCENT: Record<StandardFontName, number> = { helvetica: 0.207, times: 0.217, courier: 0.157 };
const LINE = 1.25;

let seq = 0;
const newId = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;

type PageSize = { width: number; height: number };

/** Size (points) of a text object, matching how it will be drawn into the PDF. */
export function textSize(text: string, fontSize: number, font: StandardFontName, bold: boolean): PageSize {
  const lines = text.split("\n");
  if (!canUseStandardFont(text)) return measureRasterText(text, { fontSize, color: "#000", bold });
  const c = document.createElement("canvas").getContext("2d")!;
  c.font = `${bold ? 700 : 400} ${fontSize}px ${FONT_CSS[font]}`;
  const width = Math.max(4, ...lines.map((l) => c.measureText(l).width));
  return { width, height: (lines.length - 1) * fontSize * LINE + (ASCENT[font] + DESCENT[font]) * fontSize };
}

function fitText(o: Overlay, page: PageSize): Overlay {
  const s = textSize(o.text || " ", o.fontSize ?? 16, o.font ?? "helvetica", !!o.bold);
  return { ...o, w: s.width / page.width, h: s.height / page.height };
}

export type EditorApi = {
  /** Places an image in the middle of the current page; `width` is a fraction of page width. */
  addImage: (img: OverlayImage, width?: number) => void;
  addText: (text: string, opts?: Partial<Overlay>) => void;
};

type Gesture =
  | { type: "draw"; id: string; x0: number; y0: number }
  | { type: "move"; x0: number; y0: number; start: Overlay }
  | { type: "resize"; corner: string; x0: number; y0: number; start: Overlay }
  | { type: "rotate"; start: Overlay; cx: number; cy: number };

export function OverlayEditor({
  file,
  settings,
  onChange,
  tools,
  toolbarExtras,
  defaults,
}: {
  file: File;
  settings: OverlaySettings;
  onChange: (s: OverlaySettings) => void;
  tools: EditorTool[];
  toolbarExtras?: (api: EditorApi) => ReactNode;
  defaults?: Partial<Pick<Overlay, "color" | "strokeWidth" | "fontSize">>;
}) {
  const t = useT();
  const pdf = usePdfJs(file);
  const history = useHistory<OverlaySettings>(settings);
  const [tool, setTool] = useState<EditorTool>("select");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<PageSize | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The in-progress gesture is mirrored in a ref: pointer events can arrive before React
  // re-renders, and reading state there would ignore moves or drop the gesture on release.
  const [draft, setDraftState] = useState<Overlay[] | null>(null);
  const draftRef = useRef<Overlay[] | null>(null);
  const setDraft = (next: Overlay[] | null) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const [style, setStyle] = useState({ color: defaults?.color ?? "#d32f2f", strokeWidth: defaults?.strokeWidth ?? 2, fontSize: defaults?.fontSize ?? 16, opacity: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  // Report every committed change to the workspace.
  const value = history.value;
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current(value);
  }, [value]);

  const urls = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, img] of Object.entries(value.images)) out[id] = URL.createObjectURL(new Blob([img.bytes as Uint8Array<ArrayBuffer>], { type: `image/${img.type}` }));
    return out;
  }, [value.images]);
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const objects = draft ?? value.overlays;
  const onPage = objects.filter((o) => o.page === page);
  const selected = objects.find((o) => o.id === selectedId) ?? null;

  const commit = (overlays: Overlay[], images = value.images) => history.set({ overlays, images });
  const updateSelected = (patch: Partial<Overlay>, refit = false) => {
    if (!selected || !size) return;
    commit(value.overlays.map((o) => (o.id === selected.id ? (refit ? fitText({ ...o, ...patch }, size) : { ...o, ...patch }) : o)));
  };
  const remove = () => {
    if (!selected) return;
    commit(value.overlays.filter((o) => o.id !== selected.id));
    setSelectedId(null);
  };

  // Delete / arrow keys when an object is selected and focus isn't in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (!selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        history.set({ overlays: value.overlays.filter((o) => o.id !== selectedId), images: value.images });
        setSelectedId(null);
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.004;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        history.set({ overlays: value.overlays.map((o) => (o.id === selectedId ? { ...o, x: o.x + dx, y: o.y + dy } : o)), images: value.images });
      } else if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, value, history]);

  const api: EditorApi = {
    addImage: (img, width = 0.3) => {
      if (!size) return;
      const id = newId();
      const w = width;
      const h = (w * size.width * img.height) / img.width / size.height;
      const o: Overlay = { id, page, kind: "image", x: 0.5 - w / 2, y: 0.5 - h / 2, w, h, rotation: 0, color: "#000000", fill: null, strokeWidth: 0, opacity: 1, imageId: id };
      commit([...value.overlays, o], { ...value.images, [id]: img });
      setSelectedId(id);
      setTool("select");
    },
    addText: (text, opts) => {
      if (!size) return;
      const o = fitText(
        { id: newId(), page, kind: "text", x: 0.35, y: 0.45, w: 0.2, h: 0.05, rotation: 0, color: style.color, fill: null, strokeWidth: 0, opacity: 1, text, fontSize: style.fontSize, font: "helvetica", bold: false, ...opts },
        size,
      );
      commit([...value.overlays, o]);
      setSelectedId(o.id);
      setTool("select");
    },
  };

  if (!pdf.doc) return <PdfStatus pdf={pdf} />;
  const shown = Math.min(page, pdf.numPages - 1);

  /** Pointer position as page fractions (0–1, y down). */
  const at = (e: React.PointerEvent): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  const startDraw = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!size || tool === "select") {
      if (e.target === svgRef.current) setSelectedId(null);
      return;
    }
    e.preventDefault();
    svgRef.current!.setPointerCapture(e.pointerId);
    const [x, y] = at(e);
    if (tool === "image") {
      imageInput.current?.click();
      return;
    }
    if (tool === "text") {
      const o = fitText(
        { id: newId(), page: shown, kind: "text", x, y, w: 0.1, h: 0.03, rotation: 0, color: style.color, fill: null, strokeWidth: 0, opacity: style.opacity, text: t({ ar: "نص", en: "Text" }), fontSize: style.fontSize, font: "helvetica", bold: false },
        size,
      );
      commit([...value.overlays, o]);
      setSelectedId(o.id);
      setTool("select");
      return;
    }
    const id = newId();
    const kind = tool === "underline" ? "line" : tool;
    const o: Overlay = {
      id,
      page: shown,
      kind,
      x,
      y,
      w: 0,
      h: 0,
      rotation: 0,
      color: tool === "highlight" ? "#ffeb3b" : style.color,
      fill: null,
      strokeWidth: style.strokeWidth,
      opacity: tool === "highlight" ? 0.45 : style.opacity,
      points: [[x, y]],
    };
    gesture.current = { type: "draw", id, x0: x, y0: y };
    setDraft([...value.overlays, o]);
  };

  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    const current = draftRef.current;
    if (!g || !size || !current) return;
    const [x, y] = at(e);
    setDraft(
      current.map((o) => {
        if (g.type === "draw" && o.id === g.id) {
          if (o.kind === "path") return { ...o, points: [...(o.points ?? []), [x, y]] };
          const y1 = tool === "underline" ? g.y0 : y;
          return { ...o, points: [[g.x0, g.y0], [x, y1]] };
        }
        if (g.type !== "draw" && o.id === g.start.id) {
          if (g.type === "move") return { ...o, x: g.start.x + (x - g.x0), y: g.start.y + (y - g.y0) };
          if (g.type === "rotate") {
            const deg = (Math.atan2((y - g.cy) * size.height, (x - g.cx) * size.width) * 180) / Math.PI + 90;
            return { ...o, rotation: Math.round(deg / (e.shiftKey ? 15 : 1)) * (e.shiftKey ? 15 : 1) };
          }
          return resizeBox(g.start, g.corner, x - g.x0, y - g.y0, size);
        }
        return o;
      }),
    );
  };

  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    const current = draftRef.current;
    if (!g || !current) return;
    let list = current;
    if (g.type === "draw") {
      list = current
        .map((o) => (o.id === g.id ? finishShape(o, size!) : o))
        .filter((o): o is Overlay => o !== null);
      setSelectedId(list.some((o) => o.id === g.id) ? g.id : null);
    }
    setDraft(null);
    commit(list);
  };

  const beginObjectGesture = (e: React.PointerEvent, o: Overlay, kind: "move" | "rotate" | string) => {
    if (tool !== "select") return;
    e.preventDefault();
    e.stopPropagation();
    svgRef.current!.setPointerCapture(e.pointerId);
    setSelectedId(o.id);
    const [x, y] = at(e);
    gesture.current =
      kind === "move"
        ? { type: "move", x0: x, y0: y, start: o }
        : kind === "rotate"
          ? { type: "rotate", start: o, cx: o.x + o.w / 2, cy: o.y + o.h / 2 }
          : { type: "resize", corner: kind, x0: x, y0: y, start: o };
    setDraft(value.overlays);
  };

  const tb = (name: EditorTool) => {
    const Icon = TOOL_INFO[name].icon;
    return (
      <Button
        key={name}
        size="icon-sm"
        variant={tool === name ? "default" : "outline"}
        aria-pressed={tool === name}
        aria-label={t(TOOL_INFO[name].label)}
        title={t(TOOL_INFO[name].label)}
        onClick={() => {
          setTool(name);
          if (name === "image") imageInput.current?.click();
        }}
      >
        <Icon />
      </Button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="sticky top-16 z-10 space-y-2 rounded-xl border bg-card/95 p-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={t({ ar: "أدوات التحرير", en: "Editing tools" })}>
          {tools.map(tb)}
          {toolbarExtras?.(api)}
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          <Button size="icon-sm" variant="ghost" disabled={!history.canUndo} onClick={history.undo} aria-label={t({ ar: "تراجع", en: "Undo" })}>
            <Undo2 className="rtl:-scale-x-100" />
          </Button>
          <Button size="icon-sm" variant="ghost" disabled={!history.canRedo} onClick={history.redo} aria-label={t({ ar: "إعادة", en: "Redo" })}>
            <Redo2 className="rtl:-scale-x-100" />
          </Button>
          <span className="ms-auto flex items-center gap-1">
            <Button size="icon-sm" variant="outline" disabled={shown <= 0} onClick={() => setPage(shown - 1)} aria-label={t({ ar: "الصفحة السابقة", en: "Previous page" })}>
              <ChevronRight className="ltr:rotate-180" />
            </Button>
            <span className="text-xs" dir="ltr">
              {shown + 1} / {pdf.numPages}
            </span>
            <Button size="icon-sm" variant="outline" disabled={shown >= pdf.numPages - 1} onClick={() => setPage(shown + 1)} aria-label={t({ ar: "الصفحة التالية", en: "Next page" })}>
              <ChevronLeft className="ltr:rotate-180" />
            </Button>
          </span>
        </div>
        {/* Fixed height, so switching tools never shifts the page under the pointer. */}
        <div className="flex min-h-10 flex-wrap items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            {tool === "select"
              ? t({ ar: "اضغط على عنصر لتحديده، واسحبه لنقله", en: "Tap an object to select it; drag to move it" })
              : tool === "text"
                ? t({ ar: "اضغط على الصفحة لإضافة نص", en: "Tap the page to add text" })
                : tool === "image"
                  ? t({ ar: "اختر صورة لإضافتها", en: "Choose an image to add" })
                  : t({ ar: "اسحب على الصفحة للرسم", en: "Drag on the page to draw" })}
          </span>
          {tool !== "select" && tool !== "image" && tool !== "highlight" && (
            <ColorField value={style.color} onChange={(color) => setStyle({ ...style, color })} ariaLabel={t({ ar: "اللون", en: "Colour" })} />
          )}
          {tool !== "select" && tool !== "image" && tool !== "text" && tool !== "highlight" && (
            <label className="flex items-center gap-1.5">
              {t({ ar: "السماكة", en: "Width" })}
              <input type="range" min={0.5} max={12} step={0.5} value={style.strokeWidth} onChange={(e) => setStyle({ ...style, strokeWidth: Number(e.target.value) })} className="w-24 accent-[var(--primary)]" />
            </label>
          )}
        </div>
      </div>

      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label={t({ ar: "إضافة صورة", en: "Add image" })}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return setTool("select");
          try {
            api.addImage(await readEmbeddableImage(f));
          } catch {
            setTool("select");
          }
        }}
      />

      {/* Properties sit below the page, so the page never moves or shrinks when something is selected. */}
      <div className="space-y-3">
        <RenderedPage source={file} page={shown + 1} maxHeight={900} onSize={setSize}>
          {size && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${size.width} ${size.height}`}
              preserveAspectRatio="none"
              className={cn("absolute inset-0 size-full", tool === "select" ? "touch-pan-y" : "cursor-crosshair touch-none")}
              onPointerDown={startDraw}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              role="application"
              aria-label={t({ ar: "مساحة التحرير", en: "Editing area" })}
            >
              {onPage.map((o) => (
                <OverlayShape key={o.id} o={o} size={size} url={o.imageId ? urls[o.imageId] : undefined} onPointerDown={(e) => beginObjectGesture(e, o, "move")} selectable={tool === "select"} />
              ))}
              {selected && selected.page === shown && tool === "select" && <SelectionFrame o={selected} size={size} onHandle={(e, k) => beginObjectGesture(e, selected, k)} />}
            </svg>
          )}
        </RenderedPage>

        {selected && (
          <aside className="space-y-3 rounded-xl border bg-background p-3" aria-label={t({ ar: "خصائص العنصر", en: "Object properties" })}>
            <div className="flex items-center gap-1.5">
              <p className="me-auto text-sm font-medium">{t(TOOL_INFO[(selected.kind === "path" ? "path" : selected.kind) as EditorTool]?.label ?? TOOL_INFO.select.label)}</p>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t({ ar: "تكرار", en: "Duplicate" })}
                onClick={() => {
                  const copy = { ...selected, id: newId(), x: selected.x + 0.03, y: selected.y + 0.03 };
                  commit([...value.overlays, copy]);
                  setSelectedId(copy.id);
                }}
              >
                <Copy />
              </Button>
              <Button size="icon-sm" variant="destructive" aria-label={t({ ar: "حذف", en: "Delete" })} onClick={remove}>
                <Trash2 />
              </Button>
            </div>
            {selected.kind === "text" && (
              <>
                <TextField value={selected.text ?? ""} multiline onChange={(text) => updateSelected({ text }, true)} ariaLabel={t({ ar: "النص", en: "Text" })} />
                {!canUseStandardFont(selected.text ?? "") && (
                  <p className="text-xs text-muted-foreground">{t({ ar: "يُحفظ النص العربي كصورة (غير قابل للتحديد).", en: "Arabic text is saved as an image (not selectable)." })}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t({ ar: "الحجم", en: "Size" })}>
                    <NumberField value={selected.fontSize ?? 16} min={4} max={200} onChange={(fontSize) => updateSelected({ fontSize }, true)} />
                  </Field>
                  <Field label={t({ ar: "الخط", en: "Font" })}>
                    <SelectField value={selected.font ?? "helvetica"} options={FONT_OPTIONS} disabled={!canUseStandardFont(selected.text ?? "")} onChange={(font) => updateSelected({ font }, true)} />
                  </Field>
                </div>
                <ToggleField checked={!!selected.bold} onChange={(bold) => updateSelected({ bold }, true)} label={t({ ar: "عريض", en: "Bold" })} />
              </>
            )}
            {selected.kind !== "image" && (
              <Field label={t({ ar: "اللون", en: "Colour" })}>
                <ColorField value={selected.color} onChange={(color) => updateSelected({ color })} />
              </Field>
            )}
            {(selected.kind === "rect" || selected.kind === "ellipse") && (
              <ToggleField checked={selected.fill !== null} onChange={(on) => updateSelected({ fill: on ? selected.color : null })} label={t({ ar: "تعبئة", en: "Fill" })} />
            )}
            {["rect", "ellipse", "line", "arrow", "path"].includes(selected.kind) && (
              <Field label={t({ ar: "السماكة", en: "Line width" })}>
                <RangeField value={selected.strokeWidth} min={0.5} max={12} step={0.5} format={(v) => `${v}pt`} onChange={(strokeWidth) => updateSelected({ strokeWidth })} />
              </Field>
            )}
            <Field label={t({ ar: "الشفافية", en: "Opacity" })}>
              <RangeField value={Math.round(selected.opacity * 100)} min={10} max={100} format={(v) => `${v}%`} onChange={(v) => updateSelected({ opacity: v / 100 })} />
            </Field>
            {!["line", "arrow", "path"].includes(selected.kind) && (
              <Field label={t({ ar: "التدوير", en: "Rotation" })}>
                <RangeField value={selected.rotation} min={-180} max={180} format={(v) => `${v}°`} onChange={(rotation) => updateSelected({ rotation })} />
              </Field>
            )}
            <p className="text-xs text-muted-foreground">
              {t({ ar: "اسحب العنصر لنقله، والمقابض لتغيير حجمه وتدويره. الأسهم في لوحة المفاتيح تحرّكه بدقة.", en: "Drag the object to move it, and the handles to resize or rotate. Arrow keys nudge it." })}
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

/** Applies a resize drag to a box; text objects scale their font with the height. */
function resizeBox(o: Overlay, corner: string, dx: number, dy: number, size: PageSize): Overlay {
  let { x, y, w, h } = o;
  if (corner.includes("e")) w = Math.max(0.01, o.w + dx);
  if (corner.includes("s")) h = Math.max(0.01, o.h + dy);
  if (corner.includes("w")) {
    w = Math.max(0.01, o.w - dx);
    x = o.x + o.w - w;
  }
  if (corner.includes("n")) {
    h = Math.max(0.01, o.h - dy);
    y = o.y + o.h - h;
  }
  if (o.kind === "text" || o.kind === "image") {
    // Keep proportions: follow the larger change.
    const scale = Math.max(w / o.w, h / o.h);
    w = o.w * scale;
    h = o.h * scale;
    if (corner.includes("w")) x = o.x + o.w - w;
    if (corner.includes("n")) y = o.y + o.h - h;
    if (o.kind === "text") return fitText({ ...o, x, y, fontSize: Math.max(4, Math.round((o.fontSize ?? 16) * scale * 10) / 10) }, size);
  }
  return { ...o, x, y, w, h };
}

/** Turns a drawn gesture into its final box; drops accidental taps. */
function finishShape(o: Overlay, size: PageSize): Overlay | null {
  const pts = o.points ?? [];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const tiny = spanX * size.width < 4 && spanY * size.height < 4;
  if (o.kind === "line" || o.kind === "arrow" || o.kind === "path") {
    if (tiny || pts.length < 2) return null;
    // Give flat lines a little height so the box (and its handles) stays usable.
    const padX = spanX < 0.005 ? 0.005 : 0;
    const padY = spanY < 0.005 ? 0.005 : 0;
    const box = { x: minX - padX, y: minY - padY, w: spanX + 2 * padX, h: spanY + 2 * padY };
    const points = pts.map(([px, py]) => [(px - box.x) / box.w, (py - box.y) / box.h] as [number, number]);
    return { ...o, ...box, points };
  }
  // Rectangles, ellipses, highlights: from the drag's corners, or a default size on a tap.
  if (tiny) {
    const w = 120 / size.width;
    const h = (o.kind === "highlight" ? 16 : 70) / size.height;
    return { ...o, x: Math.min(minX, 1 - w), y: Math.min(minY, 1 - h), w, h, points: undefined };
  }
  return { ...o, x: minX, y: minY, w: spanX, h: spanY, points: undefined };
}

function OverlayShape({ o, size, url, onPointerDown, selectable }: { o: Overlay; size: PageSize; url?: string; onPointerDown: (e: React.PointerEvent) => void; selectable: boolean }) {
  const x = o.x * size.width;
  const y = o.y * size.height;
  const w = o.w * size.width;
  const h = o.h * size.height;
  const transform = o.rotation ? `rotate(${o.rotation} ${x + w / 2} ${y + h / 2})` : undefined;
  const common = { onPointerDown, style: { cursor: selectable ? "move" : undefined, touchAction: selectable ? "none" : undefined } as React.CSSProperties, opacity: o.opacity };
  const sw = o.strokeWidth;
  switch (o.kind) {
    case "rect":
      return <rect {...common} x={x} y={y} width={w} height={h} transform={transform} fill={o.fill ?? "transparent"} stroke={o.color} strokeWidth={sw} />;
    case "ellipse":
      return <ellipse {...common} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} transform={transform} fill={o.fill ?? "transparent"} stroke={o.color} strokeWidth={sw} />;
    case "highlight":
      return <rect {...common} x={x} y={y} width={w} height={h} transform={transform} fill={o.color} style={{ ...common.style, mixBlendMode: "multiply" }} />;
    case "line":
    case "arrow":
    case "path": {
      const pts = (o.points ?? []).map(([px, py]) => ({ x: x + px * w, y: y + py * h }));
      if (pts.length < 2) return null;
      const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
      const head = o.kind === "arrow" ? arrowHead(pts[pts.length - 2], pts[pts.length - 1], Math.max(8, sw * 4)) : null;
      const tip = pts[pts.length - 1];
      return (
        <g {...common}>
          {/* Wide invisible stroke makes thin lines easy to grab on touch screens. */}
          <path d={d} stroke="transparent" strokeWidth={Math.max(14, sw + 10)} fill="none" />
          <path d={d} stroke={o.color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {head && <path d={`M${head[0].x} ${head[0].y} L${tip.x} ${tip.y} L${head[1].x} ${head[1].y}`} stroke={o.color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        </g>
      );
    }
    case "image":
      return url ? <image {...common} href={url} x={x} y={y} width={w} height={h} transform={transform} preserveAspectRatio="none" /> : null;
    case "text": {
      const text = o.text ?? "";
      const fs = o.fontSize ?? 16;
      const font = o.font ?? "helvetica";
      const vector = canUseStandardFont(text);
      const rtl = hasRtl(text);
      const lines = text.split("\n");
      return (
        <g {...common} transform={transform}>
          <rect x={x} y={y} width={w} height={h} fill="transparent" />
          <text
            fill={o.color}
            fontSize={fs}
            fontWeight={o.bold ? 700 : 400}
            style={{ fontFamily: vector ? FONT_CSS[font] : "var(--font-body)", whiteSpace: "pre" }}
            direction={rtl ? "rtl" : "ltr"}
            textAnchor="start"
            dominantBaseline={vector ? undefined : "central"}
          >
            {lines.map((line, i) => (
              <tspan key={i} x={rtl ? x + w - fs * 0.05 : vector ? x : x + fs * 0.05} y={vector ? y + ASCENT[font] * fs + i * fs * LINE : y + i * fs * LINE + (fs * LINE) / 2}>
                {line || " "}
              </tspan>
            ))}
          </text>
        </g>
      );
    }
  }
}

function SelectionFrame({ o, size, onHandle }: { o: Overlay; size: PageSize; onHandle: (e: React.PointerEvent, kind: string) => void }) {
  const x = o.x * size.width;
  const y = o.y * size.height;
  const w = o.w * size.width;
  const h = o.h * size.height;
  const r = Math.max(5, size.width / 90);
  const rotatable = !["line", "arrow", "path"].includes(o.kind);
  const corners: [string, number, number][] = [
    ["nw", x, y],
    ["ne", x + w, y],
    ["sw", x, y + h],
    ["se", x + w, y + h],
  ];
  return (
    <g transform={o.rotation ? `rotate(${o.rotation} ${x + w / 2} ${y + h / 2})` : undefined}>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="var(--primary)" strokeWidth={Math.max(1, size.width / 600)} strokeDasharray="4 3" pointerEvents="none" />
      {corners.map(([k, cx, cy]) => (
        <circle key={k} cx={cx} cy={cy} r={r} fill="white" stroke="var(--primary)" strokeWidth={1.5} style={{ cursor: `${k}-resize`, touchAction: "none" }} onPointerDown={(e) => onHandle(e, k)} />
      ))}
      {rotatable && (
        <g style={{ cursor: "grab", touchAction: "none" }} onPointerDown={(e) => onHandle(e, "rotate")}>
          <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y - r * 4} stroke="var(--primary)" strokeWidth={1} />
          <circle cx={x + w / 2} cy={y - r * 4} r={r} fill="var(--primary)" />
          <RotateCw x={x + w / 2 - r * 0.7} y={y - r * 4.7} width={r * 1.4} height={r * 1.4} color="white" />
        </g>
      )}
    </g>
  );
}
