"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Loader2, Pause, Play } from "lucide-react";
import { FileThumb } from "@/components/files/file-thumb";
import { Button } from "@/components/ui/button";
import { throwIfCancelled, type WorkspaceFile } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import { formatNumber } from "@/lib/files/format";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { createCanvas, decodeImage, fillBackground, getPixels, releaseCanvas } from "./lib/canvas";
import { localize } from "./lib/errors";
import { frameRect, gifOutputSize, type GifFit } from "./lib/gif";
import type { Size } from "./lib/geometry";
import type { Pixels } from "./lib/pixels";
import { runImageJob } from "./lib/worker-client";
import { ColorField, Field, Note, NumberField, Section, Segmented, SelectField, SwitchField, useImageSize } from "./lib/ui";

export type GifSettings = {
  /** Milliseconds per frame. */
  duration: number;
  timing: "same" | "per-frame";
  /** Per-frame durations by file id (used when timing is "per-frame"). */
  durations: Record<string, number>;
  /** 0 = forever, otherwise how many times it plays in total. */
  plays: number;
  sizeMode: "auto" | "custom";
  maxSide: number | null;
  width: number | null;
  height: number | null;
  fit: GifFit;
  background: string;
  transparent: boolean;
  colors: number;
  globalPalette: boolean;
  dither: boolean;
};

const defaultSettings: GifSettings = {
  duration: 500,
  timing: "same",
  durations: {},
  plays: 0,
  sizeMode: "auto",
  maxSide: 600,
  width: null,
  height: null,
  fit: "contain",
  background: "#ffffff",
  transparent: false,
  colors: 256,
  globalPalette: false,
  dither: true,
};

/** GIF stores delays in 1/100 s, and browsers slow down anything under 20 ms. */
const MIN_DELAY = 20;
const clampDelay = (ms: number) => Math.max(MIN_DELAY, Math.round(ms / 10) * 10);
const delayFor = (s: GifSettings, id: string) => clampDelay(s.timing === "per-frame" ? (s.durations[id] ?? s.duration) : s.duration);

function Settings({ settings: s, onChange, files, disabled }: SettingsProps<GifSettings>) {
  const t = useT();
  const set = (patch: Partial<GifSettings>) => onChange({ ...s, ...patch });
  const first = useImageSize(files[0]);
  const out = first ? gifOutputSize(first, s) : null;
  const total = files.reduce((n, f) => n + delayFor(s, f.id), 0);

  return (
    <div className="space-y-4">
      <Section title={t({ ar: "التوقيت", en: "Timing" })}>
        <Segmented
          label={t({ ar: "مدة الإطارات", en: "Frame timing" })}
          value={s.timing}
          disabled={disabled}
          onChange={(timing) => set({ timing })}
          options={[
            { value: "same", label: t({ ar: "مدة واحدة للكل", en: "Same for all" }) },
            { value: "per-frame", label: t({ ar: "لكل إطار", en: "Per frame" }) },
          ]}
        />
        <NumberField
          label={s.timing === "same" ? t({ ar: "مدة كل إطار", en: "Frame duration" }) : t({ ar: "المدة الافتراضية", en: "Default duration" })}
          value={s.duration}
          min={MIN_DELAY}
          step={10}
          suffix="ms"
          disabled={disabled}
          onChange={(v) => set({ duration: v ?? defaultSettings.duration })}
          hint={
            s.timing === "per-frame"
              ? t({ ar: "غيّر مدة أي إطار من قائمة الإطارات في المعاينة.", en: "Change any frame's duration in the frame list in the preview." })
              : t({ ar: "تُحفظ بدقة 10 ms، وأقل مدة 20 ms.", en: "Stored in steps of 10 ms; the minimum is 20 ms." })
          }
        />
        <p className="text-xs text-muted-foreground" data-testid="gif-total">
          {t({ ar: "المدة الكلية", en: "Total length" })}: <span dir="ltr">{formatNumber(total / 1000, 2)} s</span>
        </p>
      </Section>

      <Section title={t({ ar: "التكرار", en: "Looping" })}>
        <Segmented
          label={t({ ar: "التكرار", en: "Looping" })}
          value={s.plays === 0 ? "forever" : "count"}
          disabled={disabled}
          onChange={(v) => set({ plays: v === "forever" ? 0 : Math.max(1, s.plays || 1) })}
          options={[
            { value: "forever", label: t({ ar: "بلا توقف", en: "Forever" }) },
            { value: "count", label: t({ ar: "عدد مرات", en: "Set times" }) },
          ]}
        />
        {s.plays > 0 && (
          <NumberField
            label={t({ ar: "عدد مرات التشغيل", en: "Times to play" })}
            value={s.plays}
            min={1}
            max={65536}
            disabled={disabled}
            onChange={(v) => set({ plays: Math.max(1, Math.round(v ?? 1)) })}
            hint={t({ ar: "1 = تُعرض مرة واحدة ثم تتوقف.", en: "1 = plays once, then stops." })}
          />
        )}
      </Section>

      <Section title={t({ ar: "الأبعاد", en: "Size" })}>
        <Segmented
          label={t({ ar: "الأبعاد", en: "Size" })}
          value={s.sizeMode}
          disabled={disabled}
          onChange={(sizeMode) => set({ sizeMode, width: s.width ?? out?.width ?? null, height: s.height ?? out?.height ?? null })}
          options={[
            { value: "auto", label: t({ ar: "مثل الصورة الأولى", en: "Like first image" }) },
            { value: "custom", label: t({ ar: "مخصّصة", en: "Custom" }) },
          ]}
        />
        {s.sizeMode === "auto" ? (
          <NumberField
            label={t({ ar: "أقصى طول للضلع الأطول", en: "Max longer side" })}
            value={s.maxSide}
            min={1}
            suffix="px"
            placeholder={t({ ar: "بلا حد", en: "No limit" })}
            disabled={disabled}
            onChange={(maxSide) => set({ maxSide })}
            hint={t({ ar: "ملفات GIF الكبيرة ثقيلة جداً؛ 400–800 بكسل مناسب للمشاركة.", en: "Large GIFs get very heavy; 400–800 px is good for sharing." })}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={t({ ar: "العرض", en: "Width" })} value={s.width} min={1} suffix="px" disabled={disabled} onChange={(width) => set({ width })} />
            <NumberField label={t({ ar: "الارتفاع", en: "Height" })} value={s.height} min={1} suffix="px" disabled={disabled} onChange={(height) => set({ height })} />
          </div>
        )}
        {out && (
          <p className="text-xs text-muted-foreground" data-testid="gif-size">
            {t({ ar: "أبعاد الناتج", en: "Output size" })}: <span dir="ltr">{`${out.width}×${out.height}`}</span>
          </p>
        )}
        <Field label={t({ ar: "ملاءمة الصور المختلفة", en: "Fit images" })}>
          <Segmented
            label={t({ ar: "ملاءمة الصور المختلفة", en: "Fit images" })}
            value={s.fit}
            disabled={disabled}
            onChange={(fit) => set({ fit })}
            options={[
              { value: "contain", label: t({ ar: "احتواء", en: "Fit" }) },
              { value: "cover", label: t({ ar: "ملء وقص", en: "Fill" }) },
              { value: "stretch", label: t({ ar: "مدّ", en: "Stretch" }) },
            ]}
          />
        </Field>
        <SwitchField label={t({ ar: "خلفية شفافة", en: "Transparent background" })} checked={s.transparent} disabled={disabled} onChange={(transparent) => set({ transparent })} />
        {!s.transparent && <ColorField label={t({ ar: "لون الخلفية", en: "Background colour" })} value={s.background} disabled={disabled} onChange={(background) => set({ background })} />}
        {s.transparent && (
          <Note>
            {t({
              ar: "شفافية GIF كاملة أو معدومة: البكسلات نصف الشفافة تصبح إما شفافة أو معتمة، فقد تظهر حواف خشنة.",
              en: "GIF transparency is on/off only: semi-transparent pixels become fully transparent or opaque, so edges may look rough.",
            })}
          </Note>
        )}
      </Section>

      <Section title={t({ ar: "الجودة والألوان", en: "Quality & colours" })}>
        <SelectField
          label={t({ ar: "أقصى عدد ألوان", en: "Max colours" })}
          value={String(s.colors)}
          disabled={disabled}
          onChange={(v) => set({ colors: Number(v) })}
          options={[256, 128, 64, 32, 16, 8].map((n) => ({ value: String(n), label: String(n) }))}
        />
        <Segmented
          label={t({ ar: "لوحة الألوان", en: "Palette" })}
          value={s.globalPalette ? "global" : "local"}
          disabled={disabled}
          onChange={(v) => set({ globalPalette: v === "global" })}
          options={[
            { value: "local", label: t({ ar: "لوحة لكل إطار", en: "Per frame" }) },
            { value: "global", label: t({ ar: "لوحة واحدة", en: "One for all" }) },
          ]}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          {s.globalPalette
            ? t({ ar: "لوحة واحدة: ملف أصغر وألوان ثابتة بين الإطارات، لكن دقة أقل إن اختلفت الصور كثيراً.", en: "One palette: smaller file and steady colours, but less accurate when frames differ a lot." })
            : t({ ar: "لوحة لكل إطار: ألوان أدق لكل صورة، والملف أكبر قليلاً.", en: "Per-frame palettes: more accurate colours per image, slightly larger file." })}
        </p>
        <SwitchField
          label={t({ ar: "تنعيم التدرجات (Dithering)", en: "Dithering" })}
          checked={s.dither}
          disabled={disabled}
          onChange={(dither) => set({ dither })}
          hint={t({ ar: "يقلل التدرّج في الصور الفوتوغرافية. الصور ذات الألوان القليلة تُحفظ بألوانها الدقيقة دائماً.", en: "Reduces banding in photos. Images with few colours always keep their exact colours." })}
        />
      </Section>
    </div>
  );
}

// ---------- Preview: animation + frame list ----------

type Loaded = { id: string; bitmap: ImageBitmap | HTMLImageElement; size: Size };

/** Decodes the frames once (downscaled for preview), keyed by file id. */
function useFrames(files: WorkspaceFile[], maxSide = 800) {
  const [frames, setFrames] = useState<Map<string, Loaded>>(new Map());
  const cache = useRef(new Map<string, Loaded>());
  const key = files.map((f) => f.id).join("|");
  useEffect(() => {
    let alive = true;
    const wanted = new Set(files.map((f) => f.id));
    for (const [id, l] of cache.current) {
      if (!wanted.has(id)) {
        if ("close" in l.bitmap) l.bitmap.close();
        cache.current.delete(id);
      }
    }
    Promise.all(
      files.map(async (f) => {
        if (cache.current.has(f.id)) return;
        try {
          const d = await decodeImage(f.file);
          const size = { width: d.width, height: d.height };
          const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
          let bitmap: ImageBitmap | HTMLImageElement;
          if (typeof createImageBitmap === "function") {
            bitmap = await createImageBitmap(d.source as ImageBitmap, { resizeWidth: Math.max(1, Math.round(size.width * scale)), resizeHeight: Math.max(1, Math.round(size.height * scale)), resizeQuality: "high" });
            d.close();
          } else bitmap = d.source as HTMLImageElement;
          cache.current.set(f.id, { id: f.id, bitmap, size });
        } catch {
          // A file that can't be decoded is reported when the GIF is made.
        }
      }),
    ).then(() => alive && setFrames(new Map(cache.current)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the file list
  }, [key, maxSide]);
  useEffect(
    () => () => {
      for (const l of cache.current.values()) if ("close" in l.bitmap) l.bitmap.close();
      cache.current.clear();
    },
    [],
  );
  return frames;
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: Loaded, out: Size, s: GifSettings) {
  ctx.clearRect(0, 0, out.width, out.height);
  if (!s.transparent) fillBackground(ctx, out.width, out.height, s.background);
  // Rects are computed on the original size, then mapped onto the (downscaled) preview bitmap.
  const r = frameRect(frame.size, out, s.fit);
  const k = frame.bitmap.width / frame.size.width;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(frame.bitmap, r.sx * k, r.sy * k, r.sw * k, r.sh * k, r.dx, r.dy, r.dw, r.dh);
}

function Preview({ settings: s, onChange, files }: PreviewProps<GifSettings>) {
  const t = useT();
  const locale = useLocale();
  const frames = useFrames(files);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [index, setIndex] = useState(0);
  const first = files[0] ? frames.get(files[0].id) : undefined;
  const outFull = first ? gifOutputSize(first.size, s) : null;
  // Preview canvas: same aspect as the output, at most 600 px wide.
  const out = useMemo(() => {
    if (!outFull) return null;
    const k = Math.min(1, 600 / Math.max(outFull.width, outFull.height));
    return { width: Math.max(1, Math.round(outFull.width * k)), height: Math.max(1, Math.round(outFull.height * k)), k };
  }, [outFull?.width, outFull?.height]); // eslint-disable-line react-hooks/exhaustive-deps -- recompute only when the size changes
  const current = index < files.length ? index : 0;
  const ready = files.length > 0 && files.every((f) => frames.has(f.id));

  // Draw the current frame (scaled into the preview canvas).
  useEffect(() => {
    const canvas = canvasRef.current;
    const file = files[current];
    const frame = file && frames.get(file.id);
    if (!canvas || !out || !outFull || !frame) return;
    canvas.width = out.width;
    canvas.height = out.height;
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.scale(out.k, out.k);
    drawFrame(ctx, frame, outFull, s);
    ctx.restore();
  }, [current, files, frames, out, outFull, s]);

  // Advance with each frame's own duration.
  const plays = useRef(0);
  useEffect(() => {
    if (!playing || !ready || files.length < 2) return;
    const id = files[current]?.id;
    if (!id) return;
    const timer = setTimeout(() => {
      const next = (current + 1) % files.length;
      if (next === 0) {
        plays.current++;
        if (s.plays > 0 && plays.current >= s.plays) {
          setPlaying(false);
          plays.current = 0;
          return;
        }
      }
      setIndex(next);
    }, delayFor(s, id));
    return () => clearTimeout(timer);
  }, [playing, ready, current, files, s]);

  const step = (d: number) => {
    setPlaying(false);
    setIndex((i) => (((i < files.length ? i : 0) + d) % files.length + files.length) % files.length);
  };
  const isRtl = locale === "ar";

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        {out ? (
          <div
            dir="ltr"
            className="relative overflow-hidden rounded-lg bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
            style={{ aspectRatio: `${out.width} / ${out.height}`, width: `min(100%, calc(55vh * ${out.width / out.height}))` }}
          >
            <canvas
              ref={canvasRef}
              data-testid="gif-preview"
              data-frame={current}
              role="img"
              aria-label={t({ ar: "معاينة GIF المتحركة", en: "Animated GIF preview" })}
              className="absolute inset-0 h-full w-full"
            />
          </div>
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-muted">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label={t({ ar: "الإطار السابق", en: "Previous frame" })}>
          {isRtl ? <ChevronRight /> : <ChevronLeft />}
        </Button>
        <Button variant="outline" onClick={() => setPlaying((p) => !p)} data-testid="gif-play">
          {playing ? <Pause /> : <Play />}
          {playing ? t({ ar: "إيقاف مؤقت", en: "Pause" }) : t({ ar: "تشغيل", en: "Play" })}
        </Button>
        <Button variant="outline" size="icon" onClick={() => step(1)} aria-label={t({ ar: "الإطار التالي", en: "Next frame" })}>
          {isRtl ? <ChevronLeft /> : <ChevronRight />}
        </Button>
        <span dir="ltr" className="min-w-12 text-center text-sm tabular-nums text-muted-foreground" data-testid="gif-frame-counter">
          {files.length ? `${current + 1} / ${files.length}` : ""}
        </span>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {t({ ar: "المعاينة بالألوان الكاملة؛ ملف GIF محدود بـ 256 لوناً لكل إطار.", en: "The preview shows full colour; a GIF holds up to 256 colours per frame." })}
      </p>
      <FrameStrip settings={s} onChange={onChange} files={files} current={current} onSelect={(i) => { setPlaying(false); setIndex(i); }} />
    </div>
  );
}

/** Frame list: drag the handle (mouse or touch) or use the arrow buttons (keyboard) to reorder. */
function FrameStrip({ settings: s, onChange, files, current, onSelect }: { settings: GifSettings; onChange: (s: GifSettings) => void; files: WorkspaceFile[]; current: number; onSelect: (i: number) => void }) {
  const t = useT();
  const move = useWorkspace((st) => st.move);
  const allFiles = useWorkspace((st) => st.files);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= files.length) return;
    const a = allFiles.findIndex((f) => f.id === files[from].id);
    const b = allFiles.findIndex((f) => f.id === files[to].id);
    if (a >= 0 && b >= 0) move(a, b);
  };
  const indexAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-frame-index]");
    return el && listRef.current?.contains(el) ? Number(el.dataset.frameIndex) : null;
  };
  const onPointerDown = (i: number) => (e: ReactPointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: i, over: i });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const over = indexAt(e.clientX, e.clientY);
    if (over !== null && over !== drag.over) setDrag({ ...drag, over });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    // Drop where the pointer is released: browsers may coalesce the last pointermove away.
    if (drag) reorder(drag.from, indexAt(e.clientX, e.clientY) ?? drag.over);
    setDrag(null);
  };

  return (
    <section aria-label={t({ ar: "الإطارات", en: "Frames" })} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {t({ ar: "الإطارات", en: "Frames" })} <span className="font-normal text-muted-foreground">({formatNumber(files.length)})</span>
      </h3>
      <p className="text-xs text-muted-foreground">
        {t({ ar: "اسحب المقبض لتغيير الترتيب، أو استخدم أزرار الأسهم.", en: "Drag the handle to reorder, or use the arrow buttons." })}
      </p>
      <ol ref={listRef} className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2" data-testid="gif-frames">
        {files.map((f, i) => (
          <li
            key={f.id}
            data-frame-index={i}
            data-testid="gif-frame"
            className={cn(
              "min-w-0 space-y-1.5 rounded-xl border bg-background p-2 transition-colors",
              i === current && "border-primary",
              drag && drag.over === i && drag.from !== i && "bg-primary/10 ring-2 ring-primary",
              drag?.from === i && "opacity-60",
            )}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={t({ ar: `اسحب لنقل الإطار ${i + 1}`, en: `Drag to move frame ${i + 1}` })}
                data-testid="gif-frame-handle"
                className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
                onPointerDown={onPointerDown(i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
              >
                <GripVertical className="size-4" />
              </button>
              <span dir="ltr" className="text-xs font-semibold tabular-nums">
                {i + 1}
              </span>
              <span className="ms-auto flex">
                <Button variant="ghost" size="icon" className="size-8" disabled={i === 0} onClick={() => reorder(i, i - 1)} aria-label={t({ ar: `انقل الإطار ${i + 1} للأمام`, en: `Move frame ${i + 1} earlier` })}>
                  <ChevronLeft className="rtl:rotate-180" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8" disabled={i === files.length - 1} onClick={() => reorder(i, i + 1)} aria-label={t({ ar: `انقل الإطار ${i + 1} للخلف`, en: `Move frame ${i + 1} later` })}>
                  <ChevronRight className="rtl:rotate-180" />
                </Button>
              </span>
            </div>
            <button type="button" className="block w-full" onClick={() => onSelect(i)} aria-label={t({ ar: `اعرض الإطار ${i + 1}`, en: `Show frame ${i + 1}` })}>
              <FileThumb file={f} fit="contain" className="aspect-[4/3] w-full rounded-lg" />
            </button>
            <p dir="auto" className="truncate text-xs" title={f.name}>
              {f.name}
            </p>
            {s.timing === "per-frame" ? (
              <label className="flex items-center gap-1 text-xs">
                <span className="sr-only">{t({ ar: `مدة الإطار ${i + 1}`, en: `Frame ${i + 1} duration` })}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  dir="ltr"
                  min={MIN_DELAY}
                  step={10}
                  data-testid="gif-frame-duration"
                  value={s.durations[f.id] ?? s.duration}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && e.target.value !== "") onChange({ ...s, durations: { ...s.durations, [f.id]: v } });
                  }}
                  className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <span className="text-muted-foreground">ms</span>
              </label>
            ) : (
              <p dir="ltr" className="text-end text-xs text-muted-foreground">
                {delayFor(s, f.id)} ms
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------- Export ----------

const gif: ToolModule<GifSettings> = {
  mode: "batch",
  defaultSettings,
  Settings,
  Preview,
  actionLabel: { ar: "إنشاء GIF", en: "Make GIF" },
  validate: (files) => (files.length < 2 ? { ar: "أضف صورتين على الأقل", en: "Add at least two images" } : null),
  async process(inputs, s, { signal, onProgress }) {
    const frames: Pixels[] = [];
    let out: Size | null = null;
    const total = inputs.length + 1;
    for (const [i, input] of inputs.entries()) {
      throwIfCancelled(signal);
      onProgress({ done: i, total, label: input.name });
      const d = await decodeImage(input.file);
      try {
        const src = { width: d.width, height: d.height };
        out ??= gifOutputSize(src, s);
        const { canvas, ctx } = createCanvas(out.width, out.height);
        try {
          if (!s.transparent) fillBackground(ctx, out.width, out.height, s.background);
          const r = frameRect(src, out, s.fit);
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(d.source, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
          frames.push(getPixels(canvas));
        } finally {
          releaseCanvas(canvas);
        }
      } finally {
        d.close();
      }
    }
    onProgress({ done: inputs.length, total, label: localize({ ar: "ترميز GIF…", en: "Encoding GIF…" }) });
    const delays = inputs.map((i) => delayFor(s, i.id));
    const result = await runImageJob(
      { op: "gif", frames, delays, plays: s.plays, colors: s.colors, globalPalette: s.globalPalette, dither: s.dither, transparent: s.transparent },
      signal,
    );
    if (result.op !== "gif") throw new Error("Unexpected worker result");
    const size = out!;
    const seconds = delays.reduce((n, d) => n + d, 0) / 1000;
    return [
      {
        name: buildOutputName(inputs[0].name, { suffix: "animated", ext: "gif" }),
        blob: new Blob([result.bytes as BlobPart], { type: "image/gif" }),
        sourceIds: inputs.map((i) => i.id),
        meta: [
          { label: { ar: "الإطارات", en: "Frames" }, value: inputs.length },
          { label: { ar: "الأبعاد", en: "Size" }, value: `${size.width}×${size.height}` },
          { label: { ar: "المدة", en: "Length" }, value: `${formatNumber(seconds, 2)} s` },
          { label: { ar: "التكرار", en: "Looping" }, value: s.plays === 0 ? localize({ ar: "بلا توقف", en: "forever" }) : localize({ ar: `${s.plays} مرة`, en: `${s.plays}×` }) },
        ],
      },
    ];
  },
};

export default gif;
