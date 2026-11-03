"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Circle, Copy, Redo2, Square, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/files/format";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { resolveFormat, type FormatChoice } from "./lib/format";
import { finishCanvas, loadToCanvas } from "./lib/pipeline";
import { PreviewCanvas, usePreviewBase } from "./lib/preview";
import { commit, moveRegion, redo, regionFromPoints, undo, type Region, type RegionEffect, type RegionHistory, type RegionMap, type RegionShape } from "./lib/regions";
import { applyRegions } from "./lib/regions-apply";
import { ColorField, METADATA_NOTE, Note, OutputFormatFields, Segmented, SliderField } from "./lib/ui";

export type BlurSettings = {
  regions: RegionMap;
  history: RegionHistory;
  /** Used for new regions, and edits the selected one. */
  shape: RegionShape;
  effect: RegionEffect;
  strength: number;
  color: string;
  selected: string | null;
  format: FormatChoice;
  quality: number;
};

const defaultSettings: BlurSettings = {
  regions: {},
  history: { past: [], future: [] },
  shape: "rect",
  effect: "pixelate",
  strength: 60,
  color: "#000000",
  selected: null,
  format: "keep",
  quality: 92,
};

const EMPTY: Region[] = [];
let nextId = 0;
const newId = () => `r${Date.now().toString(36)}${(nextId++).toString(36)}`;

/** Updates the regions with an undo step. */
function withRegions(s: BlurSettings, regions: RegionMap, extra: Partial<BlurSettings> = {}): BlurSettings {
  return { ...s, ...commit(s.regions, s.history, regions), ...extra };
}

/** Changes a tool option; if a region is selected, it changes that region too. */
function setOption(s: BlurSettings, fileId: string | undefined, patch: Partial<Pick<Region, "shape" | "effect" | "strength" | "color">>): BlurSettings {
  const next = { ...s, ...patch };
  if (!fileId || !s.selected) return next;
  const list = s.regions[fileId] ?? [];
  if (!list.some((r) => r.id === s.selected)) return next;
  return withRegions(next, { ...s.regions, [fileId]: list.map((r) => (r.id === s.selected ? { ...r, ...patch } : r)) });
}

function Toolbar({ s, onChange, fileId, compact }: { s: BlurSettings; onChange: (s: BlurSettings) => void; fileId?: string; compact?: boolean }) {
  const t = useT();
  const list = fileId ? (s.regions[fileId] ?? []) : [];
  const selected = list.find((r) => r.id === s.selected);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "justify-center")}>
      <Segmented
        label={t({ ar: "الشكل", en: "Shape" })}
        value={s.shape}
        onChange={(shape) => onChange(setOption(s, fileId, { shape }))}
        options={[
          { value: "rect", label: <Square className="mx-auto size-4" aria-label={t({ ar: "مستطيل", en: "Rectangle" })} />, title: t({ ar: "مستطيل", en: "Rectangle" }) },
          { value: "ellipse", label: <Circle className="mx-auto size-4" aria-label={t({ ar: "بيضاوي", en: "Ellipse" })} />, title: t({ ar: "بيضاوي", en: "Ellipse" }) },
        ]}
      />
      <Segmented
        label={t({ ar: "التأثير", en: "Effect" })}
        value={s.effect}
        onChange={(effect) => onChange(setOption(s, fileId, { effect }))}
        options={[
          { value: "blur", label: t({ ar: "تمويه", en: "Blur" }) },
          { value: "pixelate", label: t({ ar: "بكسلة", en: "Pixelate" }) },
          { value: "mask", label: t({ ar: "تغطية", en: "Solid" }) },
        ]}
      />
      <div className="flex gap-1">
        <Button variant="outline" size="icon-lg" disabled={!s.history.past.length} onClick={() => onChange({ ...s, ...undo(s.regions, s.history), selected: null })} aria-label={t({ ar: "تراجع", en: "Undo" })} title={t({ ar: "تراجع", en: "Undo" })}>
          <Undo2 />
        </Button>
        <Button variant="outline" size="icon-lg" disabled={!s.history.future.length} onClick={() => onChange({ ...s, ...redo(s.regions, s.history), selected: null })} aria-label={t({ ar: "إعادة", en: "Redo" })} title={t({ ar: "إعادة", en: "Redo" })}>
          <Redo2 />
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          disabled={!selected || !fileId}
          onClick={() => fileId && onChange(withRegions(s, { ...s.regions, [fileId]: list.filter((r) => r.id !== s.selected) }, { selected: null }))}
          aria-label={t({ ar: "حذف المنطقة المحددة", en: "Delete selected area" })}
          title={t({ ar: "حذف المنطقة المحددة", en: "Delete selected area" })}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

function Settings({ settings: s, onChange, files, activeFile, disabled }: SettingsProps<BlurSettings>) {
  const t = useT();
  const fileId = activeFile?.id;
  const count = fileId ? (s.regions[fileId]?.length ?? 0) : 0;
  return (
    <div className="space-y-4">
      <Note tone="warning">
        {t({
          ar: "التمويه ليس إخفاءً آمناً: التمويه الخفيف قد يُعكس جزئياً. للمعلومات الحساسة (أرقام، وجوه، عناوين) استخدم «تغطية» بلون كامل.",
          en: "Blur is not secure redaction: light blur can sometimes be partly reversed. For sensitive data (numbers, faces, addresses) use “Solid” cover.",
        })}
      </Note>
      <SliderField
        label={t({ ar: "الشدة", en: "Strength" })}
        value={s.strength}
        min={1}
        max={100}
        disabled={disabled || s.effect === "mask"}
        onChange={(strength) => onChange(setOption(s, fileId, { strength }))}
        format={(v) => `${v}%`}
      />
      {s.effect === "mask" && <ColorField label={t({ ar: "لون التغطية", en: "Cover colour" })} value={s.color} disabled={disabled} onChange={(color) => onChange(setOption(s, fileId, { color }))} />}
      <p className="text-sm text-muted-foreground">
        {t({ ar: `مناطق في هذه الصورة: ${formatNumber(count)}`, en: `Areas on this image: ${formatNumber(count)}` })}
      </p>
      {files.length > 1 && fileId && (
        <Button
          variant="outline"
          className="h-10 w-full rounded-xl"
          disabled={disabled || !count}
          onClick={() => {
            const src = s.regions[fileId] ?? [];
            const all: RegionMap = { ...s.regions };
            for (const f of files) if (f.id !== fileId) all[f.id] = src.map((r) => ({ ...r, id: newId() }));
            onChange(withRegions(s, all));
          }}
        >
          <Copy />
          {t({ ar: "طبّق نفس المناطق على كل الصور", en: "Use these areas on all images" })}
        </Button>
      )}
      <OutputFormatFields format={s.format} quality={s.quality} disabled={disabled} onChange={(v) => onChange({ ...s, ...v })} />
      <Note>{t(METADATA_NOTE)}</Note>
    </div>
  );
}

type Drag =
  | { kind: "draw"; id: number; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: "move"; id: number; region: Region; start: { x: number; y: number }; current: { x: number; y: number } };

function Preview({ settings: s, onChange, file }: PreviewProps<BlurSettings>) {
  const t = useT();
  const base = usePreviewBase(file);
  const overlay = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const list = s.regions[file.id] ?? EMPTY;

  // Ctrl/⌘+Z and Ctrl/⌘+Shift+Z / Ctrl+Y.
  const latest = useRef(s);
  useEffect(() => {
    latest.current = s;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const cur = latest.current;
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        onChange({ ...cur, ...undo(cur.regions, cur.history), selected: null });
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        onChange({ ...cur, ...redo(cur.regions, cur.history), selected: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  const draw = useCallback(
    async (ctx: CanvasRenderingContext2D) => {
      if (list.length) await applyRegions(ctx.canvas, list);
    },
    [list],
  );

  const point = (e: ReactPointerEvent) => {
    const box = overlay.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) };
  };

  const onDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    try {
      overlay.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const p = point(e);
    const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-region]")?.dataset.region;
    const region = hit ? list.find((r) => r.id === hit) : undefined;
    if (region) {
      onChange({ ...s, selected: region.id, shape: region.shape, effect: region.effect, strength: region.strength, color: region.color });
      setDrag({ kind: "move", id: e.pointerId, region, start: p, current: p });
    } else {
      if (s.selected) onChange({ ...s, selected: null });
      setDrag({ kind: "draw", id: e.pointerId, start: p, current: p });
    }
  };

  const onMove = (e: ReactPointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    setDrag({ ...drag, current: point(e) });
  };

  const onUp = (e: ReactPointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    const end = point(e);
    if (drag.kind === "draw") {
      const r = regionFromPoints(drag.start, end);
      if (r.w > 0.01 && r.h > 0.01) {
        const region: Region = { id: newId(), shape: s.shape, effect: s.effect, strength: s.strength, color: s.color, ...r };
        onChange(withRegions(s, { ...s.regions, [file.id]: [...list, region] }, { selected: region.id }));
      }
    } else {
      const dx = end.x - drag.start.x;
      const dy = end.y - drag.start.y;
      if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) {
        const moved = moveRegion(drag.region, dx, dy);
        onChange(withRegions({ ...s, selected: drag.region.id }, { ...s.regions, [file.id]: list.map((r) => (r.id === moved.id ? moved : r)) }));
      }
    }
    setDrag(null);
  };

  const ghost = drag?.kind === "draw" ? regionFromPoints(drag.start, drag.current) : null;
  const pct = (n: number) => `${n * 100}%`;

  return (
    <div className="space-y-3">
      <Toolbar s={s} onChange={onChange} fileId={file.id} compact />
      <PreviewCanvas base={base} draw={draw} label={t({ ar: "معاينة التمويه", en: "Blur preview" })}>
        <div
          ref={overlay}
          data-testid="blur-overlay"
          className="absolute inset-0 cursor-crosshair touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => setDrag(null)}
        >
          {list.map((r) => {
            const moving = drag?.kind === "move" && drag.region.id === r.id ? moveRegion(r, drag.current.x - drag.start.x, drag.current.y - drag.start.y) : r;
            return (
              <div
                key={r.id}
                data-region={r.id}
                className={cn("absolute cursor-move border-2", r.id === s.selected ? "border-primary" : "border-white/70 border-dashed", r.shape === "ellipse" && "rounded-[50%]")}
                style={{ left: pct(moving.x), top: pct(moving.y), width: pct(moving.w), height: pct(moving.h), boxShadow: "0 0 0 1px rgb(0 0 0 / 0.35)" }}
              />
            );
          })}
          {ghost && (
            <div
              className={cn("pointer-events-none absolute border-2 border-primary bg-primary/15", s.shape === "ellipse" && "rounded-[50%]")}
              style={{ left: pct(ghost.x), top: pct(ghost.y), width: pct(ghost.w), height: pct(ghost.h) }}
            />
          )}
        </div>
      </PreviewCanvas>
      <p className="text-center text-xs text-muted-foreground">
        {t({ ar: "اسحب على الصورة لتحديد منطقة. اضغط منطقة لتحديدها أو اسحبها لتحريكها.", en: "Drag on the image to mark an area. Tap an area to select it, or drag it to move." })}
      </p>
    </div>
  );
}

const blur: ToolModule<BlurSettings> = {
  mode: "per-file",
  defaultSettings,
  Settings,
  Preview,
  actionLabel: { ar: "تطبيق وحفظ", en: "Apply & save" },
  validate: (files, s) => {
    const missing = files.filter((f) => !(s.regions[f.id]?.length)).length;
    if (!missing) return null;
    return files.length === 1
      ? { ar: "اسحب على الصورة لتحديد منطقة واحدة على الأقل", en: "Drag on the image to mark at least one area" }
      : { ar: `حدّد منطقة على كل صورة (${missing} بدون مناطق)`, en: `Mark an area on every image (${missing} without areas)` };
  },
  async process([input], s, { signal }) {
    const { canvas } = await loadToCanvas(input);
    await applyRegions(canvas, s.regions[input.id] ?? [], signal);
    return [await finishCanvas(input, canvas, resolveFormat(s.format, input.kind), { suffix: "blurred", quality: s.quality, signal })];
  },
};

export default blur;
