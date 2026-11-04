"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileArchive, Loader2, RotateCcw, Share2, XCircle } from "lucide-react";
import { CompareSlider } from "@/components/workspace/compare-slider";
import { Button } from "@/components/ui/button";
import type { ProcessOutput, RunResult, WorkspaceFile } from "@/lib/engine/types";
import { downloadBlob, shareFiles, zipFiles } from "@/lib/files/download";
import { applyCustomName, splitExtension } from "@/lib/files/filename";
import { formatBytes, formatNumber, percentChange } from "@/lib/files/format";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function SizeChange({ before, after }: { before: number; after: number }) {
  const t = useT();
  const pct = percentChange(before, after);
  if (Math.abs(pct) < 0.05) return <span className="text-muted-foreground">{t({ ar: "نفس الحجم", en: "Same size" })}</span>;
  const smaller = pct < 0;
  return (
    <span className={smaller ? "text-success" : "text-warning"}>
      <span dir="ltr">{`${smaller ? "−" : "+"}${formatNumber(Math.abs(pct), 1)}%`}</span>{" "}
      {smaller ? t({ ar: "أصغر", en: "smaller" }) : t({ ar: "أكبر", en: "larger" })}
    </span>
  );
}

/** Object URLs for result previews, revoked when results change or unmount. */
function useOutputUrls(outputs: ProcessOutput[]) {
  const urls = useMemo(
    () => outputs.map((o) => (IMAGE_TYPES.includes(o.blob.type) ? URL.createObjectURL(o.blob) : null)),
    [outputs],
  );
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);
  return urls;
}

export function ResultsPanel({
  result,
  sources,
  zipName,
  onReset,
}: {
  result: RunResult;
  sources: WorkspaceFile[];
  zipName: string;
  onReset: () => void;
}) {
  const t = useT();
  const outputs = result.outputs;
  const urls = useOutputUrls(outputs);
  const [names, setNames] = useState<Record<number, string>>({});
  const [zipping, setZipping] = useState<number | null>(null);
  // This panel only appears after processing in the browser, so navigator is always available here.
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.canShare === "function" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  const finalName = (i: number) => {
    const original = outputs[i].name;
    const custom = names[i];
    if (!custom?.trim()) return original;
    return applyCustomName(custom, splitExtension(original).ext, original);
  };
  const named = () => outputs.map((o, i) => ({ name: finalName(i), blob: o.blob }));

  const failed = result.items.filter((i) => i.status === "error");
  const cancelled = result.items.filter((i) => i.status === "cancelled");
  const sourceName = (key: string) => sources.find((s) => s.id === key)?.name ?? "";

  const downloadZip = async () => {
    setZipping(0);
    try {
      const blob = await zipFiles(named(), (p) => setZipping(p));
      downloadBlob(blob, zipName);
    } finally {
      setZipping(null);
    }
  };

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-soft sm:p-6" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-full",
            outputs.length ? "bg-teal-soft text-teal" : "bg-destructive/10 text-destructive",
          )}
        >
          {outputs.length ? <CheckCircle2 className="size-5" /> : <AlertCircle className="size-5" />}
        </span>
        <div className="me-auto">
          <h2 className="text-lg font-semibold">
            {outputs.length
              ? t({ ar: "ملفاتك جاهزة", en: "Your files are ready" })
              : result.cancelled
                ? t({ ar: "تم الإلغاء", en: "Cancelled" })
                : t({ ar: "لم تنجح المعالجة", en: "Processing failed" })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t({
              ar: `${formatNumber(outputs.length)} ملف ناتج · تمت المعالجة على جهازك`,
              en: `${formatNumber(outputs.length)} output file${outputs.length === 1 ? "" : "s"} · processed on your device`,
            })}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {outputs.length > 1 && (
            <Button onClick={downloadZip} disabled={zipping !== null} className="h-10 flex-1 rounded-xl sm:flex-none">
              {zipping !== null ? <Loader2 className="animate-spin" /> : <FileArchive />}
              {zipping !== null
                ? t({ ar: `جارٍ التجميع ${Math.round(zipping)}%`, en: `Zipping ${Math.round(zipping)}%` })
                : t({ ar: "تنزيل الكل (ZIP)", en: "Download all (ZIP)" })}
            </Button>
          )}
          {outputs.length === 1 && (
            <Button onClick={() => downloadBlob(outputs[0].blob, finalName(0))} className="h-10 flex-1 rounded-xl sm:flex-none">
              <Download />
              {t({ ar: "تنزيل", en: "Download" })}
            </Button>
          )}
          {canShare && outputs.length > 0 && (
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => void shareFiles(named())}>
              <Share2 />
              {t({ ar: "مشاركة", en: "Share" })}
            </Button>
          )}
          <Button variant="ghost" className="h-10 rounded-xl" onClick={onReset}>
            <RotateCcw />
            {t({ ar: "معالجة جديدة", en: "Start over" })}
          </Button>
        </div>
      </div>

      {(failed.length > 0 || cancelled.length > 0) && (
        <ul className="mt-4 space-y-2">
          {failed.map((item) => (
            <li key={item.key} className="flex items-start gap-2 rounded-xl bg-destructive/8 p-3 text-sm text-destructive">
              <XCircle className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                {item.key !== "batch" && (
                  <span dir="auto" className="font-medium">
                    {sourceName(item.key)}:{" "}
                  </span>
                )}
                {item.error?.startsWith("MEMORY:")
                  ? t({
                      ar: "نفدت ذاكرة المتصفح أثناء معالجة هذا الملف. جرّب ملفات أقل أو أصغر في المرة الواحدة.",
                      en: "The browser ran out of memory for this file. Try fewer or smaller files at once.",
                    })
                  : item.error}
              </span>
            </li>
          ))}
          {cancelled.length > 0 && (
            <li className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
              {t({
                ar: `أُلغيت معالجة ${formatNumber(cancelled.length)} ملف.`,
                en: `${formatNumber(cancelled.length)} file(s) were cancelled.`,
              })}
            </li>
          )}
        </ul>
      )}

      {outputs.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {outputs.map((o, i) => {
            const source = o.sourceIds.length === 1 ? sources.find((s) => s.id === o.sourceIds[0]) : undefined;
            const showCompare = !!urls[i] && !!source?.previewUrl && source.kind !== "pdf" && source.kind !== "svg";
            const { ext } = splitExtension(o.name);
            return (
              <li key={i} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-background/60 p-3">
                {showCompare ? (
                  <CompareSlider beforeUrl={source!.previewUrl!} afterUrl={urls[i]!} className="aspect-[4/3]" />
                ) : urls[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL
                  <img src={urls[i]!} alt="" className="aspect-[4/3] w-full rounded-lg border bg-muted object-contain" />
                ) : null}
                <div className="flex items-center gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">{t({ ar: "اسم الملف الناتج", en: "Output filename" })}</span>
                    <div className="flex items-center rounded-lg border bg-card focus-within:ring-2 focus-within:ring-ring/40" dir="ltr">
                      <input
                        dir="auto"
                        value={names[i] ?? splitExtension(o.name).base}
                        onChange={(e) => setNames((n) => ({ ...n, [i]: e.target.value }))}
                        className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none"
                      />
                      {ext && <span className="pe-2.5 text-sm text-muted-foreground">.{ext}</span>}
                    </div>
                  </label>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-9 shrink-0 rounded-lg"
                    onClick={() => downloadBlob(o.blob, finalName(i))}
                    aria-label={t({ ar: "تنزيل هذا الملف", en: "Download this file" })}
                  >
                    <Download />
                  </Button>
                </div>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span dir="ltr">{formatBytes(o.blob.size)}</span>
                  {source && <SizeChange before={source.size} after={o.blob.size} />}
                  {o.meta?.map((m, j) => (
                    <span key={j}>
                      {t(m.label)}:{" "}
                      <span dir="ltr">{typeof m.value === "number" ? formatNumber(m.value, 2) : m.value}</span>
                    </span>
                  ))}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
