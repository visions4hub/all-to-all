"use client";

import { useCallback, useId } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { decodeImage, releaseCanvas, type Decoded } from "./lib/canvas";
import { resolveFormat, type FormatChoice } from "./lib/format";
import { ANCHORS, type Anchor } from "./lib/layout";
import { finishCanvas, loadToCanvas } from "./lib/pipeline";
import { PreviewCanvas, useDecoded, usePreviewBase } from "./lib/preview";
import { ColorField, Field, FontField, METADATA_NOTE, Note, OutputFormatFields, Section, SliderField, SwitchField, useObjectUrl } from "./lib/ui";
import { buildStamp, drawWatermark, type WatermarkStyle } from "./lib/watermark-render";

export type WatermarkSettings = WatermarkStyle & {
  logo: File | null;
  format: FormatChoice;
  quality: number;
};

const defaultSettings: WatermarkSettings = {
  useText: true,
  text: "© جميع الحقوق محفوظة",
  font: "plex",
  bold: true,
  sizePct: 6,
  color: "#ffffff",
  outline: true,
  useLogo: false,
  logo: null,
  logoPct: 18,
  opacity: 70,
  rotation: 0,
  anchor: "br",
  marginPct: 3,
  tiled: false,
  gapPct: 12,
  format: "keep",
  quality: 92,
};

const ANCHOR_LABELS: Record<Anchor, { ar: string; en: string }> = {
  tl: { ar: "أعلى اليسار", en: "Top left" },
  tc: { ar: "أعلى الوسط", en: "Top centre" },
  tr: { ar: "أعلى اليمين", en: "Top right" },
  ml: { ar: "وسط اليسار", en: "Middle left" },
  c: { ar: "الوسط", en: "Centre" },
  mr: { ar: "وسط اليمين", en: "Middle right" },
  bl: { ar: "أسفل اليسار", en: "Bottom left" },
  bc: { ar: "أسفل الوسط", en: "Bottom centre" },
  br: { ar: "أسفل اليمين", en: "Bottom right" },
};

function LogoPicker({ logo, onChange, disabled }: { logo: File | null; onChange: (f: File | null) => void; disabled?: boolean }) {
  const t = useT();
  const id = useId();
  const url = useObjectUrl(logo);
  return (
    <div className="flex items-center gap-2">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL
        <img src={url} alt="" className="size-12 rounded-lg border bg-muted object-contain" />
      )}
      <label htmlFor={id} className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border bg-background text-sm font-medium hover:bg-muted">
        <ImagePlus className="size-4" />
        {logo ? t({ ar: "تغيير الشعار", en: "Change logo" }) : t({ ar: "اختر صورة الشعار", en: "Choose logo image" })}
      </label>
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        disabled={disabled}
        data-testid="logo-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
          e.target.value = "";
        }}
      />
      {logo && (
        <Button variant="ghost" size="icon-lg" aria-label={t({ ar: "إزالة الشعار", en: "Remove logo" })} onClick={() => onChange(null)} disabled={disabled}>
          <X />
        </Button>
      )}
    </div>
  );
}

function Settings({ settings: s, onChange, disabled }: SettingsProps<WatermarkSettings>) {
  const t = useT();
  const set = (patch: Partial<WatermarkSettings>) => onChange({ ...s, ...patch });
  return (
    <div className="space-y-4">
      <Section title={t({ ar: "النص", en: "Text" })}>
        <SwitchField label={t({ ar: "إضافة نص", en: "Add text" })} checked={s.useText} disabled={disabled} onChange={(useText) => set({ useText })} />
        {s.useText && (
          <>
            <Field label={t({ ar: "نص العلامة", en: "Watermark text" })}>
              <textarea
                dir="auto"
                rows={2}
                value={s.text}
                disabled={disabled}
                onChange={(e) => set({ text: e.target.value })}
                aria-label={t({ ar: "نص العلامة", en: "Watermark text" })}
                className="w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </Field>
            <FontField value={s.font} onChange={(font) => set({ font })} disabled={disabled} />
            <SwitchField label={t({ ar: "خط عريض", en: "Bold" })} checked={s.bold} disabled={disabled} onChange={(bold) => set({ bold })} />
            <SliderField label={t({ ar: "حجم النص", en: "Text size" })} value={s.sizePct} min={1} max={30} step={0.5} disabled={disabled} onChange={(sizePct) => set({ sizePct })} format={(v) => `${v}%`} />
            <ColorField label={t({ ar: "اللون", en: "Colour" })} value={s.color} disabled={disabled} onChange={(color) => set({ color })} />
            <SwitchField label={t({ ar: "حدّ حول النص للوضوح", en: "Outline for legibility" })} checked={s.outline} disabled={disabled} onChange={(outline) => set({ outline })} />
          </>
        )}
      </Section>

      <Section title={t({ ar: "الشعار", en: "Logo" })}>
        <SwitchField label={t({ ar: "إضافة شعار", en: "Add logo" })} checked={s.useLogo} disabled={disabled} onChange={(useLogo) => set({ useLogo })} />
        {s.useLogo && (
          <>
            <LogoPicker logo={s.logo} disabled={disabled} onChange={(logo) => set({ logo })} />
            <SliderField label={t({ ar: "عرض الشعار", en: "Logo width" })} value={s.logoPct} min={2} max={80} disabled={disabled} onChange={(logoPct) => set({ logoPct })} format={(v) => `${v}%`} />
          </>
        )}
      </Section>

      <Section title={t({ ar: "المظهر والموضع", en: "Look & position" })}>
        <SliderField label={t({ ar: "الشفافية (العتامة)", en: "Opacity" })} value={s.opacity} min={5} max={100} disabled={disabled} onChange={(opacity) => set({ opacity })} format={(v) => `${v}%`} />
        <SliderField label={t({ ar: "الدوران", en: "Rotation" })} value={s.rotation} min={-90} max={90} disabled={disabled} onChange={(rotation) => set({ rotation })} format={(v) => `${v}°`} />
        <SwitchField label={t({ ar: "تكرار على كامل الصورة", en: "Tile across the image" })} checked={s.tiled} disabled={disabled} onChange={(tiled) => set({ tiled })} />
        {s.tiled ? (
          <SliderField label={t({ ar: "المسافة بين التكرارات", en: "Space between tiles" })} value={s.gapPct} min={0} max={50} disabled={disabled} onChange={(gapPct) => set({ gapPct })} format={(v) => `${v}%`} />
        ) : (
          <>
            <Field label={t({ ar: "الموضع", en: "Position" })}>
              {/* Physical layout: the grid matches the image whatever the UI direction. */}
              <div dir="ltr" role="radiogroup" aria-label={t({ ar: "الموضع", en: "Position" })} className="mx-auto grid w-36 grid-cols-3 gap-1.5">
                {ANCHORS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="radio"
                    aria-checked={s.anchor === a}
                    aria-label={t(ANCHOR_LABELS[a])}
                    title={t(ANCHOR_LABELS[a])}
                    disabled={disabled}
                    onClick={() => set({ anchor: a })}
                    className={`aspect-square rounded-lg border-2 transition-colors ${s.anchor === a ? "border-primary bg-primary" : "border-border bg-muted hover:border-primary/50"}`}
                  />
                ))}
              </div>
            </Field>
            <SliderField label={t({ ar: "الهامش من الحواف", en: "Margin from edges" })} value={s.marginPct} min={0} max={20} step={0.5} disabled={disabled} onChange={(marginPct) => set({ marginPct })} format={(v) => `${v}%`} />
          </>
        )}
      </Section>

      <OutputFormatFields format={s.format} quality={s.quality} disabled={disabled} onChange={(v) => set(v)} />
      <Note>{t({ ar: "تُطبَّق الإعدادات نفسها على كل الصور بنسب مناسبة لحجم كل صورة.", en: "The same settings apply to every image, scaled to each image's size." })}</Note>
      <Note>{t(METADATA_NOTE)}</Note>
    </div>
  );
}

function Preview({ settings: s, file }: PreviewProps<WatermarkSettings>) {
  const t = useT();
  const base = usePreviewBase(file);
  const logo = useDecoded(s.useLogo ? s.logo : null);
  const draw = useCallback(
    async (ctx: CanvasRenderingContext2D, b: { size: { width: number; height: number } }) => {
      const stamp = await buildStamp(b.size, s, logo);
      if (!stamp) return;
      drawWatermark(ctx, b.size, stamp, s);
      releaseCanvas(stamp);
    },
    [s, logo],
  );
  return <PreviewCanvas base={base} draw={draw} label={t({ ar: "معاينة العلامة المائية", en: "Watermark preview" })} />;
}

const logoCache = new WeakMap<File, Promise<Decoded>>();

const watermark: ToolModule<WatermarkSettings> = {
  mode: "per-file",
  defaultSettings,
  Settings,
  Preview,
  actionLabel: { ar: "إضافة العلامة", en: "Add watermark" },
  validate: (_files, s) => {
    const hasText = s.useText && s.text.trim().length > 0;
    const hasLogo = s.useLogo && !!s.logo;
    if (!hasText && !hasLogo) return { ar: "اكتب نصاً أو اختر شعاراً", en: "Enter text or choose a logo" };
    return null;
  },
  async process([input], s, { signal }) {
    let logo: Decoded | null = null;
    if (s.useLogo && s.logo) {
      let p = logoCache.get(s.logo);
      if (!p) {
        p = decodeImage(s.logo);
        logoCache.set(s.logo, p);
      }
      logo = await p;
    }
    const { canvas, ctx, src } = await loadToCanvas(input);
    const stamp = await buildStamp(src, s, logo);
    if (stamp) {
      drawWatermark(ctx, src, stamp, s);
      releaseCanvas(stamp);
    }
    return [await finishCanvas(input, canvas, resolveFormat(s.format, input.kind), { suffix: "watermarked", quality: s.quality, signal })];
  },
};

export default watermark;
