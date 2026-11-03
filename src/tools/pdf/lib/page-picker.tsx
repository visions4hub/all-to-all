"use client";

import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useT, type Localized } from "@/lib/i18n";
import { pagesToRangeText } from "@/lib/pdf/page-ranges";
import { Field } from "./controls";
import { PageGrid, PdfStatus, type PageMark } from "./pages";
import { resolvePages, togglePage } from "./page-selection";
import { usePdfJs } from "./use-pdf";

export function selectedFromRanges(ranges: string, total: number): number[] {
  if (!ranges.trim() || !total) return [];
  const r = resolvePages({ scope: "custom", ranges }, total);
  return r.ok ? r.pages : [];
}

/**
 * Thumbnail grid where tapping pages edits a page-range text (the single source
 * of truth shared with the settings panel). Shift+click selects a span.
 */
export function PagePicker({
  file,
  ranges,
  onRanges,
  mark,
  summary,
}: {
  file: Blob;
  ranges: string;
  onRanges: (ranges: string) => void;
  mark: Exclude<PageMark, "none">;
  summary: (selected: number, total: number) => Localized;
}) {
  const t = useT();
  const pdf = usePdfJs(file);
  const anchor = useRef<number | undefined>(undefined);
  if (!pdf.doc) return <PdfStatus pdf={pdf} />;
  const total = pdf.numPages;
  const selected = selectedFromRanges(ranges, total);
  const set = (pages: number[]) => onRanges(pagesToRangeText(pages));
  const all = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="me-auto text-sm font-medium" role="status">
          {t(summary(selected.length, total))}
        </p>
        <Button size="sm" variant="outline" onClick={() => set(all)}>
          {t({ ar: "تحديد الكل", en: "Select all" })}
        </Button>
        <Button size="sm" variant="outline" onClick={() => set(all.filter((p) => !selected.includes(p)))}>
          {t({ ar: "عكس التحديد", en: "Invert" })}
        </Button>
        <Button size="sm" variant="outline" onClick={() => set(all.filter((p) => p % 2 === 1))}>
          {t({ ar: "الفردية", en: "Odd" })}
        </Button>
        <Button size="sm" variant="outline" onClick={() => set(all.filter((p) => p % 2 === 0))}>
          {t({ ar: "الزوجية", en: "Even" })}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => set([])} disabled={!selected.length}>
          {t({ ar: "إلغاء التحديد", en: "Clear" })}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t({
          ar: "اضغط على الصفحة لتحديدها. لتحديد مجموعة متتالية: Shift مع النقر، أو اكتب النطاق في الإعدادات.",
          en: "Tap a page to select it. For a run of pages: Shift+click, or type the range in the settings.",
        })}
      </p>
      <PageGrid
        file={file}
        pdf={pdf}
        label={t({ ar: "صفحات الملف", en: "Pages" })}
        marks={(p) => (selected.includes(p) ? mark : "none")}
        onToggle={(p, extend) => {
          set(togglePage(selected, p, extend ? anchor.current : undefined));
          anchor.current = p;
        }}
      />
    </div>
  );
}

/** Text field mirroring the picker selection. */
export function RangesField({ value, onChange, total, disabled, label }: { value: string; onChange: (v: string) => void; total?: number; disabled?: boolean; label: Localized }) {
  const t = useT();
  const id = useId();
  const check = value.trim() && total ? resolvePages({ scope: "custom", ranges: value }, total) : null;
  return (
    <Field label={t(label)} htmlFor={id}>
      <input
        id={id}
        dir="ltr"
        value={value}
        disabled={disabled}
        placeholder="2, 5-7"
        aria-invalid={check ? !check.ok : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
      />
      {check && !check.ok && <p className="text-xs text-destructive">{t(check.error)}</p>}
    </Field>
  );
}
