"use client";

import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { createCanvas, decodeImage, drawScaled, releaseCanvas } from "./lib/canvas";
import { CropBox } from "./lib/crop-box";
import { resolveFormat, type FormatChoice } from "./lib/format";
import { centeredRect, clampRect, computeResize, fitRectToRatio, RATIO_PRESETS, ratioValue, type RatioPreset, type Rect, type Size } from "./lib/geometry";
import { finishCanvas } from "./lib/pipeline";
import { ColorField, Field, METADATA_NOTE, Note, NumberField, OutputFormatFields, Segmented, useImageSize } from "./lib/ui";

export type CropSettings = {
  /** Crop rectangle in image pixels, for the file `fileId`; null = default for the ratio. */
  rect: Rect | null;
  fileId: string | null;
  ratio: RatioPreset;
  custom: { w: number; h: number };
  /** Optional: resize the cropped image to this width (height follows). */
  outWidth: number | null;
  format: FormatChoice;
  quality: number;
  background: string;
};

const defaultSettings: CropSettings = {
  rect: null,
  fileId: null,
  ratio: "free",
  custom: { w: 3, h: 2 },
  outWidth: null,
  format: "keep",
  quality: 92,
  background: "#ffffff",
};

/** The rectangle that will be cropped for this file and image size. */
export function effectiveRect(s: CropSettings, fileId: string, size: Size): Rect {
  const ratio = ratioValue(s.ratio, s.custom);
  if (s.rect && s.fileId === fileId) return clampRect(s.rect, size);
  return centeredRect(size, ratio);
}

const RATIO_LABELS: Record<RatioPreset, { ar: string; en: string }> = {
  free: { ar: "حر", en: "Free" },
  "1:1": { ar: "1:1", en: "1:1" },
  "4:3": { ar: "4:3", en: "4:3" },
  "3:2": { ar: "3:2", en: "3:2" },
  "4:5": { ar: "4:5", en: "4:5" },
  "9:16": { ar: "9:16", en: "9:16" },
  "16:9": { ar: "16:9", en: "16:9" },
  custom: { ar: "مخصص", en: "Custom" },
};

function Settings({ settings: s, onChange, activeFile, disabled }: SettingsProps<CropSettings>) {
  const t = useT();
  const size = useImageSize(activeFile);
  const set = (patch: Partial<CropSettings>) => onChange({ ...s, ...patch });
  const rect = size && activeFile ? effectiveRect(s, activeFile.id, size) : null;

  const setRatio = (ratio: RatioPreset, custom = s.custom) => {
    const value = ratioValue(ratio, custom);
    const next = size && rect ? fitRectToRatio(rect, value, size) : null;
    set({ ratio, custom, rect: next, fileId: activeFile?.id ?? null });
  };

  const setRect = (patch: Partial<Rect>) => {
    if (!size || !rect || !activeFile) return;
    let next = { ...rect, ...patch };
    const ratio = ratioValue(s.ratio, s.custom);
    if (ratio && patch.width !== undefined) next.height = patch.width / ratio;
    if (ratio && patch.height !== undefined) next.width = patch.height * ratio;
    next = clampRect(next, size);
    set({ rect: next, fileId: activeFile.id });
  };

  return (
    <div className="space-y-4">
      <Field label={t({ ar: "النسبة", en: "Aspect ratio" })}>
        <Segmented
          label={t({ ar: "النسبة", en: "Aspect ratio" })}
          value={s.ratio}
          columns={4}
          disabled={disabled}
          onChange={(r) => setRatio(r)}
          options={RATIO_PRESETS.map((r) => ({ value: r, label: <span dir="ltr">{t(RATIO_LABELS[r])}</span> }))}
        />
      </Field>
      {s.ratio === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t({ ar: "نسبة العرض", en: "Ratio width" })} value={s.custom.w} min={0.01} step={0.1} disabled={disabled} onChange={(w) => w && w > 0 && setRatio("custom", { ...s.custom, w })} />
          <NumberField label={t({ ar: "نسبة الارتفاع", en: "Ratio height" })} value={s.custom.h} min={0.01} step={0.1} disabled={disabled} onChange={(h) => h && h > 0 && setRatio("custom", { ...s.custom, h })} />
        </div>
      )}
      {rect && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={rect.x} min={0} suffix="px" disabled={disabled} onChange={(x) => setRect({ x: x ?? 0 })} />
          <NumberField label="Y" value={rect.y} min={0} suffix="px" disabled={disabled} onChange={(y) => setRect({ y: y ?? 0 })} />
          <NumberField label={t({ ar: "العرض", en: "Width" })} value={rect.width} min={1} suffix="px" disabled={disabled} onChange={(width) => width && setRect({ width })} />
          <NumberField label={t({ ar: "الارتفاع", en: "Height" })} value={rect.height} min={1} suffix="px" disabled={disabled} onChange={(height) => height && setRect({ height })} />
        </div>
      )}
      <NumberField
        label={t({ ar: "تغيير الحجم بعد القص — العرض (اختياري)", en: "Resize after crop — width (optional)" })}
        value={s.outWidth}
        min={1}
        suffix="px"
        placeholder={t({ ar: "بدون تغيير", en: "No change" })}
        disabled={disabled}
        onChange={(outWidth) => set({ outWidth })}
        hint={rect && s.outWidth ? <span dir="ltr">{`→ ${s.outWidth}×${Math.max(1, Math.round((s.outWidth * rect.height) / rect.width))}`}</span> : undefined}
      />
      <OutputFormatFields format={s.format} quality={s.quality} disabled={disabled} onChange={(v) => set(v)} />
      {s.format === "jpeg" && <ColorField label={t({ ar: "لون الخلفية للشفافية", en: "Background for transparency" })} value={s.background} disabled={disabled} onChange={(background) => set({ background })} />}
      <Note>{t(METADATA_NOTE)}</Note>
    </div>
  );
}

function Preview({ settings: s, onChange, file }: PreviewProps<CropSettings>) {
  const t = useT();
  const size = useImageSize(file);
  if (!size || !file.previewUrl) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-muted">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const rect = effectiveRect(s, file.id, size);
  return (
    <div className="space-y-2">
      <CropBox src={file.previewUrl} image={size} rect={rect} ratio={ratioValue(s.ratio, s.custom)} onChange={(r) => onChange({ ...s, rect: r, fileId: file.id })} />
      <p className="text-center text-xs text-muted-foreground">
        {t({ ar: "اسحب المربع أو زواياه بإصبعك أو بالفأرة.", en: "Drag the box or its handles with a finger or the mouse." })}{" "}
        <span dir="ltr" className="font-medium text-foreground" data-testid="crop-size">{`${rect.width}×${rect.height}`}</span>
      </p>
    </div>
  );
}

const crop: ToolModule<CropSettings> = {
  mode: "per-file",
  defaultSettings,
  Settings,
  Preview,
  actionLabel: { ar: "قص الصورة", en: "Crop" },
  async process([input], s, { signal }) {
    const decoded = await decodeImage(input.file);
    const size = { width: decoded.width, height: decoded.height };
    const r = effectiveRect(s, input.id, size);
    let { canvas } = createCanvas(r.width, r.height);
    try {
      canvas.getContext("2d")!.drawImage(decoded.source, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    } finally {
      decoded.close();
    }
    if (s.outWidth && s.outWidth !== r.width) {
      const target = computeResize(r, { mode: "pixels", width: s.outWidth, keepRatio: true, noUpscale: false });
      const scaled = drawScaled(canvas, r, target);
      releaseCanvas(canvas);
      canvas = scaled;
    }
    const format = resolveFormat(s.format, input.kind);
    return [
      await finishCanvas(input, canvas, format, {
        suffix: "cropped",
        quality: s.quality,
        background: s.background,
        signal,
        meta: [{ label: { ar: "منطقة القص", en: "Crop area" }, value: `${r.width}×${r.height} @ ${r.x},${r.y}` }],
      }),
    ];
  },
};

export default crop;
