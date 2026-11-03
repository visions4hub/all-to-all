"use client";

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { createCanvas, decodeImage } from "./lib/canvas";
import { finishCanvas } from "./lib/pipeline";
import { memeFrame, renderMeme, type ImageLayer, type LayerBox, type MemeDoc, type MemeLayout, type TextLayer } from "./lib/meme-render";
import { usePreviewBase } from "./lib/preview";
import { moveRegion } from "./lib/regions";
import { ColorField, Field, FontField, METADATA_NOTE, Note, OutputFormatFields, Section, Segmented, SliderField, SwitchField } from "./lib/ui";

export type MemeSettings = MemeDoc & {
  selected: string | null;
  format: "jpeg" | "png";
  quality: number;
};

let seq = 0;
const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

function textLayer(patch: Partial<TextLayer>): TextLayer {
  return {
    id: newId("t"),
    text: "",
    x: 0.5,
    y: 0.5,
    sizePct: 9,
    font: "impact",
    bold: true,
    color: "#ffffff",
    outlineColor: "#000000",
    outlinePct: 14,
    shadow: false,
    uppercase: true,
    widthPct: 92,
    ...patch,
  };
}

const defaultSettings: MemeSettings = {
  layout: "classic",
  barPct: 28,
  barColor: "#ffffff",
  texts: [
    textLayer({ id: "top", text: "", y: 0.1 }),
    textLayer({ id: "bottom", text: "", y: 0.9 }),
  ],
  images: [],
  selected: null,
  format: "jpeg",
  quality: 90,
};

/** Re-positions the first (top) caption for a layout, and styles it for a bar if needed. */
function applyLayout(s: MemeSettings, layout: MemeLayout): MemeSettings {
  const b = s.barPct / 100;
  const barFrac = b / (1 + b);
  const texts = s.texts.map((t, i) => {
    if (i > 1) return t;
    if (layout === "classic") return { ...t, y: i === 0 ? 0.1 : 0.9, color: "#ffffff", outlinePct: 14 };
    const inBar = (layout === "top-bar" && i === 0) || (layout === "bottom-bar" && i === 1);
    if (inBar) return { ...t, y: layout === "top-bar" ? barFrac / 2 : 1 - barFrac / 2, color: "#111111", outlinePct: 0, uppercase: false };
    return { ...t, y: layout === "top-bar" ? 0.92 : 0.08 };
  });
  return { ...s, layout, texts };
}

const EMOJI = ["😂", "🔥", "👍", "😎", "🤔", "❤️", "💯", "🎉"];

function Settings({ settings: s, onChange, disabled }: SettingsProps<MemeSettings>) {
  const t = useT();
  const fileId = useId();
  const set = (patch: Partial<MemeSettings>) => onChange({ ...s, ...patch });
  const setText = (id: string, patch: Partial<TextLayer>) => set({ texts: s.texts.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const setImage = (id: string, patch: Partial<ImageLayer>) => set({ images: s.images.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  return (
    <div className="space-y-4">
      <Field label={t({ ar: "التخطيط", en: "Layout" })}>
        <Segmented
          label={t({ ar: "التخطيط", en: "Layout" })}
          value={s.layout}
          disabled={disabled}
          onChange={(layout) => onChange(applyLayout(s, layout))}
          options={[
            { value: "classic", label: t({ ar: "نص على الصورة", en: "Text on image" }) },
            { value: "top-bar", label: t({ ar: "شريط علوي", en: "Top caption" }) },
            { value: "bottom-bar", label: t({ ar: "شريط سفلي", en: "Bottom caption" }) },
          ]}
        />
      </Field>
      {s.layout !== "classic" && (
        <>
          <SliderField label={t({ ar: "ارتفاع الشريط", en: "Caption bar height" })} value={s.barPct} min={10} max={80} disabled={disabled} onChange={(barPct) => onChange(applyLayout({ ...s, barPct }, s.layout))} format={(v) => `${v}%`} />
          <ColorField label={t({ ar: "لون الشريط", en: "Bar colour" })} value={s.barColor} disabled={disabled} onChange={(barColor) => set({ barColor })} />
        </>
      )}

      {s.texts.map((layer, i) => (
        <Section key={layer.id} title={t({ ar: `نص ${i + 1}`, en: `Text ${i + 1}` })}>
          <textarea
            dir="auto"
            rows={2}
            value={layer.text}
            disabled={disabled}
            aria-label={t({ ar: `نص ${i + 1}`, en: `Text ${i + 1}` })}
            placeholder={i === 0 ? t({ ar: "النص العلوي", en: "Top text" }) : i === 1 ? t({ ar: "النص السفلي", en: "Bottom text" }) : ""}
            onFocus={() => s.selected !== layer.id && set({ selected: layer.id })}
            onChange={(e) => setText(layer.id, { text: e.target.value })}
            className={cn("w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40", s.selected === layer.id && "border-primary")}
          />
          <FontField value={layer.font} disabled={disabled} onChange={(font) => setText(layer.id, { font })} />
          <SliderField label={t({ ar: "الحجم", en: "Size" })} value={layer.sizePct} min={2} max={30} step={0.5} disabled={disabled} onChange={(sizePct) => setText(layer.id, { sizePct })} format={(v) => `${v}%`} />
          <ColorField label={t({ ar: "لون النص", en: "Text colour" })} value={layer.color} disabled={disabled} onChange={(color) => setText(layer.id, { color })} />
          <SliderField label={t({ ar: "سماكة الحد", en: "Outline" })} value={layer.outlinePct} min={0} max={30} disabled={disabled} onChange={(outlinePct) => setText(layer.id, { outlinePct })} format={(v) => `${v}%`} />
          {layer.outlinePct > 0 && <ColorField label={t({ ar: "لون الحد", en: "Outline colour" })} value={layer.outlineColor} disabled={disabled} onChange={(outlineColor) => setText(layer.id, { outlineColor })} />}
          <SwitchField label={t({ ar: "ظل", en: "Shadow" })} checked={layer.shadow} disabled={disabled} onChange={(shadow) => setText(layer.id, { shadow })} />
          <SwitchField label={t({ ar: "أحرف كبيرة (للإنجليزية)", en: "Uppercase (Latin)" })} checked={layer.uppercase} disabled={disabled} onChange={(uppercase) => setText(layer.id, { uppercase })} />
          <Button variant="ghost" className="h-9 w-full rounded-lg text-destructive" disabled={disabled} onClick={() => set({ texts: s.texts.filter((x) => x.id !== layer.id), selected: null })}>
            <Trash2 />
            {t({ ar: "حذف هذا النص", en: "Remove this text" })}
          </Button>
        </Section>
      ))}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-10 rounded-xl" disabled={disabled} onClick={() => {
          const layer = textLayer({ text: t({ ar: "نص جديد", en: "New text" }), y: 0.5 });
          set({ texts: [...s.texts, layer], selected: layer.id });
        }}>
          <Plus />
          {t({ ar: "إضافة نص", en: "Add text" })}
        </Button>
        <label htmlFor={fileId} className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-background text-sm font-medium hover:bg-muted">
          <ImagePlus className="size-4" />
          {t({ ar: "إضافة صورة", en: "Add image" })}
        </label>
        <input
          id={fileId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          data-testid="meme-image-input"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const layer: ImageLayer = { id: newId("i"), file: f, x: 0.5, y: 0.5, widthPct: 30 };
            set({ images: [...s.images, layer], selected: layer.id });
          }}
        />
      </div>
      <Field label={t({ ar: "ملصقات", en: "Stickers" })}>
        <div className="flex flex-wrap gap-1.5">
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              disabled={disabled}
              className="size-10 rounded-lg border bg-background text-xl hover:bg-muted"
              aria-label={t({ ar: `إضافة ملصق ${e}`, en: `Add sticker ${e}` })}
              onClick={() => {
                const layer = textLayer({ text: e, font: "tahoma", sizePct: 14, outlinePct: 0, uppercase: false, x: 0.8, y: 0.5 });
                set({ texts: [...s.texts, layer], selected: layer.id });
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>
      {s.images.map((layer, i) => (
        <Section key={layer.id} title={t({ ar: `صورة مضافة ${i + 1}`, en: `Added image ${i + 1}` })}>
          <SliderField label={t({ ar: "العرض", en: "Width" })} value={layer.widthPct} min={5} max={100} disabled={disabled} onChange={(widthPct) => setImage(layer.id, { widthPct })} format={(v) => `${v}%`} />
          <Button variant="ghost" className="h-9 w-full rounded-lg text-destructive" disabled={disabled} onClick={() => set({ images: s.images.filter((x) => x.id !== layer.id), selected: null })}>
            <Trash2 />
            {t({ ar: "حذف الصورة", en: "Remove image" })}
          </Button>
        </Section>
      ))}

      <OutputFormatFields format={s.format} quality={s.quality} allowKeep={false} formats={["jpeg", "png"]} disabled={disabled} onChange={({ format, quality }) => set({ format: format as "jpeg" | "png", quality })} />
      <Note>{t({ ar: "التخطيطات أصلية وعامة؛ لا نوفّر صور ميمز محمية بحقوق النشر. استخدم صورتك أنت.", en: "Layouts are original and generic; we don't ship copyrighted meme images. Use your own picture." })}</Note>
      <Note>{t(METADATA_NOTE)}</Note>
    </div>
  );
}

function Preview({ settings: s, onChange, file }: PreviewProps<MemeSettings>) {
  const t = useT();
  const base = usePreviewBase(file, 1000);
  const ref = useRef<HTMLCanvasElement>(null);
  const [boxes, setBoxes] = useState<LayerBox[]>([]);
  const drag = useRef<{ id: number; layer: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const frame = base ? memeFrame(base.size, s) : null;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !base || !frame || !base.canvas.width) return;
    let cancelled = false;
    const { canvas: work, ctx } = createCanvas(frame.size.width, frame.size.height);
    renderMeme(ctx, base.canvas, base.size, s)
      .then((b) => {
        if (cancelled) return;
        canvas.width = work.width;
        canvas.height = work.height;
        canvas.getContext("2d")!.drawImage(work, 0, 0);
        setBoxes(b);
      })
      .catch(() => {})
      .finally(() => {
        work.width = 0;
      });
    return () => {
      cancelled = true;
    };
    // frame is derived from base and s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, s]);

  if (!base || !frame) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-muted">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const layerPos = (id: string) => s.texts.find((x) => x.id === id) ?? s.images.find((x) => x.id === id);

  const onDown = (e: ReactPointerEvent, id: string) => {
    e.preventDefault();
    try {
      stage.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const p = layerPos(id);
    if (!p) return;
    drag.current = { id: e.pointerId, layer: id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y };
    if (s.selected !== id) onChange({ ...s, selected: id });
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const box = stage.current!.getBoundingClientRect();
    const moved = moveRegion({ x: d.ox, y: d.oy, w: 0, h: 0 }, (e.clientX - d.sx) / box.width, (e.clientY - d.sy) / box.height);
    const patch = { x: moved.x, y: moved.y };
    onChange({
      ...s,
      selected: d.layer,
      texts: s.texts.map((x) => (x.id === d.layer ? { ...x, ...patch } : x)),
      images: s.images.map((x) => (x.id === d.layer ? { ...x, ...patch } : x)),
    });
  };
  const onUp = (e: ReactPointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-center">
        <div
          ref={stage}
          dir="ltr"
          className="relative touch-none overflow-hidden rounded-lg bg-muted select-none"
          style={{ aspectRatio: `${frame.size.width} / ${frame.size.height}`, width: `min(100%, calc(65vh * ${frame.size.width / frame.size.height}))` }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <canvas ref={ref} role="img" aria-label={t({ ar: "معاينة الميم", en: "Meme preview" })} className="absolute inset-0 h-full w-full" />
          {boxes.map((b) => (
            <div
              key={b.id}
              data-layer={b.id}
              onPointerDown={(e) => onDown(e, b.id)}
              className={cn("absolute cursor-move rounded border-2", s.selected === b.id ? "border-primary" : "border-transparent hover:border-white/70")}
              style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
            />
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">{t({ ar: "اسحب أي نص أو صورة لتحريكها.", en: "Drag any text or image to move it." })}</p>
    </div>
  );
}

const meme: ToolModule<MemeSettings> = {
  mode: "per-file",
  defaultSettings,
  Settings,
  Preview,
  actionLabel: { ar: "حفظ الميم", en: "Save meme" },
  validate: (_f, s) => (s.texts.some((x) => x.text.trim()) || s.images.length ? null : { ar: "أضف نصاً أو صورة", en: "Add some text or an image" }),
  async process([input], s, { signal }) {
    const picture = await decodeImage(input.file);
    try {
      const img = { width: picture.width, height: picture.height };
      const frame = memeFrame(img, s);
      const { canvas, ctx } = createCanvas(frame.size.width, frame.size.height);
      await renderMeme(ctx, picture.source, img, s);
      return [await finishCanvas(input, canvas, s.format, { suffix: "meme", quality: s.quality, signal })];
    } finally {
      picture.close();
    }
  },
};

export default meme;
