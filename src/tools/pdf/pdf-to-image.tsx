"use client";

import { useId } from "react";
import { useT } from "@/lib/i18n";
import type { SettingsProps, ToolModule } from "@/tools/types";
import { Field, Note, NumberField, PageSelectionField, RangeField, Segmented } from "./lib/controls";
import { resolvePages } from "./lib/page-selection";
import { DEFAULT_PDF_TO_IMAGE, MAX_DPI, MIN_DPI, pdfToImages, type PdfToImageSettings } from "./lib/pdf-to-image";
import { usePageCount } from "./lib/use-pdf";

const PRESETS = [72, 150, 300];

function Settings({ settings: s, onChange, activeFile, disabled }: SettingsProps<PdfToImageSettings>) {
  const t = useT();
  const ids = { dpi: useId(), q: useId() };
  const total = usePageCount(activeFile);
  const set = (patch: Partial<PdfToImageSettings>) => onChange({ ...s, ...patch });
  const preset = PRESETS.includes(s.dpi) ? s.dpi : 0;
  return (
    <div className="space-y-4">
      <Field label={t({ ar: "الصيغة", en: "Format" })}>
        <Segmented
          label={t({ ar: "الصيغة", en: "Format" })}
          value={s.format}
          disabled={disabled}
          onChange={(format) => set({ format })}
          options={[
            { value: "jpeg", label: "JPG" },
            { value: "png", label: "PNG" },
          ]}
        />
      </Field>
      <Field label={t({ ar: "الدقة", en: "Resolution" })}>
        <Segmented
          label={t({ ar: "الدقة", en: "Resolution" })}
          value={preset}
          disabled={disabled}
          onChange={(dpi) => set({ dpi: dpi || 200 })}
          options={[
            { value: 72, label: t({ ar: "شاشة 72", en: "Screen 72" }) },
            { value: 150, label: "150" },
            { value: 300, label: t({ ar: "طباعة 300", en: "Print 300" }) },
            { value: 0, label: t({ ar: "مخصص", en: "Custom" }) },
          ]}
        />
      </Field>
      {preset === 0 && (
        <Field label={t({ ar: "نقطة لكل بوصة", en: "Dots per inch" })} htmlFor={ids.dpi}>
          <NumberField id={ids.dpi} value={s.dpi} min={MIN_DPI} max={MAX_DPI} integer suffix="DPI" disabled={disabled} onChange={(dpi) => set({ dpi })} />
        </Field>
      )}
      {s.format === "jpeg" && (
        <Field label={t({ ar: "جودة JPG", en: "JPG quality" })} htmlFor={ids.q}>
          <RangeField id={ids.q} value={Math.round(s.quality * 100)} min={40} max={100} format={(v) => `${v}%`} disabled={disabled} onChange={(v) => set({ quality: v / 100 })} />
        </Field>
      )}
      <PageSelectionField value={s.selection} onChange={(selection) => set({ selection })} pageCount={total} disabled={disabled} />
      <Note>
        {t({
          ar: "تُرسم كل صفحة كاملة كصورة. هذه الأداة لا تستخرج الصور المضمّنة داخل الملف كما هي. الدقة العالية تحتاج ذاكرة أكبر.",
          en: "Each whole page is drawn as an image. This tool doesn't pull out the pictures embedded in the PDF as they are. High resolutions need more memory.",
        })}
      </Note>
    </div>
  );
}

const mod: ToolModule<PdfToImageSettings> = {
  mode: "per-file",
  defaultSettings: DEFAULT_PDF_TO_IMAGE,
  Settings,
  process: pdfToImages,
  validate: (files, s) => {
    if (!(s.dpi >= MIN_DPI && s.dpi <= MAX_DPI)) return { ar: `اختر دقة بين ${MIN_DPI} و${MAX_DPI}`, en: `Choose a resolution between ${MIN_DPI} and ${MAX_DPI}` };
    for (const f of files) {
      if (!f.pageCount) continue;
      const r = resolvePages(s.selection, f.pageCount);
      if (!r.ok) return r.error;
    }
    return null;
  },
  actionLabel: { ar: "تحويل إلى صور", en: "Convert to images" },
};

export default mod;
