"use client";

import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { Field, Segmented } from "./lib/controls";
import { PagePicker, RangesField, selectedFromRanges } from "./lib/page-picker";
import { consecutiveRuns } from "./lib/page-selection";
import { extractPdfPages, type ExtractSettings } from "./lib/structure";
import { usePageCount } from "./lib/use-pdf";

function Settings({ settings, onChange, activeFile, disabled }: SettingsProps<ExtractSettings>) {
  const t = useT();
  const total = usePageCount(activeFile);
  const pages = total ? selectedFromRanges(settings.ranges, total) : [];
  const files =
    settings.output === "single" ? (pages.length ? 1 : 0) : settings.output === "per-page" ? pages.length : consecutiveRuns(pages).length;
  return (
    <div className="space-y-4">
      <RangesField
        label={{ ar: "الصفحات المراد استخراجها", en: "Pages to extract" }}
        value={settings.ranges}
        total={total}
        disabled={disabled}
        onChange={(ranges) => onChange({ ...settings, ranges })}
      />
      <Field label={t({ ar: "الناتج", en: "Output" })}>
        <Segmented
          label={t({ ar: "الناتج", en: "Output" })}
          value={settings.output}
          disabled={disabled}
          onChange={(output) => onChange({ ...settings, output })}
          columns={3}
          options={[
            { value: "single", label: t({ ar: "ملف واحد", en: "One PDF" }) },
            { value: "per-range", label: t({ ar: "ملف لكل نطاق", en: "One per range" }) },
            { value: "per-page", label: t({ ar: "ملف لكل صفحة", en: "One per page" }) },
          ]}
        />
      </Field>
      {pages.length > 0 && (
        <p className="text-sm text-muted-foreground" role="status">
          {t({ ar: `${pages.length} صفحة · ${files} ملف ناتج`, en: `${pages.length} page(s) · ${files} output file(s)` })}
        </p>
      )}
    </div>
  );
}

function Preview({ settings, onChange, file }: PreviewProps<ExtractSettings>) {
  return (
    <PagePicker
      file={file.file}
      ranges={settings.ranges}
      onRanges={(ranges) => onChange({ ...settings, ranges })}
      mark="selected"
      summary={(n, total) => ({ ar: `${n} من ${total} صفحة محددة`, en: `${n} of ${total} pages selected` })}
    />
  );
}

const mod: ToolModule<ExtractSettings> = {
  mode: "per-file",
  defaultSettings: { ranges: "", output: "single" },
  Settings,
  Preview,
  process: extractPdfPages,
  validate: (files, s) => {
    if (!s.ranges.trim()) return { ar: "اختر الصفحات المراد استخراجها", en: "Select the pages to extract" };
    const total = files[0]?.pageCount;
    if (total && !selectedFromRanges(s.ranges, total).length) return { ar: "تحقق من أرقام الصفحات", en: "Check the page numbers" };
    return null;
  },
  actionLabel: { ar: "استخراج الصفحات", en: "Extract pages" },
};

export default mod;
