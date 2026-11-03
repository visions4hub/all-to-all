"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocument } from "pdf-lib";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { RenderedPage } from "./pages";
import { openPdfDocument } from "./pdf-lib";
import { singlePageCopy } from "./stamp";

/**
 * Builds the real result for one page (with the same code that makes the final
 * file) and shows it, so the preview can't drift from the output.
 */
export function LivePagePreview({
  file,
  page,
  numPages,
  onPage,
  signature,
  apply,
  note,
}: {
  file: File;
  /** 0-based page shown. */
  page: number;
  numPages: number;
  onPage: (page: number) => void;
  /** Changes whenever the result would change (settings serialized). */
  signature: string;
  apply: (doc: PDFDocument, page: number) => Promise<void>;
  note?: React.ReactNode;
}) {
  const t = useT();
  const [result, setResult] = useState<{ blob: Blob | null; error: string | null }>({ blob: null, error: null });
  const [busy, setBusy] = useState(false);
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const doc = await openPdfDocument(file);
        await applyRef.current(doc, page);
        const blob = await singlePageCopy(doc, page);
        if (alive) setResult({ blob, error: null });
      } catch (error) {
        if (alive) setResult((r) => ({ blob: r.blob, error: (error as Error).message }));
      } finally {
        if (alive) setBusy(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [file, page, signature]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="outline" disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label={t({ ar: "الصفحة السابقة", en: "Previous page" })}>
          <ChevronRight className="ltr:rotate-180" />
        </Button>
        <span className="text-sm" dir="ltr">
          {page + 1} / {numPages}
        </span>
        <Button size="icon-sm" variant="outline" disabled={page >= numPages - 1} onClick={() => onPage(page + 1)} aria-label={t({ ar: "الصفحة التالية", en: "Next page" })}>
          <ChevronLeft className="ltr:rotate-180" />
        </Button>
        <span className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          {t({ ar: "معاينة حقيقية للناتج", en: "Live preview of the result" })}
        </span>
      </div>
      {result.error && <p className="rounded-lg bg-destructive/8 p-2 text-sm text-destructive">{result.error}</p>}
      {result.blob ? (
        <RenderedPage source={result.blob} maxHeight={720} />
      ) : (
        <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-muted">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {note}
    </div>
  );
}
