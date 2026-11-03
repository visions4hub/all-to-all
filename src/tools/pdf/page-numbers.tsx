"use client";

import { useId, useState } from "react";
import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { AnchorPicker, ColorField, Field, FONT_OPTIONS, Note, NumberField, PageSelectionField, SelectField, TextField, ToggleField } from "./lib/controls";
import { mmToPt, ptToMm, type Anchor } from "./lib/geometry";
import { LivePagePreview } from "./lib/live-preview";
import { canUseStandardFont } from "./lib/page-space";
import { PdfStatus } from "./lib/pages";
import { rasterizeText } from "./lib/raster-text";
import { resolvePages } from "./lib/page-selection";
import { addPageNumbers, applyPageNumbers, DEFAULT_PAGE_NUMBERS, formatPageLabel, pageNumberPlan, type NumberFormat, type PageNumberSettings } from "./lib/stamp";
import { usePageCount, usePdfJs } from "./lib/use-pdf";

const POSITIONS: Anchor[] = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"];

const round1 = (n: number) => Math.round(n * 10) / 10;

function Settings({ settings: s, onChange, activeFile, disabled }: SettingsProps<PageNumberSettings>) {
  const t = useT();
  const ids = { format: useId(), custom: useId(), start: useId(), size: useId(), color: useId(), mx: useId(), my: useId(), font: useId() };
  const total = usePageCount(activeFile);
  const set = (patch: Partial<PageNumberSettings>) => onChange({ ...s, ...patch });
  const sample = formatPageLabel(s.format, s.custom, s.start, Math.max(s.start, s.start + (total ?? 1) - 1));
  const raster = !canUseStandardFont(sample);
  return (
    <div className="space-y-4">
      <Field label={t({ ar: "الموضع", en: "Position" })}>
        <AnchorPicker label={t({ ar: "الموضع", en: "Position" })} value={s.position} allowed={POSITIONS} disabled={disabled} onChange={(position) => set({ position })} />
      </Field>
      <Field label={t({ ar: "الصيغة", en: "Format" })} htmlFor={ids.format}>
        <SelectField<NumberFormat>
          id={ids.format}
          value={s.format}
          disabled={disabled}
          onChange={(format) => set({ format })}
          options={[
            { value: "n", label: "1" },
            { value: "n-of-total", label: "1 / 10" },
            { value: "dash", label: "- 1 -" },
            { value: "page-n", label: "Page 1" },
            { value: "page-n-of-total", label: "Page 1 of 10" },
            { value: "ar-page-n", label: "صفحة 1" },
            { value: "ar-page-n-of-total", label: "صفحة 1 من 10" },
            { value: "custom", label: t({ ar: "نص مخصص…", en: "Custom text…" }) },
          ]}
        />
      </Field>
      {s.format === "custom" && (
        <Field label={t({ ar: "النص", en: "Text" })} htmlFor={ids.custom} hint={t({ ar: "{n} رقم الصفحة، {total} آخر رقم", en: "{n} = page number, {total} = last number" })}>
          <TextField id={ids.custom} value={s.custom} disabled={disabled} onChange={(custom) => set({ custom })} />
        </Field>
      )}
      {raster && (
        <Note tone="warning">
          {t({
            ar: "النص العربي يُرسم كصورة داخل الملف لأن مكتبة PDF المستخدمة لا تدعم تشكيل العربية؛ سيظهر بشكل صحيح لكنه غير قابل للتحديد أو البحث.",
            en: "Arabic text is drawn as an image because the PDF library can't shape Arabic; it looks right but can't be selected or searched.",
          })}
        </Note>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t({ ar: "يبدأ من", en: "Start at" })} htmlFor={ids.start}>
          <NumberField id={ids.start} value={s.start} integer min={0} max={99999} disabled={disabled} onChange={(start) => set({ start })} />
        </Field>
        <Field label={t({ ar: "حجم الخط", en: "Font size" })} htmlFor={ids.size}>
          <NumberField id={ids.size} value={s.fontSize} min={4} max={96} suffix="pt" disabled={disabled} onChange={(fontSize) => set({ fontSize })} />
        </Field>
      </div>
      <ToggleField
        checked={s.skipFirst}
        disabled={disabled}
        onChange={(skipFirst) => set({ skipFirst })}
        label={t({ ar: "تخطي الصفحة الأولى", en: "Skip the first page" })}
        hint={t({ ar: "مثل الغلاف؛ يبدأ الترقيم من الصفحة التالية", en: "E.g. a cover; numbering starts on the next page" })}
      />
      <PageSelectionField value={s.selection} onChange={(selection) => set({ selection })} pageCount={total} disabled={disabled} label={{ ar: "الصفحات المرقّمة", en: "Pages to number" }} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t({ ar: "الخط", en: "Font" })} htmlFor={ids.font}>
          <SelectField id={ids.font} value={s.font} options={FONT_OPTIONS} disabled={disabled || raster} onChange={(font) => set({ font })} />
        </Field>
        <Field label={t({ ar: "اللون", en: "Colour" })} htmlFor={ids.color}>
          <ColorField id={ids.color} value={s.color} disabled={disabled} onChange={(color) => set({ color })} />
        </Field>
      </div>
      <ToggleField checked={s.bold} disabled={disabled} onChange={(bold) => set({ bold })} label={t({ ar: "خط عريض", en: "Bold" })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t({ ar: "هامش جانبي", en: "Side margin" })} htmlFor={ids.mx}>
          <NumberField id={ids.mx} value={round1(ptToMm(s.marginX))} min={0} max={200} suffix="mm" disabled={disabled} onChange={(v) => set({ marginX: mmToPt(v) })} />
        </Field>
        <Field label={t({ ar: "هامش علوي/سفلي", en: "Top/bottom margin" })} htmlFor={ids.my}>
          <NumberField id={ids.my} value={round1(ptToMm(s.marginY))} min={0} max={200} suffix="mm" disabled={disabled} onChange={(v) => set({ marginY: mmToPt(v) })} />
        </Field>
      </div>
    </div>
  );
}

function Preview({ settings, file }: PreviewProps<PageNumberSettings>) {
  const pdf = usePdfJs(file.file);
  const [page, setPage] = useState<number | null>(null);
  if (!pdf.doc) return <PdfStatus pdf={pdf} />;
  const plan = pageNumberPlan(settings, pdf.numPages);
  const firstNumbered = plan.ok && plan.entries.length ? plan.entries[0].index : 0;
  const shown = Math.min(page ?? firstNumbered, pdf.numPages - 1);
  return (
    <LivePagePreview
      file={file.file}
      page={shown}
      numPages={pdf.numPages}
      onPage={setPage}
      signature={JSON.stringify(settings)}
      apply={async (doc, p) => {
        await applyPageNumbers(doc, settings, rasterizeText, p);
      }}
    />
  );
}

const mod: ToolModule<PageNumberSettings> = {
  mode: "per-file",
  defaultSettings: DEFAULT_PAGE_NUMBERS,
  Settings,
  Preview,
  process: (inputs, settings, ctx) => addPageNumbers(inputs, settings, ctx, rasterizeText),
  validate: (files, s) => {
    if (s.format === "custom" && !s.custom.includes("{n}")) return { ar: "أضف {n} إلى النص المخصص", en: "Add {n} to the custom text" };
    for (const f of files) {
      if (!f.pageCount) continue;
      const r = resolvePages(s.selection, f.pageCount);
      if (!r.ok) return r.error;
    }
    return null;
  },
  actionLabel: { ar: "إضافة الأرقام", en: "Add numbers" },
};

export default mod;
