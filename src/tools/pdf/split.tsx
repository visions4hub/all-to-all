"use client";

import { useId } from "react";
import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { Field, Note, NumberField, Segmented } from "./lib/controls";
import { PageGrid, PdfStatus } from "./lib/pages";
import { DEFAULT_SPLIT, splitGroups, splitPdf, type SplitSettings } from "./lib/structure";
import { usePageCount, usePdfJs } from "./lib/use-pdf";

const GROUP_COLORS = ["bg-primary", "bg-teal", "bg-pdf", "bg-warning", "bg-success"];

function Settings({ settings, onChange, activeFile, disabled }: SettingsProps<SplitSettings>) {
  const t = useT();
  const id = useId();
  const pages = usePageCount(activeFile);
  const result = pages ? splitGroups(settings, pages) : null;
  return (
    <div className="space-y-4">
      <Field label={t({ ar: "طريقة التقسيم", en: "How to split" })}>
        <Segmented
          label={t({ ar: "طريقة التقسيم", en: "How to split" })}
          value={settings.mode}
          disabled={disabled}
          onChange={(mode) => onChange({ ...settings, mode })}
          columns={3}
          options={[
            { value: "ranges", label: t({ ar: "نطاقات", en: "Ranges" }) },
            { value: "every-page", label: t({ ar: "كل صفحة", en: "Every page" }) },
            { value: "every-n", label: t({ ar: "كل N صفحات", en: "Every N" }) },
          ]}
        />
      </Field>
      {settings.mode === "ranges" && (
        <Field
          label={t({ ar: "النطاقات", en: "Ranges" })}
          htmlFor={id}
          hint={t({ ar: "كل نطاق يصبح ملفاً مستقلاً. مثال: 1-3, 4-6, 7-", en: "Each range becomes its own file. Example: 1-3, 4-6, 7-" })}
        >
          <input
            id={id}
            dir="ltr"
            value={settings.ranges}
            disabled={disabled}
            placeholder="1-3, 4-6, 7-"
            aria-invalid={result ? !result.ok : undefined}
            onChange={(e) => onChange({ ...settings, ranges: e.target.value })}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
        </Field>
      )}
      {settings.mode === "every-n" && (
        <Field label={t({ ar: "عدد الصفحات في كل ملف", en: "Pages per file" })} htmlFor={id}>
          <NumberField id={id} value={settings.every} min={1} integer disabled={disabled} onChange={(every) => onChange({ ...settings, every })} />
        </Field>
      )}
      {result && (
        <p className={result.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"} role="status">
          {result.ok
            ? t({ ar: `سينتج ${result.groups.length} ملف PDF`, en: `${result.groups.length} PDF file(s) will be created` })
            : t(result.error)}
        </p>
      )}
      <Note>{t({ ar: "عند وجود أكثر من ملف ناتج يمكنك تنزيلها معاً في ملف ZIP.", en: "When there is more than one result you can download them together as a ZIP." })}</Note>
    </div>
  );
}

function Preview({ settings, file }: PreviewProps<SplitSettings>) {
  const t = useT();
  const pdf = usePdfJs(file.file);
  if (!pdf.doc) return <PdfStatus pdf={pdf} />;
  const result = splitGroups(settings, pdf.numPages);
  const groupOf = new Map<number, number>();
  if (result.ok) result.groups.forEach((g, i) => g.forEach((p) => groupOf.set(p, i)));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t({ ar: "الرقم الملوّن تحت كل صفحة هو رقم الملف الناتج الذي ستكون فيه.", en: "The coloured number under each page is the output file it goes into." })}
      </p>
      <PageGrid
        file={file.file}
        pdf={pdf}
        label={t({ ar: "صفحات الملف", en: "Pages" })}
        marks={() => "none"}
        badge={(p) => {
          const g = groupOf.get(p);
          return g === undefined ? (
            <span className="rounded bg-muted px-1 text-[10px]">—</span>
          ) : (
            <span className={`rounded px-1.5 text-[10px] font-semibold text-white ${GROUP_COLORS[g % GROUP_COLORS.length]}`}>{g + 1}</span>
          );
        }}
      />
    </div>
  );
}

const mod: ToolModule<SplitSettings> = {
  mode: "per-file",
  defaultSettings: DEFAULT_SPLIT,
  Settings,
  Preview,
  process: splitPdf,
  validate: (files, s) => {
    if (s.mode === "ranges" && !s.ranges.trim()) return { ar: "اكتب نطاقات الصفحات", en: "Type the page ranges" };
    for (const f of files) {
      if (!f.pageCount) continue;
      const r = splitGroups(s, f.pageCount);
      if (!r.ok) return r.error;
    }
    return null;
  },
  actionLabel: { ar: "تقسيم", en: "Split" },
};

export default mod;
