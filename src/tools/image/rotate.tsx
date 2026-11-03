"use client";

import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { createCanvas, decodeImage } from "./lib/canvas";
import { FORMAT_INFO, resolveFormat, type FormatChoice } from "./lib/format";
import { rotatedBounds } from "./lib/geometry";
import { finishCanvas } from "./lib/pipeline";
import { ColorField, Field, METADATA_NOTE, Note, OutputFormatFields, SliderField, SwitchField } from "./lib/ui";

export type RotateSettings = {
  /** Quarter turns clockwise: 0, 90, 180, 270. */
  quarter: number;
  /** Extra free rotation in degrees, -45…45. */
  fine: number;
  flipH: boolean;
  flipV: boolean;
  /** Corners revealed by a free rotation: transparent (PNG/WebP) or this colour. */
  transparent: boolean;
  background: string;
  format: FormatChoice;
  quality: number;
};

const defaultSettings: RotateSettings = {
  quarter: 90,
  fine: 0,
  flipH: false,
  flipV: false,
  transparent: true,
  background: "#ffffff",
  format: "keep",
  quality: 92,
};

const total = (s: RotateSettings) => (((s.quarter + s.fine) % 360) + 360) % 360;

function Settings({ settings: s, onChange, files, disabled }: SettingsProps<RotateSettings>) {
  const t = useT();
  const set = (patch: Partial<RotateSettings>) => onChange({ ...s, ...patch });
  const anyJpeg = files.some((f) => resolveFormat(s.format, f.kind) === "jpeg");
  return (
    <div className="space-y-4">
      <Field label={t({ ar: "التدوير", en: "Rotate" })}>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 rounded-xl" disabled={disabled} onClick={() => set({ quarter: (s.quarter + 270) % 360 })}>
            <RotateCcw />
            {t({ ar: "عكس عقارب الساعة", en: "Left 90°" })}
          </Button>
          <Button variant="outline" className="h-11 rounded-xl" disabled={disabled} onClick={() => set({ quarter: (s.quarter + 90) % 360 })}>
            <RotateCw />
            {t({ ar: "مع عقارب الساعة", en: "Right 90°" })}
          </Button>
        </div>
      </Field>
      <SliderField
        label={t({ ar: "تدوير دقيق", en: "Fine rotation" })}
        value={s.fine}
        min={-45}
        max={45}
        step={0.5}
        disabled={disabled}
        onChange={(fine) => set({ fine })}
        format={(v) => `${v}°`}
      />
      <p className="text-sm">
        {t({ ar: "الزاوية الكلية", en: "Total angle" })}: <span dir="ltr" className="font-semibold" data-testid="rotate-total">{`${total(s)}°`}</span>
      </p>
      <Field label={t({ ar: "القلب", en: "Flip" })}>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={s.flipH ? "secondary" : "outline"} aria-pressed={s.flipH} className="h-11 rounded-xl" disabled={disabled} onClick={() => set({ flipH: !s.flipH })}>
            <FlipHorizontal2 />
            {t({ ar: "أفقي", en: "Horizontal" })}
          </Button>
          <Button variant={s.flipV ? "secondary" : "outline"} aria-pressed={s.flipV} className="h-11 rounded-xl" disabled={disabled} onClick={() => set({ flipV: !s.flipV })}>
            <FlipVertical2 />
            {t({ ar: "عمودي", en: "Vertical" })}
          </Button>
        </div>
      </Field>
      {s.fine !== 0 && (
        <>
          <SwitchField
            label={t({ ar: "زوايا شفافة", en: "Transparent corners" })}
            checked={s.transparent}
            disabled={disabled}
            onChange={(transparent) => set({ transparent })}
            hint={t({ ar: "التدوير الحر يكشف زوايا فارغة. JPG لا يدعم الشفافية فيُملأ باللون.", en: "Free rotation reveals empty corners. JPG has no transparency, so it uses the colour." })}
          />
          {(!s.transparent || anyJpeg) && <ColorField label={t({ ar: "لون الزوايا", en: "Corner colour" })} value={s.background} disabled={disabled} onChange={(background) => set({ background })} />}
        </>
      )}
      <OutputFormatFields format={s.format} quality={s.quality} disabled={disabled} onChange={(v) => set(v)} />
      <Note>
        {t({
          ar: "اتجاه صور الكاميرا (EXIF) يُصحَّح تلقائياً: تُحفظ البكسلات بالاتجاه الصحيح فتظهر الصورة معتدلة في كل التطبيقات.",
          en: "Camera orientation (EXIF) is corrected automatically: pixels are saved upright, so the image looks right in every app.",
        })}
      </Note>
      <Note>{t(METADATA_NOTE)}</Note>
    </div>
  );
}

function Preview({ settings: s, file }: PreviewProps<RotateSettings>) {
  const t = useT();
  return (
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-muted" aria-label={t({ ar: "معاينة التدوير", en: "Rotation preview" })}>
      {file.previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL
        <img
          src={file.previewUrl}
          alt=""
          className="max-h-[70%] max-w-[70%] object-contain transition-transform duration-300"
          style={{ transform: `rotate(${s.quarter + s.fine}deg) scale(${s.flipH ? -1 : 1}, ${s.flipV ? -1 : 1})` }}
        />
      )}
    </div>
  );
}

const rotate: ToolModule<RotateSettings> = {
  mode: "per-file",
  defaultSettings,
  Settings,
  Preview,
  actionLabel: { ar: "تدوير وحفظ", en: "Rotate & save" },
  async process([input], s, { signal }) {
    const format = resolveFormat(s.format, input.kind);
    const decoded = await decodeImage(input.file);
    const angle = total(s);
    const size = rotatedBounds({ width: decoded.width, height: decoded.height }, angle);
    const { canvas, ctx } = createCanvas(size.width, size.height);
    try {
      if (s.fine !== 0 && (!s.transparent || !FORMAT_INFO[format].alpha)) {
        ctx.fillStyle = s.background;
        ctx.fillRect(0, 0, size.width, size.height);
      }
      ctx.translate(size.width / 2, size.height / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.scale(s.flipH ? -1 : 1, s.flipV ? -1 : 1);
      ctx.drawImage(decoded.source, -decoded.width / 2, -decoded.height / 2);
    } finally {
      decoded.close();
    }
    const suffix = [angle ? `rotated-${angle}` : "", s.flipH ? "flipH" : "", s.flipV ? "flipV" : ""].filter(Boolean).join("-") || "upright";
    return [await finishCanvas(input, canvas, format, { suffix, quality: s.quality, background: s.background, signal })];
  },
};

export default rotate;
