"use client";

import { useRef } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import { useT } from "@/lib/i18n";
import { pagesToRangeText } from "@/lib/pdf/page-ranges";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { Field, PageSelectionField, Segmented } from "./lib/controls";
import { PageGrid, PdfStatus } from "./lib/pages";
import { resolvePages, togglePage } from "./lib/page-selection";
import { rotatePdf, type RotateSettings } from "./lib/structure";
import { usePageCount, usePdfJs } from "./lib/use-pdf";

function Settings({ settings, onChange, activeFile, files, disabled }: SettingsProps<RotateSettings>) {
  const t = useT();
  const total = usePageCount(activeFile);
  return (
    <div className="space-y-4">
      <Field label={t({ ar: "الاتجاه", en: "Direction" })}>
        <Segmented
          label={t({ ar: "الاتجاه", en: "Direction" })}
          value={settings.angle}
          disabled={disabled}
          onChange={(angle) => onChange({ ...settings, angle })}
          options={[
            {
              value: -90,
              label: (
                <span className="inline-flex items-center gap-1">
                  <RotateCcw className="size-3.5" />
                  {t({ ar: "يسار 90°", en: "Left 90°" })}
                </span>
              ),
            },
            {
              value: 90,
              label: (
                <span className="inline-flex items-center gap-1">
                  <RotateCw className="size-3.5" />
                  {t({ ar: "يمين 90°", en: "Right 90°" })}
                </span>
              ),
            },
            { value: 180, label: "180°" },
          ]}
        />
      </Field>
      <PageSelectionField value={settings.selection} onChange={(selection) => onChange({ ...settings, selection })} pageCount={total} disabled={disabled} />
      {files.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {t({ ar: `ستُطبّق الإعدادات نفسها على ${files.length} ملفات.`, en: `The same settings apply to all ${files.length} files.` })}
        </p>
      )}
    </div>
  );
}

function Preview({ settings, onChange, file }: PreviewProps<RotateSettings>) {
  const t = useT();
  const pdf = usePdfJs(file.file);
  const anchor = useRef<number | undefined>(undefined);
  if (!pdf.doc) return <PdfStatus pdf={pdf} />;
  const sel = resolvePages(settings.selection, pdf.numPages);
  const selected = sel.ok ? sel.pages : [];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t({
          ar: "تظهر الصفحات كما ستكون بعد التدوير. اضغط على صفحة لتدوير صفحات محددة فقط.",
          en: "Pages are shown as they will look after rotating. Tap a page to rotate only some pages.",
        })}
      </p>
      <PageGrid
        file={file.file}
        pdf={pdf}
        label={t({ ar: "صفحات الملف", en: "Pages" })}
        marks={(p) => (settings.selection.scope === "custom" && selected.includes(p) ? "selected" : "none")}
        rotations={(p) => (selected.includes(p) ? settings.angle : 0)}
        onToggle={(p, extend) => {
          const base = settings.selection.scope === "all" ? [] : selected;
          const next = togglePage(base, p, extend ? anchor.current : undefined);
          anchor.current = p;
          onChange({ ...settings, selection: next.length ? { scope: "custom", ranges: pagesToRangeText(next) } : { scope: "all", ranges: "" } });
        }}
      />
    </div>
  );
}

const mod: ToolModule<RotateSettings> = {
  mode: "per-file",
  defaultSettings: { angle: 90, selection: { scope: "all", ranges: "" } },
  Settings,
  Preview,
  process: rotatePdf,
  validate: (files, s) => {
    if (s.selection.scope === "custom" && !s.selection.ranges.trim()) return { ar: "اكتب أرقام الصفحات", en: "Type the page numbers" };
    for (const f of files) {
      if (!f.pageCount) continue;
      const r = resolvePages(s.selection, f.pageCount);
      if (!r.ok) return r.error;
    }
    return null;
  },
  actionLabel: { ar: "تدوير", en: "Rotate" },
};

export default mod;
