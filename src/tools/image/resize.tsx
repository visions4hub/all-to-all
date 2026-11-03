"use client";

import { Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/files/format";
import { useT } from "@/lib/i18n";
import type { SettingsProps, ToolModule } from "@/tools/types";
import { resolveFormat, type FormatChoice } from "./lib/format";
import { computeResize, type ResizeMode, type Size } from "./lib/geometry";
import { finishCanvas, loadToCanvas } from "./lib/pipeline";
import { ColorField, METADATA_NOTE, Note, NumberField, OutputFormatFields, Segmented, SwitchField, useImageSize } from "./lib/ui";

export type ResizeSettings = {
  mode: ResizeMode;
  width: number | null;
  height: number | null;
  keepRatio: boolean;
  percent: number;
  maxWidth: number | null;
  maxHeight: number | null;
  noUpscale: boolean;
  format: FormatChoice;
  quality: number;
  background: string;
};

const defaultSettings: ResizeSettings = {
  mode: "pixels",
  width: null,
  height: null,
  keepRatio: true,
  percent: 50,
  maxWidth: 1920,
  maxHeight: 1920,
  noUpscale: false,
  format: "keep",
  quality: 90,
  background: "#ffffff",
};

function Settings({ settings: s, onChange, files, activeFile, disabled }: SettingsProps<ResizeSettings>) {
  const t = useT();
  const size = useImageSize(activeFile);
  const set = (patch: Partial<ResizeSettings>) => onChange({ ...s, ...patch });
  const out = size ? computeResize(size, s) : null;

  // With the ratio locked, typing one side fills in the other from the previewed image.
  const setWidth = (width: number | null) => {
    if (s.keepRatio && size && width) set({ width, height: Math.max(1, Math.round((width * size.height) / size.width)) });
    else set({ width });
  };
  const setHeight = (height: number | null) => {
    if (s.keepRatio && size && height) set({ height, width: Math.max(1, Math.round((height * size.width) / size.height)) });
    else set({ height });
  };

  return (
    <div className="space-y-4">
      <Segmented
        label={t({ ar: "طريقة تغيير الحجم", en: "Resize by" })}
        value={s.mode}
        disabled={disabled}
        onChange={(mode) => set({ mode })}
        options={[
          { value: "pixels", label: t({ ar: "بكسل", en: "Pixels" }) },
          { value: "percent", label: t({ ar: "نسبة %", en: "Percent" }) },
          { value: "max", label: t({ ar: "حد أقصى", en: "Max size" }) },
        ]}
      />

      {s.mode === "pixels" && (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <NumberField label={t({ ar: "العرض", en: "Width" })} value={s.width} min={1} suffix="px" disabled={disabled} onChange={setWidth} placeholder={size ? String(size.width) : ""} />
          </div>
          <Button
            type="button"
            variant={s.keepRatio ? "secondary" : "outline"}
            size="icon-lg"
            className="mb-0.5 h-10 rounded-lg"
            aria-pressed={s.keepRatio}
            aria-label={t({ ar: "الحفاظ على النسبة", en: "Keep aspect ratio" })}
            title={t({ ar: "الحفاظ على النسبة", en: "Keep aspect ratio" })}
            disabled={disabled}
            onClick={() => set({ keepRatio: !s.keepRatio })}
          >
            {s.keepRatio ? <Link2 /> : <Link2Off />}
          </Button>
          <div className="min-w-0 flex-1">
            <NumberField label={t({ ar: "الارتفاع", en: "Height" })} value={s.height} min={1} suffix="px" disabled={disabled} onChange={setHeight} placeholder={size ? String(size.height) : ""} />
          </div>
        </div>
      )}
      {s.mode === "pixels" && s.keepRatio && files.length > 1 && (
        <Note>{t({ ar: "مع قفل النسبة، تُصغَّر كل صورة لتتسع داخل هذا العرض والارتفاع دون تشويه.", en: "With the ratio locked, each image fits inside this width and height without distortion." })}</Note>
      )}

      {s.mode === "percent" && (
        <NumberField label={t({ ar: "النسبة المئوية", en: "Percentage" })} value={s.percent} min={1} max={1000} suffix="%" disabled={disabled} onChange={(percent) => set({ percent: percent ?? 100 })} />
      )}

      {s.mode === "max" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t({ ar: "أقصى عرض", en: "Max width" })} value={s.maxWidth} min={1} suffix="px" disabled={disabled} onChange={(maxWidth) => set({ maxWidth })} />
          <NumberField label={t({ ar: "أقصى ارتفاع", en: "Max height" })} value={s.maxHeight} min={1} suffix="px" disabled={disabled} onChange={(maxHeight) => set({ maxHeight })} />
        </div>
      )}

      {s.mode !== "max" && (
        <SwitchField label={t({ ar: "عدم التكبير أبداً", en: "Never enlarge" })} checked={s.noUpscale} disabled={disabled} onChange={(noUpscale) => set({ noUpscale })} />
      )}

      {size && out && (
        <p className="rounded-lg bg-brand-soft p-2.5 text-sm" data-testid="resize-preview">
          {t({ ar: "الناتج", en: "Result" })}:{" "}
          <span dir="ltr" className="font-semibold">
            {`${size.width}×${size.height} → ${out.width}×${out.height}`}
          </span>
          {files.length > 1 && <span className="ms-1 text-xs text-muted-foreground">{t({ ar: `(للصورة المعروضة من ${formatNumber(files.length)})`, en: `(previewed image of ${formatNumber(files.length)})` })}</span>}
        </p>
      )}

      <OutputFormatFields format={s.format} quality={s.quality} disabled={disabled} onChange={(v) => set(v)} />
      {s.format === "jpeg" && <ColorField label={t({ ar: "لون الخلفية للشفافية", en: "Background for transparency" })} value={s.background} disabled={disabled} onChange={(background) => set({ background })} />}
      <Note>{t(METADATA_NOTE)}</Note>
    </div>
  );
}

const resize: ToolModule<ResizeSettings> = {
  mode: "per-file",
  defaultSettings,
  Settings,
  actionLabel: { ar: "تغيير الحجم", en: "Resize" },
  validate: (_files, s) =>
    s.mode === "pixels" && !s.width && !s.height
      ? { ar: "أدخل العرض أو الارتفاع", en: "Enter a width or a height" }
      : s.mode === "max" && !s.maxWidth && !s.maxHeight
        ? { ar: "أدخل أقصى عرض أو ارتفاع", en: "Enter a max width or height" }
        : null,
  async process([input], s, { signal }) {
    const { canvas } = await loadToCanvas(input, (src: Size) => computeResize(src, s));
    const size = { width: canvas.width, height: canvas.height };
    const format = resolveFormat(s.format, input.kind);
    return [await finishCanvas(input, canvas, format, { suffix: `${size.width}x${size.height}`, quality: s.quality, background: s.background, signal })];
  },
};

export default resize;
