"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { AnchorPicker, ColorField, Field, FONT_OPTIONS, Note, NumberField, PageSelectionField, RangeField, Segmented, SelectField, TextField, ToggleField } from "./lib/controls";
import { mmToPt, ptToMm } from "./lib/geometry";
import { readEmbeddableImage } from "./lib/image-input";
import { LivePagePreview } from "./lib/live-preview";
import { canUseStandardFont } from "./lib/page-space";
import { PdfStatus } from "./lib/pages";
import { rasterizeText } from "./lib/raster-text";
import { resolvePages } from "./lib/page-selection";
import { addWatermark, applyWatermark, DEFAULT_WATERMARK, type WatermarkSettings } from "./lib/stamp";
import { usePageCount, usePdfJs } from "./lib/use-pdf";

function Settings({ settings: s, onChange, activeFile, disabled }: SettingsProps<WatermarkSettings>) {
  const t = useT();
  const ids = { text: useId(), size: useId(), color: useId(), font: useId(), gap: useId(), margin: useId(), op: useId(), rot: useId(), scale: useId() };
  const total = usePageCount(activeFile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState(false);
  const set = (patch: Partial<WatermarkSettings>) => onChange({ ...s, ...patch });
  const raster = s.kind === "text" && s.text.trim() !== "" && !canUseStandardFont(s.text);

  return (
    <div className="space-y-4">
      <Segmented
        label={t({ ar: "نوع العلامة", en: "Watermark type" })}
        value={s.kind}
        disabled={disabled}
        onChange={(kind) => set({ kind })}
        options={[
          { value: "text", label: t({ ar: "نص", en: "Text" }) },
          { value: "image", label: t({ ar: "صورة / شعار", en: "Image / logo" }) },
        ]}
      />
      {s.kind === "text" ? (
        <>
          <Field label={t({ ar: "النص", en: "Text" })} htmlFor={ids.text}>
            <TextField id={ids.text} value={s.text} disabled={disabled} placeholder={t({ ar: "مثال: سري", en: "e.g. CONFIDENTIAL" })} onChange={(text) => set({ text })} multiline />
          </Field>
          {raster && (
            <Note tone="warning">
              {t({
                ar: "النص العربي يُرسم كصورة شفافة داخل الملف (مكتبة PDF لا تشكّل العربية)؛ يظهر صحيحاً لكنه غير قابل للتحديد.",
                en: "Arabic text is drawn as a transparent image (the PDF library can't shape Arabic); it looks right but isn't selectable.",
              })}
            </Note>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t({ ar: "حجم الخط", en: "Font size" })} htmlFor={ids.size}>
              <NumberField id={ids.size} value={s.fontSize} min={6} max={300} suffix="pt" disabled={disabled} onChange={(fontSize) => set({ fontSize })} />
            </Field>
            <Field label={t({ ar: "اللون", en: "Colour" })} htmlFor={ids.color}>
              <ColorField id={ids.color} value={s.color} disabled={disabled} onChange={(color) => set({ color })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label={t({ ar: "الخط", en: "Font" })} htmlFor={ids.font}>
              <SelectField id={ids.font} value={s.font} options={FONT_OPTIONS} disabled={disabled || raster} onChange={(font) => set({ font })} />
            </Field>
            <ToggleField checked={s.bold} disabled={disabled} onChange={(bold) => set({ bold })} label={t({ ar: "عريض", en: "Bold" })} />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl" disabled={disabled} onClick={() => fileRef.current?.click()}>
              <ImagePlus />
              {s.image ? t({ ar: "تغيير الصورة", en: "Change image" }) : t({ ar: "اختر صورة", en: "Choose image" })}
            </Button>
            {s.image && (
              <span dir="auto" className="min-w-0 truncate text-xs text-muted-foreground">
                {s.image.name}
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label={t({ ar: "صورة العلامة المائية", en: "Watermark image" })}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const img = await readEmbeddableImage(f);
                  setImageError(false);
                  set({ image: { ...img, name: f.name } });
                } catch {
                  setImageError(true);
                }
              }}
            />
          </div>
          {imageError && <p className="text-xs text-destructive">{t({ ar: "تعذّرت قراءة هذه الصورة.", en: "This image couldn't be read." })}</p>}
          <Field label={t({ ar: "عرض الصورة (من عرض الصفحة)", en: "Image width (of page width)" })} htmlFor={ids.scale}>
            <RangeField id={ids.scale} value={Math.round(s.imageScale * 100)} min={5} max={100} format={(v) => `${v}%`} disabled={disabled} onChange={(v) => set({ imageScale: v / 100 })} />
          </Field>
        </>
      )}
      <Field label={t({ ar: "الشفافية", en: "Opacity" })} htmlFor={ids.op}>
        <RangeField id={ids.op} value={Math.round(s.opacity * 100)} min={5} max={100} format={(v) => `${v}%`} disabled={disabled} onChange={(v) => set({ opacity: v / 100 })} />
      </Field>
      <Field label={t({ ar: "الزاوية", en: "Angle" })} htmlFor={ids.rot}>
        <RangeField id={ids.rot} value={s.rotation} min={-90} max={90} step={5} format={(v) => `${v}°`} disabled={disabled} onChange={(rotation) => set({ rotation })} />
      </Field>
      <ToggleField
        checked={s.tile}
        disabled={disabled}
        onChange={(tile) => set({ tile })}
        label={t({ ar: "تكرار على كامل الصفحة", en: "Repeat across the page" })}
      />
      {s.tile ? (
        <Field label={t({ ar: "المسافة بين التكرارات", en: "Space between repeats" })} htmlFor={ids.gap}>
          <NumberField id={ids.gap} value={Math.round(ptToMm(s.gap))} min={0} max={300} suffix="mm" disabled={disabled} onChange={(v) => set({ gap: mmToPt(v) })} />
        </Field>
      ) : (
        <div className="flex items-start gap-4">
          <Field label={t({ ar: "الموضع", en: "Position" })}>
            <AnchorPicker label={t({ ar: "الموضع", en: "Position" })} value={s.position} disabled={disabled} onChange={(position) => set({ position })} />
          </Field>
          <Field label={t({ ar: "الهامش", en: "Margin" })} htmlFor={ids.margin}>
            <NumberField id={ids.margin} value={Math.round(ptToMm(s.margin))} min={0} max={200} suffix="mm" disabled={disabled} onChange={(v) => set({ margin: mmToPt(v) })} />
          </Field>
        </div>
      )}
      <PageSelectionField value={s.selection} onChange={(selection) => set({ selection })} pageCount={total} disabled={disabled} />
    </div>
  );
}

function Preview({ settings, file }: PreviewProps<WatermarkSettings>) {
  const t = useT();
  const pdf = usePdfJs(file.file);
  const [page, setPage] = useState(0);
  if (!pdf.doc) return <PdfStatus pdf={pdf} />;
  const ready = settings.kind === "text" ? settings.text.trim() !== "" : !!settings.image;
  if (!ready) {
    return (
      <p className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
        {settings.kind === "text"
          ? t({ ar: "اكتب نص العلامة المائية لترى المعاينة.", en: "Type the watermark text to see a preview." })
          : t({ ar: "اختر صورة لترى المعاينة.", en: "Choose an image to see a preview." })}
      </p>
    );
  }
  const { image, ...rest } = settings;
  return (
    <LivePagePreview
      file={file.file}
      page={Math.min(page, pdf.numPages - 1)}
      numPages={pdf.numPages}
      onPage={setPage}
      signature={JSON.stringify({ ...rest, image: image ? `${image.name}:${image.bytes.length}` : null })}
      apply={async (doc, p) => {
        await applyWatermark(doc, settings, rasterizeText, p);
      }}
    />
  );
}

const mod: ToolModule<WatermarkSettings> = {
  mode: "per-file",
  defaultSettings: DEFAULT_WATERMARK,
  Settings,
  Preview,
  process: (inputs, settings, ctx) => addWatermark(inputs, settings, ctx, rasterizeText),
  validate: (files, s) => {
    if (s.kind === "text" && !s.text.trim()) return { ar: "اكتب نص العلامة المائية", en: "Type the watermark text" };
    if (s.kind === "image" && !s.image) return { ar: "اختر صورة للعلامة المائية", en: "Choose a watermark image" };
    for (const f of files) {
      if (!f.pageCount) continue;
      const r = resolvePages(s.selection, f.pageCount);
      if (!r.ok) return r.error;
    }
    return null;
  },
  actionLabel: { ar: "إضافة العلامة المائية", en: "Add watermark" },
};

export default mod;
