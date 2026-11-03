"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/lib/i18n";
import { openPdf } from "@/lib/pdf/pdfjs";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { Note, PageSelectionField, ToggleField } from "./lib/controls";
import { PdfStatus } from "./lib/pages";
import { resolvePages } from "./lib/page-selection";
import { composeText, DEFAULT_TEXT, extractPdfText, readPagesText, type PdfOpener, type TextSettings } from "./lib/text-extract";
import { usePageCount, usePdfJs } from "./lib/use-pdf";

const opener: PdfOpener = (data) => openPdf(data);

function Settings({ settings: s, onChange, activeFile, disabled }: SettingsProps<TextSettings>) {
  const t = useT();
  const total = usePageCount(activeFile);
  return (
    <div className="space-y-4">
      <PageSelectionField value={s.selection} onChange={(selection) => onChange({ ...s, selection })} pageCount={total} disabled={disabled} />
      <ToggleField
        checked={s.pageHeadings}
        disabled={disabled}
        onChange={(pageHeadings) => onChange({ ...s, pageHeadings })}
        label={t({ ar: "عنوان لكل صفحة", en: "Page headings" })}
        hint={t({ ar: "يضيف سطراً مثل «--- الصفحة 2 ---»", en: "Adds a line like “--- Page 2 ---”" })}
      />
      <Note>
        {t({
          ar: "يُقرأ النص المخزّن داخل الملف فقط. الصفحات الممسوحة ضوئياً (صور) لا تحتوي نصاً، وستُذكر في الناتج. لا يوجد تعرّف ضوئي على الحروف (OCR).",
          en: "Only text stored in the file is read. Scanned pages (pictures) have no text and are listed in the result. There is no OCR.",
        })}
      </Note>
    </div>
  );
}

function Preview({ settings, file }: PreviewProps<TextSettings>) {
  const t = useT();
  const locale = useLocale();
  const pdf = usePdfJs(file.file);
  const [state, setState] = useState<{ key: string; text: string; empty: number[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const sel = pdf.doc ? resolvePages(settings.selection, pdf.numPages) : null;
  const key = `${file.id}:${sel?.ok ? sel.pages.join(",") : "x"}:${settings.pageHeadings}:${locale}`;

  useEffect(() => {
    if (!pdf.doc || !sel?.ok) return;
    let alive = true;
    const controller = new AbortController();
    readPagesText(pdf.doc, sel.pages, controller.signal)
      .then((pages) => {
        if (alive) setState({ key, text: composeText(pages, settings.pageHeadings, locale), empty: pages.filter((p) => !p.text.trim()).map((p) => p.page) });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      controller.abort();
    };
    // `sel` is derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf.doc, key]);

  if (!pdf.doc) return <PdfStatus pdf={pdf} />;
  if (sel && !sel.ok) return <p className="text-sm text-destructive">{t(sel.error)}</p>;
  const ready = state?.key === key;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="me-auto text-sm text-muted-foreground" role="status">
          {ready
            ? state.empty.length
              ? t({ ar: `صفحات بلا نص (قد تكون ممسوحة ضوئياً): ${state.empty.join(", ")}`, en: `Pages without text (may be scanned): ${state.empty.join(", ")}` })
              : t({ ar: "كل الصفحات تحتوي نصاً.", en: "Every page has text." })
            : t({ ar: "جارٍ قراءة النص…", en: "Reading text…" })}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={!ready}
          onClick={async () => {
            if (!state) return;
            await navigator.clipboard.writeText(state.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? t({ ar: "تم النسخ", en: "Copied" }) : t({ ar: "نسخ النص", en: "Copy text" })}
        </Button>
      </div>
      {ready ? (
        <textarea
          readOnly
          dir="auto"
          value={state.text}
          aria-label={t({ ar: "النص المستخرج", en: "Extracted text" })}
          className="h-[60vh] w-full resize-y rounded-xl border bg-background p-3 font-mono text-sm leading-6 whitespace-pre-wrap outline-none"
        />
      ) : (
        <div className="flex h-60 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

const mod: ToolModule<TextSettings> = {
  mode: "per-file",
  defaultSettings: DEFAULT_TEXT,
  Settings,
  Preview,
  process: (inputs, settings, ctx) => extractPdfText(inputs, settings, ctx, opener),
  validate: (files, s) => {
    for (const f of files) {
      if (!f.pageCount) continue;
      const r = resolvePages(s.selection, f.pageCount);
      if (!r.ok) return r.error;
    }
    return null;
  },
  actionLabel: { ar: "استخراج النص (TXT)", en: "Extract text (TXT)" },
};

export default mod;
