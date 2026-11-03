"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  Brush,
  Check,
  Circle,
  Crop as CropIcon,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  ImagePlus,
  Link2,
  Link2Off,
  Loader2,
  Minus,
  MousePointer2,
  Redo2,
  RotateCcw,
  RotateCw,
  Scan,
  Slash,
  Square,
  SquareSplitHorizontal,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT, type Localized } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { createCanvas, decodeImage, releaseCanvas } from "./lib/canvas";
import { CropBox } from "./lib/crop-box";
import {
  frameLayout,
  hitTest,
  moveObject,
  objectBounds,
  opSize,
  pushHistory,
  redoHistory,
  scaleObject,
  transformObjects,
  transformStrokes,
  undoHistory,
  type EditorObject,
  type FrameKind,
  type GeoOp,
  type History,
  type Point,
  type Stroke,
  type TextObject,
} from "./lib/editor-model";
import { adjustedCanvas, applyGeoToBase, exportDoc, renderEditor, viewCopy, type Doc } from "./lib/editor-render";
import { localize } from "./lib/errors";
import type { FontKey } from "./lib/fonts";
import type { OutputFormat } from "./lib/format";
import { centeredRect, clampRect, ratioValue, type RatioPreset, type Rect } from "./lib/geometry";
import { decodeCached } from "./lib/meme-render";
import { NEUTRAL_ADJUSTMENTS, type Adjustments } from "./lib/pixels";
import { finishCanvas } from "./lib/pipeline";
import { ColorField, Field, FontField, METADATA_NOTE, Note, NumberField, OutputFormatFields, Section, Segmented, SliderField, SwitchField } from "./lib/ui";

type Tool = "select" | "hand" | "crop" | "brush" | "eraser" | "text" | "rect" | "ellipse" | "line" | "arrow";

type Style = {
  color: string;
  /** "none" or a colour. */
  fill: string;
  /** Line / brush width, % of the picture's shorter side. */
  widthPct: number;
  font: FontKey;
  /** Text size, % of the shorter side. */
  textPct: number;
  bold: boolean;
  outline: boolean;
  /** Text used for new text items. */
  text: string;
};

export type PhotoSettings = {
  doc: Doc | null;
  history: History<Doc>;
  tool: Tool;
  selected: string | null;
  style: Style;
  format: OutputFormat;
  quality: number;
};

const defaultSettings: PhotoSettings = {
  doc: null,
  history: { past: [], future: [] },
  tool: "select",
  selected: null,
  style: { color: "#e11d48", fill: "none", widthPct: 0.8, font: "plex", textPct: 8, bold: true, outline: true, text: "" },
  format: "png",
  quality: 92,
};

let seq = 0;
const newId = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;
const short = (d: Doc) => Math.min(d.size.width, d.size.height);
const pct = (d: Doc, p: number) => Math.max(1, (short(d) * p) / 100);

function commit(s: PhotoSettings, doc: Doc, extra: Partial<PhotoSettings> = {}): PhotoSettings {
  return { ...s, doc, history: s.doc ? pushHistory(s.doc, s.history) : s.history, ...extra };
}

function applyOp(s: PhotoSettings, op: GeoOp): PhotoSettings {
  const d = s.doc;
  if (!d) return s;
  const base = applyGeoToBase(d.base, op);
  return commit(s, {
    ...d,
    base,
    size: opSize(op, d.size),
    objects: transformObjects(d.objects, op, d.size),
    strokes: transformStrokes(d.strokes, op, d.size),
  });
}

function patchObject(s: PhotoSettings, id: string, patch: Partial<EditorObject>): PhotoSettings {
  if (!s.doc) return s;
  return commit(s, { ...s.doc, objects: s.doc.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as EditorObject) : o)) });
}

function addObject(s: PhotoSettings, o: EditorObject): PhotoSettings {
  if (!s.doc) return s;
  return commit(s, { ...s.doc, objects: [...s.doc.objects, o] }, { selected: o.id, tool: "select" });
}

function newText(s: PhotoSettings, at: Point, text?: string, patch: Partial<TextObject> = {}): TextObject {
  const d = s.doc!;
  return {
    id: newId(),
    type: "text",
    x: at.x,
    y: at.y,
    text: text ?? (s.style.text.trim() || localize({ ar: "نص", en: "Text" })),
    font: s.style.font,
    size: pct(d, s.style.textPct),
    bold: s.style.bold,
    color: s.style.color,
    outlineColor: "#ffffff",
    outline: s.style.outline ? pct(d, s.style.textPct) * 0.08 : 0,
    rotation: 0,
    ...patch,
  };
}

const TOOLS: { tool: Tool; icon: ReactNode; label: Localized }[] = [
  { tool: "select", icon: <MousePointer2 />, label: { ar: "تحديد وتحريك", en: "Select & move" } },
  { tool: "hand", icon: <Hand />, label: { ar: "تحريك العرض", en: "Pan" } },
  { tool: "crop", icon: <CropIcon />, label: { ar: "قص", en: "Crop" } },
  { tool: "brush", icon: <Brush />, label: { ar: "فرشاة", en: "Brush" } },
  { tool: "eraser", icon: <Eraser />, label: { ar: "ممحاة", en: "Eraser" } },
  { tool: "text", icon: <Type />, label: { ar: "نص", en: "Text" } },
  { tool: "rect", icon: <Square />, label: { ar: "مستطيل", en: "Rectangle" } },
  { tool: "ellipse", icon: <Circle />, label: { ar: "دائرة", en: "Ellipse" } },
  { tool: "line", icon: <Slash />, label: { ar: "خط", en: "Line" } },
  { tool: "arrow", icon: <ArrowUpRight />, label: { ar: "سهم", en: "Arrow" } },
];

const ADJUSTMENTS: { key: keyof Adjustments; label: Localized; min: number; max: number; step: number }[] = [
  { key: "brightness", label: { ar: "السطوع", en: "Brightness" }, min: -100, max: 100, step: 1 },
  { key: "contrast", label: { ar: "التباين", en: "Contrast" }, min: -100, max: 100, step: 1 },
  { key: "saturation", label: { ar: "التشبع", en: "Saturation" }, min: -100, max: 100, step: 1 },
  { key: "exposure", label: { ar: "التعريض", en: "Exposure" }, min: -2, max: 2, step: 0.05 },
  { key: "grayscale", label: { ar: "رمادي", en: "Grayscale" }, min: 0, max: 100, step: 1 },
  { key: "sepia", label: { ar: "بني قديم (سيبيا)", en: "Sepia" }, min: 0, max: 100, step: 1 },
  { key: "blur", label: { ar: "تمويه", en: "Blur" }, min: 0, max: 100, step: 1 },
  { key: "sharpen", label: { ar: "حدّة", en: "Sharpen" }, min: 0, max: 100, step: 1 },
];

const STICKERS = ["⭐", "❤️", "😀", "😎", "🎉", "👍", "🔥", "✅", "📌", "💡"];

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

/** For sliders: change live without history, then record one undo step when the drag ends. */
function useLiveDoc(s: PhotoSettings, onChange: (s: PhotoSettings) => void) {
  const before = useRef<Doc | null>(null);
  const live = (doc: Doc) => {
    if (!before.current) before.current = s.doc;
    onChange({ ...s, doc });
  };
  const done = () => {
    if (before.current) onChange({ ...s, history: pushHistory(before.current, s.history) });
    before.current = null;
  };
  return { live, done };
}

function ResizeBox({ s, onChange, disabled }: { s: PhotoSettings; onChange: (s: PhotoSettings) => void; disabled?: boolean }) {
  const t = useT();
  const d = s.doc!;
  const [lock, setLock] = useState(true);
  const [w, setW] = useState<number | null>(null);
  const [h, setH] = useState<number | null>(null);
  const width = w ?? d.size.width;
  const height = h ?? d.size.height;
  return (
    <Section title={t({ ar: "تغيير حجم الصورة", en: "Resize image" })}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <NumberField label={t({ ar: "العرض", en: "Width" })} value={width} min={1} suffix="px" disabled={disabled} onChange={(v) => {
            setW(v);
            if (lock && v) setH(Math.max(1, Math.round((v * d.size.height) / d.size.width)));
          }} />
        </div>
        <Button variant={lock ? "secondary" : "outline"} size="icon-lg" className="mb-0.5 h-10" aria-pressed={lock} aria-label={t({ ar: "الحفاظ على النسبة", en: "Keep aspect ratio" })} onClick={() => setLock(!lock)}>
          {lock ? <Link2 /> : <Link2Off />}
        </Button>
        <div className="min-w-0 flex-1">
          <NumberField label={t({ ar: "الارتفاع", en: "Height" })} value={height} min={1} suffix="px" disabled={disabled} onChange={(v) => {
            setH(v);
            if (lock && v) setW(Math.max(1, Math.round((v * d.size.width) / d.size.height)));
          }} />
        </div>
      </div>
      <Button
        variant="outline"
        className="h-10 w-full rounded-xl"
        disabled={disabled || !width || !height || (width === d.size.width && height === d.size.height)}
        onClick={() => {
          onChange(applyOp(s, { kind: "resize", size: { width: Math.round(width), height: Math.round(height) } }));
          setW(null);
          setH(null);
        }}
      >
        {t({ ar: "تطبيق الحجم", en: "Apply size" })}
      </Button>
    </Section>
  );
}

function SelectedPanel({ s, onChange, disabled }: { s: PhotoSettings; onChange: (s: PhotoSettings) => void; disabled?: boolean }) {
  const t = useT();
  const o = s.doc?.objects.find((x) => x.id === s.selected);
  const { live, done } = useLiveDoc(s, onChange);
  if (!o || !s.doc) return null;
  const doc = s.doc;
  const liveObj = (patch: Partial<EditorObject>) => live({ ...doc, objects: doc.objects.map((x) => (x.id === o.id ? ({ ...x, ...patch } as EditorObject) : x)) });
  const set = (patch: Partial<EditorObject>) => onChange(patchObject(s, o.id, patch));
  const remove = () => onChange(commit(s, { ...doc, objects: doc.objects.filter((x) => x.id !== o.id) }, { selected: null }));
  const sp = short(doc);
  return (
    <Section title={t({ ar: "العنصر المحدد", en: "Selected item" })}>
      {o.type === "text" && (
        <>
          <Field label={t({ ar: "النص", en: "Text" })}>
            <textarea
              dir="auto"
              rows={2}
              value={o.text}
              disabled={disabled}
              aria-label={t({ ar: "نص العنصر المحدد", en: "Selected text" })}
              onChange={(e) => liveObj({ text: e.target.value })}
              onBlur={done}
              className="w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </Field>
          <FontField value={o.font} disabled={disabled} onChange={(font) => set({ font })} />
          <SliderField label={t({ ar: "الحجم", en: "Size" })} value={Math.round((o.size / sp) * 1000) / 10} min={1} max={40} step={0.5} disabled={disabled} onChange={(v) => liveObj({ size: (v / 100) * sp })} onCommit={done} format={(v) => `${v}%`} />
          <ColorField label={t({ ar: "اللون", en: "Colour" })} value={o.color} disabled={disabled} onChange={(color) => set({ color })} />
          <SwitchField label={t({ ar: "عريض", en: "Bold" })} checked={o.bold} disabled={disabled} onChange={(bold) => set({ bold })} />
          <SwitchField label={t({ ar: "حدّ أبيض", en: "White outline" })} checked={o.outline > 0} disabled={disabled} onChange={(on) => set({ outline: on ? o.size * 0.08 : 0 })} />
          <SliderField label={t({ ar: "الدوران", en: "Rotation" })} value={o.rotation} min={-180} max={180} disabled={disabled} onChange={(rotation) => liveObj({ rotation })} onCommit={done} format={(v) => `${v}°`} />
        </>
      )}
      {(o.type === "rect" || o.type === "ellipse") && (
        <>
          <ColorField label={t({ ar: "لون الحد", en: "Stroke colour" })} value={o.stroke} disabled={disabled} onChange={(stroke) => set({ stroke })} />
          <SwitchField label={t({ ar: "تعبئة", en: "Fill" })} checked={o.fill !== "none"} disabled={disabled} onChange={(on) => set({ fill: on ? o.stroke : "none" })} />
          {o.fill !== "none" && <ColorField label={t({ ar: "لون التعبئة", en: "Fill colour" })} value={o.fill} disabled={disabled} onChange={(fill) => set({ fill })} />}
          <SliderField label={t({ ar: "سماكة الحد", en: "Stroke width" })} value={Math.round((o.strokeWidth / sp) * 1000) / 10} min={0} max={5} step={0.1} disabled={disabled} onChange={(v) => liveObj({ strokeWidth: (v / 100) * sp })} onCommit={done} format={(v) => `${v}%`} />
        </>
      )}
      {(o.type === "line" || o.type === "arrow") && (
        <>
          <ColorField label={t({ ar: "اللون", en: "Colour" })} value={o.color} disabled={disabled} onChange={(color) => set({ color })} />
          <SliderField label={t({ ar: "السماكة", en: "Width" })} value={Math.round((o.width / sp) * 1000) / 10} min={0.1} max={5} step={0.1} disabled={disabled} onChange={(v) => liveObj({ width: (v / 100) * sp })} onCommit={done} format={(v) => `${v}%`} />
        </>
      )}
      {o.type === "image" && (
        <>
          <SliderField label={t({ ar: "العرض", en: "Width" })} value={Math.round((o.w / doc.size.width) * 100)} min={2} max={150} disabled={disabled} onChange={(v) => {
            const w = (v / 100) * doc.size.width;
            liveObj({ w, h: (o.h * w) / o.w });
          }} onCommit={done} format={(v) => `${v}%`} />
          <SliderField label={t({ ar: "الدوران", en: "Rotation" })} value={o.rotation} min={-180} max={180} disabled={disabled} onChange={(rotation) => liveObj({ rotation })} onCommit={done} format={(v) => `${v}°`} />
        </>
      )}
      <Button variant="ghost" className="h-9 w-full rounded-lg text-destructive" disabled={disabled} onClick={remove}>
        <Trash2 />
        {t({ ar: "حذف العنصر", en: "Delete item" })}
      </Button>
    </Section>
  );
}

function Settings({ settings: s, onChange, disabled }: SettingsProps<PhotoSettings>) {
  const t = useT();
  const imageInput = useId();
  const { live, done } = useLiveDoc(s, onChange);
  const setStyle = (patch: Partial<Style>) => onChange({ ...s, style: { ...s.style, ...patch } });
  const d = s.doc;
  if (!d) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const center = { x: d.size.width / 2, y: d.size.height / 2 };

  return (
    <div className="space-y-4">
      <SelectedPanel s={s} onChange={onChange} disabled={disabled} />

      <Section title={t({ ar: "إضافة", en: "Add" })}>
        <Field label={t({ ar: "نص العناصر الجديدة", en: "Text for new text items" })}>
          <textarea
            dir="auto"
            rows={2}
            value={s.style.text}
            placeholder={t({ ar: "اكتب هنا، ثم اختر أداة النص واضغط على الصورة", en: "Type here, then pick the Text tool and tap the image" })}
            disabled={disabled}
            onChange={(e) => setStyle({ text: e.target.value })}
            aria-label={t({ ar: "نص العناصر الجديدة", en: "Text for new text items" })}
            className="w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </Field>
        <Button variant="outline" className="h-10 w-full rounded-xl" disabled={disabled} onClick={() => onChange(addObject(s, newText(s, center)))}>
          <Type />
          {t({ ar: "إضافة نص في الوسط", en: "Add text in the centre" })}
        </Button>
        <label htmlFor={imageInput} className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-background text-sm font-medium hover:bg-muted">
          <ImagePlus className="size-4" />
          {t({ ar: "إضافة صورة فوقها", en: "Add an image on top" })}
        </label>
        <input
          id={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          data-testid="editor-image-input"
          disabled={disabled}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const img = await decodeCached(f);
              const w = d.size.width * 0.4;
              onChange(addObject(s, { id: newId(), type: "image", file: f, x: center.x, y: center.y, w, h: (w * img.height) / img.width, rotation: 0 }));
            } catch {
              // decodeCached already reports unreadable files as errors on export; ignore here
            }
          }}
        />
        <Field label={t({ ar: "ملصقات", en: "Stickers" })}>
          <div className="flex flex-wrap gap-1.5">
            {STICKERS.map((e) => (
              <button
                key={e}
                type="button"
                disabled={disabled}
                aria-label={t({ ar: `إضافة ملصق ${e}`, en: `Add sticker ${e}` })}
                className="size-10 rounded-lg border bg-background text-xl hover:bg-muted"
                onClick={() => onChange(addObject(s, newText(s, center, e, { font: "tahoma", size: pct(d, 16), outline: 0, bold: false })))}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title={t({ ar: "نمط العناصر الجديدة", en: "Style for new items" })}>
        <ColorField label={t({ ar: "اللون", en: "Colour" })} value={s.style.color} disabled={disabled} onChange={(color) => setStyle({ color })} />
        <SwitchField label={t({ ar: "تعبئة الأشكال", en: "Fill shapes" })} checked={s.style.fill !== "none"} disabled={disabled} onChange={(on) => setStyle({ fill: on ? s.style.color : "none" })} />
        <SliderField label={t({ ar: "سماكة الخط والفرشاة", en: "Line & brush width" })} value={s.style.widthPct} min={0.2} max={6} step={0.1} disabled={disabled} onChange={(widthPct) => setStyle({ widthPct })} format={(v) => `${v}%`} />
        <FontField value={s.style.font} disabled={disabled} onChange={(font) => setStyle({ font })} />
        <SliderField label={t({ ar: "حجم النص", en: "Text size" })} value={s.style.textPct} min={1} max={40} step={0.5} disabled={disabled} onChange={(textPct) => setStyle({ textPct })} format={(v) => `${v}%`} />
        <SwitchField label={t({ ar: "نص عريض", en: "Bold text" })} checked={s.style.bold} disabled={disabled} onChange={(bold) => setStyle({ bold })} />
        <SwitchField label={t({ ar: "حدّ أبيض للنص", en: "White text outline" })} checked={s.style.outline} disabled={disabled} onChange={(outline) => setStyle({ outline })} />
      </Section>

      <Section title={t({ ar: "الإضاءة والألوان", en: "Light & colour" })}>
        {ADJUSTMENTS.map((a) => (
          <SliderField
            key={a.key}
            label={t(a.label)}
            value={d.adjust[a.key]}
            min={a.min}
            max={a.max}
            step={a.step}
            disabled={disabled}
            onChange={(v) => live({ ...d, adjust: { ...d.adjust, [a.key]: v } })}
            onCommit={done}
          />
        ))}
        <Button variant="ghost" className="h-9 w-full rounded-lg" disabled={disabled} onClick={() => onChange(commit(s, { ...d, adjust: NEUTRAL_ADJUSTMENTS }))}>
          {t({ ar: "إعادة الإضاءة والألوان", en: "Reset light & colour" })}
        </Button>
      </Section>

      <Section title={t({ ar: "إطار", en: "Frame" })}>
        <Segmented
          label={t({ ar: "نوع الإطار", en: "Frame type" })}
          value={d.frame.kind}
          columns={2}
          disabled={disabled}
          onChange={(kind: FrameKind) => onChange(commit(s, { ...d, frame: { ...d.frame, kind, color: kind === "polaroid" ? "#ffffff" : d.frame.color } }))}
          options={[
            { value: "none", label: t({ ar: "بدون", en: "None" }) },
            { value: "border", label: t({ ar: "حدّ", en: "Border" }) },
            { value: "rounded", label: t({ ar: "زوايا دائرية", en: "Rounded" }) },
            { value: "polaroid", label: t({ ar: "بولارويد", en: "Polaroid" }) },
          ]}
        />
        {d.frame.kind !== "none" && (
          <>
            <SliderField label={t({ ar: "الحجم", en: "Size" })} value={d.frame.sizePct} min={1} max={25} step={0.5} disabled={disabled} onChange={(sizePct) => live({ ...d, frame: { ...d.frame, sizePct } })} onCommit={done} format={(v) => `${v}%`} />
            <ColorField label={t({ ar: "لون الإطار", en: "Frame colour" })} value={d.frame.color} disabled={disabled} onChange={(color) => onChange(commit(s, { ...d, frame: { ...d.frame, color } }))} />
          </>
        )}
      </Section>

      <ResizeBox key={`${d.size.width}x${d.size.height}`} s={s} onChange={onChange} disabled={disabled} />

      <OutputFormatFields format={s.format} quality={s.quality} allowKeep={false} disabled={disabled} onChange={({ format, quality }) => onChange({ ...s, format: format as OutputFormat, quality })} />
      {s.format === "jpeg" && d.frame.kind === "rounded" && <Note>{t({ ar: "JPG لا يدعم الشفافية: تُملأ الزوايا بلون الإطار.", en: "JPG has no transparency: the corners are filled with the frame colour." })}</Note>}
      <Note>{t({ ar: "الممحاة تمسح الرسم الحر فقط ولا تمسّ الصورة الأصلية.", en: "The eraser removes freehand drawing only, never the photo itself." })}</Note>
      <Note>{t(METADATA_NOTE)}</Note>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor surface (preview area)
// ---------------------------------------------------------------------------

type Gesture =
  | { kind: "pan"; id: number; sx: number; sy: number; pan: Point }
  | { kind: "move"; id: number; obj: string; start: Point; doc: Doc }
  | { kind: "scale"; id: number; obj: string; center: Point; startDist: number; doc: Doc }
  | { kind: "stroke"; id: number }
  | { kind: "draft"; id: number; start: Point };

const CROP_RATIOS: RatioPreset[] = ["free", "1:1", "4:3", "3:2", "16:9", "9:16"];

function ToolButton({ active, label, onClick, children, disabled, testId }: { active?: boolean; label: string; onClick: () => void; children: ReactNode; disabled?: boolean; testId?: string }) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="icon-lg"
      className="size-10 rounded-lg"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Preview({ settings: s, onChange, file }: PreviewProps<PhotoSettings>) {
  const t = useT();
  const latest = useRef(s);
  useEffect(() => {
    latest.current = s;
  });
  const [error, setError] = useState(false);

  // Load the photo at full size into the document once per file.
  useEffect(() => {
    if (latest.current.doc?.fileId === file.id) return;
    let alive = true;
    decodeImage(file.file)
      .then((dec) => {
        const { canvas, ctx } = createCanvas(dec.width, dec.height);
        ctx.drawImage(dec.source, 0, 0);
        dec.close();
        if (!alive) return releaseCanvas(canvas);
        onChange({
          ...latest.current,
          doc: { fileId: file.id, base: canvas, size: { width: dec.width, height: dec.height }, adjust: NEUTRAL_ADJUSTMENTS, objects: [], strokes: [], frame: { kind: "none", color: "#ffffff", sizePct: 4 } },
          history: { past: [], future: [] },
          selected: null,
        });
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [file, onChange]);

  const doc = s.doc && s.doc.fileId === file.id ? s.doc : null;
  const base = doc?.base;
  const view = useMemo(() => (base ? viewCopy(base) : null), [base]);

  // Adjusted preview picture (worker), recomputed shortly after slider moves.
  const adjust = doc?.adjust;
  const [adjusted, setAdjusted] = useState<{ src: HTMLCanvasElement; adjust: Adjustments; out: HTMLCanvasElement } | null>(null);
  useEffect(() => {
    if (!view || !adjust) return;
    let alive = true;
    const timer = setTimeout(() => {
      adjustedCanvas(view.canvas, adjust)
        .then((out) => alive && setAdjusted({ src: view.canvas, adjust, out }))
        .catch(() => {});
    }, 60);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [view, adjust]);
  const picture = view && adjusted && adjusted.src === view.canvas && adjusted.adjust === adjust ? adjusted.out : view?.canvas;

  // Live, uncommitted edits.
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);
  const [draft, setDraft] = useState<EditorObject | null>(null);
  const [override, setOverride] = useState<Doc | null>(null);
  const shown = override ?? doc;
  const measured = useRef<Record<string, { w: number; h: number }>>({});

  // View: zoom & pan (CSS transform), pinch with two fingers.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [compare, setCompare] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number; mid: Point; pan: Point } | null>(null);
  const gesture = useRef<Gesture | null>(null);

  // Crop mode.
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [cropRatio, setCropRatio] = useState<RatioPreset>("free");
  const cropping = s.tool === "crop" && !!doc;

  useEffect(() => {
    if (!cropping || !doc || !picture || !view) return;
    let alive = true;
    let url: string | null = null;
    const { canvas, ctx } = createCanvas(Math.round(doc.size.width * view.scale), Math.round(doc.size.height * view.scale));
    renderEditor(ctx, doc, picture, { scale: view.scale, noFrame: true })
      .then(() => new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png")))
      .then((blob) => {
        releaseCanvas(canvas);
        if (!alive || !blob) return;
        url = URL.createObjectURL(blob);
        setCropUrl(url);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // Only when entering crop mode (or the picture changes underneath it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropping, base]);

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shown || !picture || !view || cropping) return;
    let cancelled = false;
    const layout = frameLayout(shown.size, shown.frame);
    const w = Math.max(1, Math.round(layout.outer.width * view.scale));
    const h = Math.max(1, Math.round(layout.outer.height * view.scale));
    const { canvas: work, ctx } = createCanvas(w, h);
    renderEditor(ctx, shown, picture, {
      scale: view.scale,
      extraStrokes: liveStroke ? [liveStroke] : undefined,
      extraObjects: draft ? [draft] : undefined,
      selectedId: s.selected,
    })
      .then((m) => {
        if (cancelled) return;
        measured.current = { ...measured.current, ...m };
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(work, 0, 0);
      })
      .catch(() => {})
      .finally(() => releaseCanvas(work));
    return () => {
      cancelled = true;
    };
  }, [shown, picture, view, liveStroke, draft, s.selected, cropping]);

  // Keyboard: undo/redo, delete.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable=true]")) return;
      const cur = latest.current;
      if (!cur.doc) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) {
        e.preventDefault();
        const r = undoHistory(cur.doc, cur.history);
        onChange({ ...cur, doc: r.value, history: r.history, selected: null });
      } else if ((e.ctrlKey || e.metaKey) && ((k === "z" && e.shiftKey) || k === "y")) {
        e.preventDefault();
        const r = redoHistory(cur.doc, cur.history);
        onChange({ ...cur, doc: r.value, history: r.history, selected: null });
      } else if ((k === "delete" || k === "backspace") && cur.selected) {
        e.preventDefault();
        onChange(commit(cur, { ...cur.doc, objects: cur.doc.objects.filter((o) => o.id !== cur.selected) }, { selected: null }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  // Ctrl/⌘ + wheel zooms (needs a non-passive listener).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => Math.min(8, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [doc]);

  const toPicture = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const layout = frameLayout(shown!.size, shown!.frame);
      return {
        x: ((clientX - rect.left) / rect.width) * layout.outer.width - layout.inner.x,
        y: ((clientY - rect.top) / rect.height) * layout.outer.height - layout.inner.y,
      };
    },
    [shown],
  );

  if (error) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-destructive/5 p-6 text-center text-sm text-destructive">{t({ ar: "تعذّرت قراءة هذه الصورة.", en: "Couldn't read this image." })}</div>;
  }
  if (!doc || !view || !shown) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-muted">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pxPerScreen = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect && rect.width ? frameLayout(doc.size, doc.frame).outer.width / rect.width : 1;
  };

  const onDown = (e: ReactPointerEvent) => {
    if (compare) return;
    e.preventDefault();
    try {
      stageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, pan };
      gesture.current = null;
      setLiveStroke(null);
      setDraft(null);
      setOverride(null);
      return;
    }
    if (pointers.current.size > 2) return;
    const p = toPicture(e.clientX, e.clientY);
    const tool = s.tool;
    if (tool === "hand") {
      gesture.current = { kind: "pan", id: e.pointerId, sx: e.clientX, sy: e.clientY, pan };
    } else if (tool === "select") {
      const slack = 12 * pxPerScreen();
      const sel = doc.objects.find((o) => o.id === s.selected);
      if (sel) {
        const b = objectBounds(sel, measured.current[sel.id]);
        if (Math.hypot(p.x - (b.x + b.width), p.y - (b.y + b.height)) <= slack * 1.5) {
          const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
          gesture.current = { kind: "scale", id: e.pointerId, obj: sel.id, center, startDist: Math.max(1, Math.hypot(p.x - center.x, p.y - center.y)), doc };
          return;
        }
      }
      const hit = hitTest(doc.objects, p, slack, measured.current);
      if (hit) {
        if (hit !== s.selected) onChange({ ...s, selected: hit });
        gesture.current = { kind: "move", id: e.pointerId, obj: hit, start: p, doc };
      } else {
        if (s.selected) onChange({ ...s, selected: null });
        gesture.current = { kind: "pan", id: e.pointerId, sx: e.clientX, sy: e.clientY, pan };
      }
    } else if (tool === "brush" || tool === "eraser") {
      const width = pct(doc, tool === "eraser" ? s.style.widthPct * 3 : s.style.widthPct);
      setLiveStroke({ mode: tool === "eraser" ? "erase" : "draw", color: s.style.color, width, points: [p.x, p.y] });
      gesture.current = { kind: "stroke", id: e.pointerId };
    } else if (tool === "text") {
      onChange(addObject(s, newText(s, p)));
    } else if (tool === "rect" || tool === "ellipse" || tool === "line" || tool === "arrow") {
      gesture.current = { kind: "draft", id: e.pointerId, start: p };
    }
  };

  const draftFor = (start: Point, end: Point): EditorObject => {
    const width = pct(doc, s.style.widthPct);
    if (s.tool === "line" || s.tool === "arrow") return { id: "draft", type: s.tool, x1: start.x, y1: start.y, x2: end.x, y2: end.y, color: s.style.color, width };
    return {
      id: "draft",
      type: s.tool === "ellipse" ? "ellipse" : "rect",
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y),
      stroke: s.style.color,
      fill: s.style.fill === "none" ? "none" : s.style.color,
      strokeWidth: width,
    };
  };

  const onMove = (e: ReactPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      setZoom(Math.min(8, Math.max(0.25, (pinch.current.zoom * dist) / Math.max(1, pinch.current.dist))));
      setPan({ x: pinch.current.pan.x + mid.x - pinch.current.mid.x, y: pinch.current.pan.y + mid.y - pinch.current.mid.y });
      return;
    }
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const p = toPicture(e.clientX, e.clientY);
    if (g.kind === "pan") setPan({ x: g.pan.x + e.clientX - g.sx, y: g.pan.y + e.clientY - g.sy });
    else if (g.kind === "move") {
      setOverride({ ...g.doc, objects: g.doc.objects.map((o) => (o.id === g.obj ? moveObject(o, p.x - g.start.x, p.y - g.start.y) : o)) });
    } else if (g.kind === "scale") {
      const k = Math.hypot(p.x - g.center.x, p.y - g.center.y) / g.startDist;
      setOverride({ ...g.doc, objects: g.doc.objects.map((o) => (o.id === g.obj ? scaleObject(o, k) : o)) });
    } else if (g.kind === "stroke") {
      setLiveStroke((st) => (st ? { ...st, points: [...st.points, p.x, p.y] } : st));
    } else if (g.kind === "draft") {
      setDraft(draftFor(g.start, p));
    }
  };

  const onUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if ((g.kind === "move" || g.kind === "scale") && override) {
      onChange(commit({ ...s, doc: g.doc }, override));
    } else if (g.kind === "stroke" && liveStroke) {
      onChange(commit(s, { ...doc, strokes: [...doc.strokes, liveStroke] }));
    } else if (g.kind === "draft") {
      const end = toPicture(e.clientX, e.clientY);
      if (Math.hypot(end.x - g.start.x, end.y - g.start.y) > 3) onChange(addObject(s, { ...draftFor(g.start, end), id: newId() }));
    }
    setOverride(null);
    setLiveStroke(null);
    setDraft(null);
  };

  const undo = () => {
    const r = undoHistory(doc, s.history);
    onChange({ ...s, doc: r.value, history: r.history, selected: null });
  };
  const redo = () => {
    const r = redoHistory(doc, s.history);
    onChange({ ...s, doc: r.value, history: r.history, selected: null });
  };

  const ratio = ratioValue(cropRatio);
  const rect = cropRect ? clampRect(cropRect, doc.size) : centeredRect(doc.size, ratio);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-center gap-1.5" role="toolbar" aria-label={t({ ar: "أدوات المحرر", en: "Editor tools" })}>
        {TOOLS.map((x) => (
          <ToolButton key={x.tool} active={s.tool === x.tool} label={t(x.label)} testId={`tool-${x.tool}`} onClick={() => {
            setCropRect(null);
            onChange({ ...s, tool: x.tool, selected: x.tool === "select" ? s.selected : null });
          }}>
            {x.icon}
          </ToolButton>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <ToolButton label={t({ ar: "تراجع", en: "Undo" })} onClick={undo} disabled={!s.history.past.length}>
          <Undo2 />
        </ToolButton>
        <ToolButton label={t({ ar: "إعادة", en: "Redo" })} onClick={redo} disabled={!s.history.future.length}>
          <Redo2 />
        </ToolButton>
        <span className="mx-1 h-6 w-px bg-border" />
        <ToolButton label={t({ ar: "تدوير لليسار", en: "Rotate left" })} onClick={() => onChange(applyOp(s, { kind: "rotate", cw: false }))}>
          <RotateCcw />
        </ToolButton>
        <ToolButton label={t({ ar: "تدوير لليمين", en: "Rotate right" })} onClick={() => onChange(applyOp(s, { kind: "rotate", cw: true }))}>
          <RotateCw />
        </ToolButton>
        <ToolButton label={t({ ar: "قلب أفقي", en: "Flip horizontal" })} onClick={() => onChange(applyOp(s, { kind: "flip", axis: "h" }))}>
          <FlipHorizontal2 />
        </ToolButton>
        <ToolButton label={t({ ar: "قلب عمودي", en: "Flip vertical" })} onClick={() => onChange(applyOp(s, { kind: "flip", axis: "v" }))}>
          <FlipVertical2 />
        </ToolButton>
        <span className="mx-1 h-6 w-px bg-border" />
        <ToolButton label={t({ ar: "تصغير العرض", en: "Zoom out" })} onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}>
          <ZoomOut />
        </ToolButton>
        <span dir="ltr" className="w-12 text-center text-xs tabular-nums text-muted-foreground" data-testid="editor-zoom">{`${Math.round(zoom * 100)}%`}</span>
        <ToolButton label={t({ ar: "تكبير العرض", en: "Zoom in" })} onClick={() => setZoom((z) => Math.min(8, z * 1.25))}>
          <ZoomIn />
        </ToolButton>
        <ToolButton label={t({ ar: "ملاءمة الشاشة", en: "Fit to screen" })} onClick={() => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        }}>
          <Scan />
        </ToolButton>
        <ToolButton label={t({ ar: "قبل / بعد", en: "Before / after" })} active={compare} onClick={() => setCompare(!compare)}>
          <SquareSplitHorizontal />
        </ToolButton>
        <ToolButton label={t({ ar: "حذف العنصر المحدد", en: "Delete selected item" })} disabled={!s.selected} onClick={() => onChange(commit(s, { ...doc, objects: doc.objects.filter((o) => o.id !== s.selected) }, { selected: null }))}>
          <Minus />
        </ToolButton>
      </div>

      {cropping ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Segmented label={t({ ar: "نسبة القص", en: "Crop ratio" })} value={cropRatio} onChange={(r) => {
              setCropRatio(r);
              setCropRect(centeredRect(doc.size, ratioValue(r)));
            }} options={CROP_RATIOS.map((r) => ({ value: r, label: <span dir="ltr">{r === "free" ? t({ ar: "حر", en: "Free" }) : r}</span> }))} />
          </div>
          {cropUrl ? <CropBox src={cropUrl} image={doc.size} rect={rect} ratio={ratio} onChange={setCropRect} maxHeight="55vh" /> : <div className="flex h-60 items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>}
          <div className="flex justify-center gap-2">
            <Button className="h-10 rounded-xl" onClick={() => {
              setCropRect(null);
              setCropUrl(null);
              onChange({ ...applyOp(s, { kind: "crop", rect }), tool: "select" });
            }}>
              <Check />
              {t({ ar: "تطبيق القص", en: "Apply crop" })}
              <span dir="ltr" className="text-xs opacity-80">{`${rect.width}×${rect.height}`}</span>
            </Button>
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => {
              setCropRect(null);
              setCropUrl(null);
              onChange({ ...s, tool: "select" });
            }}>
              <X />
              {t({ ar: "إلغاء", en: "Cancel" })}
            </Button>
          </div>
        </div>
      ) : (
        <div
          ref={stageRef}
          dir="ltr"
          className={cn(
            "relative flex h-[55vh] min-h-72 touch-none items-center justify-center overflow-hidden rounded-xl bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px] select-none",
            s.tool === "hand" ? "cursor-grab" : s.tool === "select" ? "cursor-default" : "cursor-crosshair",
          )}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <canvas
            ref={canvasRef}
            data-testid="editor-canvas"
            role="img"
            aria-label={t({ ar: "لوحة التحرير", en: "Editing canvas" })}
            className="max-h-full max-w-full shadow-sm"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center", visibility: compare ? "hidden" : "visible" }}
          />
          {compare && file.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={file.previewUrl} alt={t({ ar: "الصورة الأصلية", en: "Original image" })} data-testid="editor-original" className="absolute inset-0 m-auto max-h-full max-w-full" />
          )}
          {compare && <span className="absolute top-2 start-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white">{t({ ar: "قبل", en: "Before" })}</span>}
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">
        {t({ ar: "إصبعان للتكبير والتحريك. Ctrl+Z للتراجع.", en: "Two fingers to zoom and pan. Ctrl+Z to undo." })}
      </p>
    </div>
  );
}

const photoEditor: ToolModule<PhotoSettings> = {
  mode: "per-file",
  defaultSettings,
  Settings,
  Preview,
  actionLabel: { ar: "حفظ الصورة", en: "Save image" },
  validate: (_files, s) => (s.doc ? null : { ar: "جارٍ تحميل الصورة…", en: "Loading the image…" }),
  async process([input], s, { signal }) {
    let doc = s.doc && s.doc.fileId === input.id ? s.doc : null;
    if (!doc) {
      const dec = await decodeImage(input.file);
      const { canvas, ctx } = createCanvas(dec.width, dec.height);
      ctx.drawImage(dec.source, 0, 0);
      dec.close();
      doc = { fileId: input.id, base: canvas, size: { width: dec.width, height: dec.height }, adjust: NEUTRAL_ADJUSTMENTS, objects: [], strokes: [], frame: { kind: "none", color: "#ffffff", sizePct: 4 } };
    }
    const canvas = await exportDoc(doc, signal);
    const background = doc.frame.kind === "rounded" ? doc.frame.color : "#ffffff";
    return [await finishCanvas(input, canvas, s.format, { suffix: "edited", quality: s.quality, background, signal })];
  },
};

export default photoEditor;
