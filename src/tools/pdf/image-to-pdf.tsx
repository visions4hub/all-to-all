"use client";

import { useEffect, useId } from "react";
import { readImageSize } from "@/lib/files/image-info";
import { useT } from "@/lib/i18n";
import { useWorkspace } from "@/stores/workspace";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { Field, Note, NumberField, Segmented, SelectField } from "./lib/controls";
import { mmToPt } from "./lib/geometry";
import { bitmapToPng } from "./lib/image-input";
import {
  CUSTOM_MAX_MM,
  CUSTOM_MIN_MM,
  DEFAULT_IMAGE_TO_PDF,
  fromUnit,
  imagesToPdf,
  MM_PER_UNIT,
  PAGE_PRESETS,
  pageSizeFor,
  placeImage,
  toUnit,
  UNIT_DECIMALS,
  type ImageLoader,
  type ImageToPdfSettings,
  type LengthUnit,
  type PageSizeName,
  type PresetName,
} from "./lib/images-to-pdf";

const round = (v: number, decimals: number) => Math.round(v * 10 ** decimals) / 10 ** decimals;
/** "21 × 29.7 cm" — sizes in the list are shown in centimetres (Latin digits). */
const cmLabel = (w: number, h: number) => `${round(w / 10, 1)} × ${round(h / 10, 1)}`;

const UNIT_LABELS: Record<LengthUnit, { ar: string; en: string }> = {
  mm: { ar: "ملم", en: "mm" },
  cm: { ar: "سم", en: "cm" },
  in: { ar: "إنج", en: "in" },
  px: { ar: "بكسل", en: "px" },
};

/** Custom page size typed in the unit the user picks; stored in millimetres. */
function CustomSize({
  settings: s,
  set,
  disabled,
  ids,
}: {
  settings: ImageToPdfSettings;
  set: (patch: Partial<ImageToPdfSettings>) => void;
  disabled: boolean;
  ids: { w: string; h: string };
}) {
  const t = useT();
  // A setting from an imported workflow may hold anything; fall back to millimetres.
  const unit: LengthUnit = s.customUnit in MM_PER_UNIT ? s.customUnit : "mm";
  const d = UNIT_DECIMALS[unit];
  const min = Math.ceil(toUnit(CUSTOM_MIN_MM, unit) * 10 ** d) / 10 ** d;
  const max = Math.floor(toUnit(CUSTOM_MAX_MM, unit) * 10 ** d) / 10 ** d;
  const step = d === 0 ? 1 : 1 / 10 ** Math.min(d, 1);
  const suffix = t(UNIT_LABELS[unit]);
  return (
    <div className="space-y-3">
      <Field label={t({ ar: "الوحدة", en: "Unit" })}>
        <Segmented
          label={t({ ar: "الوحدة", en: "Unit" })}
          value={unit}
          disabled={disabled}
          onChange={(customUnit) => set({ customUnit })}
          options={(Object.keys(MM_PER_UNIT) as LengthUnit[]).map((u) => ({ value: u, label: t(UNIT_LABELS[u]) }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t({ ar: "العرض", en: "Width" })} htmlFor={ids.w}>
          <NumberField
            id={ids.w}
            value={round(toUnit(s.customWidth, unit), d)}
            min={min}
            max={max}
            step={step}
            integer={unit === "px"}
            suffix={suffix}
            disabled={disabled}
            onChange={(v) => set({ customWidth: fromUnit(v, unit) })}
          />
        </Field>
        <Field label={t({ ar: "الارتفاع", en: "Height" })} htmlFor={ids.h}>
          <NumberField
            id={ids.h}
            value={round(toUnit(s.customHeight, unit), d)}
            min={min}
            max={max}
            step={step}
            integer={unit === "px"}
            suffix={suffix}
            disabled={disabled}
            onChange={(v) => set({ customHeight: fromUnit(v, unit) })}
          />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        {t({
          ar: `المسموح: من ${min} إلى ${max} ${suffix}.${unit === "px" ? " البكسل هنا 96 لكل إنج." : ""}`,
          en: `Allowed: ${min} to ${max} ${suffix}.${unit === "px" ? " Pixels here are 96 per inch." : ""}`,
        })}
      </p>
    </div>
  );
}

function Settings({ settings: s, onChange, files, disabled }: SettingsProps<ImageToPdfSettings>) {
  const t = useT();
  const ids = { size: useId(), w: useId(), h: useId(), margin: useId() };
  const set = (patch: Partial<ImageToPdfSettings>) => onChange({ ...s, ...patch });
  return (
    <div className="space-y-4">
      <Field label={t({ ar: "الناتج", en: "Output" })}>
        <Segmented
          label={t({ ar: "الناتج", en: "Output" })}
          value={s.output}
          disabled={disabled}
          onChange={(output) => set({ output })}
          options={[
            { value: "single", label: t({ ar: "ملف PDF واحد", en: "One PDF" }) },
            { value: "separate", label: t({ ar: "ملف لكل صورة", en: "One per image" }) },
          ]}
        />
      </Field>
      <Field label={t({ ar: "حجم الصفحة", en: "Page size" })} htmlFor={ids.size}>
        <SelectField
          id={ids.size}
          value={s.pageSize}
          disabled={disabled}
          onChange={(pageSize) => set({ pageSize })}
          options={[
            ...(Object.entries(PAGE_PRESETS) as [PresetName, (typeof PAGE_PRESETS)[PresetName]][]).map(([value, p]) => ({
              value: value as PageSizeName,
              label: `${p.label} · ${cmLabel(p.w, p.h)} ${t({ ar: "سم", en: "cm" })}`,
            })),
            { value: "original" as PageSizeName, label: t({ ar: "بحجم الصورة", en: "Same as image" }) },
            { value: "custom" as PageSizeName, label: t({ ar: "مقاس مخصص…", en: "Custom size…" }) },
          ]}
        />
      </Field>
      {s.pageSize === "custom" && <CustomSize settings={s} set={set} disabled={disabled} ids={ids} />}
      {s.pageSize !== "original" && (
        <Field label={t({ ar: "الاتجاه", en: "Orientation" })}>
          <Segmented
            label={t({ ar: "الاتجاه", en: "Orientation" })}
            value={s.orientation}
            disabled={disabled}
            onChange={(orientation) => set({ orientation })}
            options={[
              { value: "auto", label: t({ ar: "تلقائي", en: "Auto" }) },
              { value: "portrait", label: t({ ar: "عمودي", en: "Portrait" }) },
              { value: "landscape", label: t({ ar: "أفقي", en: "Landscape" }) },
            ]}
          />
        </Field>
      )}
      <Field label={t({ ar: "ملاءمة الصورة", en: "Image fit" })}>
        <Segmented
          label={t({ ar: "ملاءمة الصورة", en: "Image fit" })}
          value={s.fit}
          disabled={disabled}
          onChange={(fit) => set({ fit })}
          options={[
            { value: "fit", label: t({ ar: "احتواء", en: "Fit" }) },
            { value: "fill", label: t({ ar: "ملء (قص)", en: "Fill (crop)" }) },
            { value: "actual", label: t({ ar: "الحجم الأصلي", en: "Actual size" }) },
          ]}
        />
      </Field>
      <Field label={t({ ar: "الهامش", en: "Margin" })} htmlFor={ids.margin}>
        <NumberField id={ids.margin} value={s.margin} min={0} max={100} suffix="mm" disabled={disabled} onChange={(margin) => set({ margin })} />
      </Field>
      <Note>
        {t({
          ar: `ترتيب الصفحات هو ترتيب الصور في القائمة (${files.length}). تُضمَّن صور JPG وPNG كما هي دون فقدان جودة، وتُحوَّل WebP إلى PNG. تُراعى وضعية صور الهاتف (EXIF).`,
          en: `Pages follow the order of the images in the list (${files.length}). JPG and PNG are embedded as they are, without quality loss; WebP is converted to PNG. Phone photo orientation (EXIF) is respected.`,
        })}
      </Note>
    </div>
  );
}

/** Page mock-up using the same placement math as the real output. */
function Preview({ settings, file }: PreviewProps<ImageToPdfSettings>) {
  const t = useT();
  const update = useWorkspace((st) => st.update);
  const known = !!file.width && !!file.height;
  // The file list reads sizes lazily when a thumbnail scrolls into view; on a short phone
  // screen the list can be below the fold, so the previewed file is read here directly.
  useEffect(() => {
    if (known || file.previewError) return;
    let live = true;
    readImageSize(file.file)
      .then((size) => live && update(file.id, size))
      .catch(() => live && update(file.id, { previewError: "decode" }));
    return () => {
      live = false;
    };
  }, [known, file.id, file.file, file.previewError, update]);
  if (file.previewError && !known) {
    return <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">{t({ ar: "تعذّرت قراءة هذه الصورة في المتصفح.", en: "This browser couldn't read this image." })}</div>;
  }
  if (!known || !file.previewUrl) {
    return <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">{t({ ar: "جارٍ قراءة الصورة…", en: "Reading the image…" })}</div>;
  }
  // The browser shows images upright (EXIF applied), so these are displayed sizes.
  const [pw, ph] = pageSizeFor(settings, file.width!, file.height!);
  const { rect, clip } = placeImage(settings.fit, [pw, ph], mmToPt(Math.max(0, settings.margin)), file.width!, file.height!);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="space-y-3">
      <div className="mx-auto max-h-[70vh]" style={{ aspectRatio: `${pw} / ${ph}`, maxWidth: `min(100%, calc(70vh * ${pw / ph}))` }}>
        <div className="relative size-full overflow-hidden bg-white shadow-soft ring-1 ring-border" dir="ltr">
          <div className="absolute overflow-hidden" style={{ left: pct(clip.x, pw), bottom: pct(clip.y, ph), width: pct(clip.width, pw), height: pct(clip.height, ph) }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img
              src={file.previewUrl}
              alt=""
              className="absolute max-w-none"
              style={{ left: pct(rect.x - clip.x, clip.width), bottom: pct(rect.y - clip.y, clip.height), width: pct(rect.width, clip.width), height: pct(rect.height, clip.height) }}
            />
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground" dir="ltr">
        {Math.round(pw * 0.3528)} × {Math.round(ph * 0.3528)} mm
      </p>
    </div>
  );
}

/** JPG/PNG go in unchanged; WebP is decoded by the browser and stored as PNG. */
const browserLoader: ImageLoader = async (input) => {
  if (input.kind === "jpeg" || input.kind === "png") return { bytes: new Uint8Array(await input.file.arrayBuffer()), type: input.kind };
  const bitmap = await createImageBitmap(input.file);
  try {
    return { bytes: await bitmapToPng(bitmap), type: "png" };
  } finally {
    bitmap.close();
  }
};

const mod: ToolModule<ImageToPdfSettings> = {
  mode: "batch",
  defaultSettings: DEFAULT_IMAGE_TO_PDF,
  Settings,
  Preview,
  process: (inputs, settings, ctx) => imagesToPdf(inputs, settings, ctx, browserLoader),
  actionLabel: { ar: "تحويل إلى PDF", en: "Convert to PDF" },
};

export default mod;
