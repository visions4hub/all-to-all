"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/lib/i18n";
import { openPdf } from "@/lib/pdf/pdfjs";
import { cn } from "@/lib/utils";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { comparePixels, compareText } from "./lib/compare-client";
import { DIFF_COLORS, pageStatus, SENSITIVITY, STATUS_LABELS, type PageResult, type PageStatus, type Sensitivity } from "./lib/compare-core";
import { pageText, renderPair, type RenderableDoc } from "./lib/compare-render";
import { comparePdfs, DEFAULT_COMPARE, type CompareSettings } from "./lib/compare-run";
import { Field, Note, RangeField, Segmented, ToggleField } from "./lib/controls";
import { PdfStatus } from "./lib/pages";
import type { PdfOpener } from "./lib/text-extract";
import { usePdfJs } from "./lib/use-pdf";

const opener: PdfOpener = (data) => openPdf(data);

function Settings({ settings: s, onChange, disabled }: SettingsProps<CompareSettings>) {
  const t = useT();
  return (
    <div className="space-y-4">
      <Note>
        {t({
          ar: "الملف الأول هو الأصل والثاني هو النسخة الجديدة؛ غيّر الترتيب من قائمة الملفات. تُقارَن الصفحات حسب رقمها: نص كل صفحة كلمةً بكلمة، وصورتها بكسلاً ببكسل.",
          en: "The first file is the original and the second the new version; change the order in the file list. Pages are compared by number: each page's text word by word, and its picture pixel by pixel.",
        })}
      </Note>
      <ToggleField
        checked={s.visual}
        disabled={disabled}
        onChange={(visual) => onChange({ ...s, visual })}
        label={t({ ar: "مقارنة بصرية في التقرير", en: "Visual comparison in the report" })}
        hint={t({ ar: "يُضمِّن صورة للفروقات لكل صفحة تغيّر شكلها. أبطأ في الملفات الطويلة.", en: "Adds a difference picture for every page whose look changed. Slower on long files." })}
      />
      <Field label={t({ ar: "حساسية المقارنة البصرية", en: "Visual sensitivity" })} hint={t({ ar: "العالية تلتقط فروقات الألوان الخفيفة أيضاً.", en: "High also catches faint colour changes." })}>
        <Segmented<Sensitivity>
          value={s.sensitivity}
          disabled={disabled}
          onChange={(sensitivity) => onChange({ ...s, sensitivity })}
          label={t({ ar: "حساسية المقارنة البصرية", en: "Visual sensitivity" })}
          options={[
            { value: "low", label: t({ ar: "منخفضة", en: "Low" }) },
            { value: "normal", label: t({ ar: "عادية", en: "Normal" }) },
            { value: "high", label: t({ ar: "عالية", en: "High" }) },
          ]}
        />
      </Field>
      <Note>
        {t({
          ar: "تُقارَن النصوص المخزّنة داخل الملفين فقط؛ الصفحات الممسوحة ضوئياً بلا نص تُذكر صراحةً وتُقارَن بصرياً فقط. لا يوجد تعرّف ضوئي على الحروف (OCR).",
          en: "Only text stored in the files is compared; scanned pages without text are reported as such and compared visually only. There is no OCR.",
        })}
      </Note>
    </div>
  );
}

// ---- Preview ---------------------------------------------------------------------

type View = "side" | "overlay" | "diff" | "text";
type Rgba = { data: Uint8ClampedArray; width: number; height: number };

function PixelCanvas({ image, label }: { image: Rgba; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d")!.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  }, [image]);
  return <canvas ref={ref} role="img" aria-label={label} className="block h-auto w-full rounded-md bg-white shadow-sm ring-1 ring-border" />;
}

function MissingPage({ ratio, label }: { ratio: number; label: string }) {
  return (
    <div className="flex items-center justify-center rounded-md border border-dashed bg-muted/40 p-3 text-center text-xs text-muted-foreground" style={{ aspectRatio: ratio }}>
      {label}
    </div>
  );
}

const STATUS_STYLE: Record<PageStatus, string> = {
  same: "bg-muted text-muted-foreground",
  changed: "bg-warning/15 text-warning",
  "only-a": "bg-destructive/10 text-destructive",
  "only-b": "bg-success/15 text-success",
  "no-text": "bg-muted text-muted-foreground ring-1 ring-dashed ring-border",
};

function TextDiff({ result }: { result: PageResult }) {
  const t = useT();
  if (!result.ops.length)
    return (
      <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">
        {t({ ar: "لا يوجد نص في هذه الصفحة في كلا الملفين (قد تكون صورة ممسوحة ضوئياً). استخدم المقارنة البصرية.", en: "This page has no text in either file (it may be a scanned image). Use the visual comparison." })}
      </p>
    );
  return (
    <div className="space-y-2">
      {result.inA && result.inB && (!result.textA || !result.textB) && (
        <Note tone="warning">
          {t({
            ar: `الصفحة بلا نص في ${!result.textA ? "الملف الأول" : "الملف الثاني"} (قد تكون ممسوحة ضوئياً)، لذا يظهر نص الملف الآخر كله كفرق.`,
            en: `This page has no text in the ${!result.textA ? "first" : "second"} file (it may be scanned), so all text of the other file shows as a difference.`,
          })}
        </Note>
      )}
      <p dir="auto" data-testid="text-diff" className="max-h-[60vh] overflow-auto rounded-xl border bg-background p-3 text-sm leading-8 break-words whitespace-pre-wrap">
        {result.ops.map((op, i) => {
          const text = op.words.join(" ");
          const sep = i < result.ops.length - 1 ? " " : "";
          if (op.type === "added")
            return (
              <span key={i}>
                <ins className="rounded bg-success/15 px-0.5 text-success underline decoration-success/60">{text}</ins>
                {sep}
              </span>
            );
          if (op.type === "removed")
            return (
              <span key={i}>
                <del className="rounded bg-destructive/10 px-0.5 text-destructive">{text}</del>
                {sep}
              </span>
            );
          return <span key={i}>{text + sep}</span>;
        })}
      </p>
    </div>
  );
}

function Preview({ settings, files }: PreviewProps<CompareSettings>) {
  const t = useT();
  const locale = useLocale();
  const [fa, fb] = files;
  const A = usePdfJs(fa?.file);
  const B = usePdfJs(fb?.file);
  const total = Math.max(A.numPages, B.numPages);
  const [pageState, setPage] = useState(1);
  const page = Math.min(Math.max(1, pageState), Math.max(1, total));
  const [view, setView] = useState<View>("side");
  const [opacity, setOpacity] = useState(50);
  const docsKey = `${fa?.id}:${fb?.id}:${A.numPages}:${B.numPages}`;

  // Text comparison of every page, filled in as it goes.
  const [texts, setTexts] = useState<{ key: string; results: PageResult[] }>({ key: "", results: [] });
  useEffect(() => {
    if (!A.doc || !B.doc) return;
    const controller = new AbortController();
    const docA = A.doc;
    const docB = B.doc;
    (async () => {
      const results: PageResult[] = [];
      for (let n = 1; n <= Math.max(docA.numPages, docB.numPages); n++) {
        if (controller.signal.aborted) return;
        results.push(await compareText(n, await pageText(docA, n, controller.signal), await pageText(docB, n, controller.signal), controller.signal));
        setTexts({ key: docsKey, results: [...results] });
      }
    })().catch(() => undefined);
    return () => controller.abort();
  }, [A.doc, B.doc, docsKey]);
  const results = texts.key === docsKey ? texts.results : [];

  // Pictures of the current page, rendered at a shared scale, and their pixel difference.
  const visualKey = `${docsKey}:${page}:${settings.sensitivity}`;
  const [visual, setVisual] = useState<{ key: string; a: Rgba | null; b: Rgba | null; diff: Rgba; share: number; sizeDiffers: boolean } | null>(null);
  useEffect(() => {
    if (!A.doc || !B.doc || view === "text") return;
    const controller = new AbortController();
    (async () => {
      const pair = await renderPair(A.doc as unknown as RenderableDoc, B.doc as unknown as RenderableDoc, page, 900);
      const { width, height } = pair;
      // The diff transfers its inputs to the worker, so keep copies to display.
      const a = pair.a ? { data: pair.a.slice(), width, height } : null;
      const b = pair.b ? { data: pair.b.slice(), width, height } : null;
      const diff = await comparePixels(pair.a, pair.b, width, height, SENSITIVITY[settings.sensitivity], controller.signal);
      if (!controller.signal.aborted)
        setVisual({ key: visualKey, a, b, diff: { data: diff.image, width, height }, share: diff.changed / diff.total, sizeDiffers: pair.sizeDiffers });
    })().catch(() => undefined);
    return () => controller.abort();
    // visualKey covers the documents, page and sensitivity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualKey, view === "text"]);

  if (!fa || !fb)
    return (
      <p className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
        {t({ ar: "أضف ملف PDF ثانياً لبدء المقارنة.", en: "Add a second PDF to start comparing." })}
      </p>
    );
  if (!A.doc || !B.doc) return <PdfStatus pdf={A.error || !A.doc ? A : B} />;

  const current = results[page - 1];
  const vis = visual?.key === visualKey ? visual : null;
  const currentStatus: PageStatus | null = current ? pageStatus({ ...current, visual: vis?.share ?? null, sizeDiffers: vis?.sizeDiffers ?? false }) : null;
  const ratio = vis ? vis.diff.width / vis.diff.height : 595 / 842;
  const missing = (which: "a" | "b") =>
    t({ ar: `لا توجد صفحة ${page} في ${which === "a" ? "الملف الأول" : "الملف الثاني"}`, en: `There is no page ${page} in the ${which === "a" ? "first" : "second"} file` });
  const nameA = t({ ar: "الملف الأول", en: "First file" });
  const nameB = t({ ar: "الملف الثاني", en: "Second file" });
  const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          [nameA, fa.name, A.numPages],
          [nameB, fb.name, B.numPages],
        ].map(([label, name, count]) => (
          <div key={String(label)} className="min-w-0 rounded-xl border bg-card p-2.5">
            <p className="font-semibold">{label}</p>
            <p dir="auto" className="truncate text-muted-foreground" title={String(name)}>
              {name}
            </p>
            <p className="text-muted-foreground">{t({ ar: `${count} صفحة`, en: `${count} pages` })}</p>
          </div>
        ))}
      </div>

      {A.numPages !== B.numPages && (
        <Note tone="warning">
          {t({
            ar: `عدد الصفحات مختلف (${A.numPages} و${B.numPages}). تُقارَن الصفحات حسب رقمها، والصفحات الزائدة تظهر كموجودة في ملف واحد فقط.`,
            en: `The page counts differ (${A.numPages} and ${B.numPages}). Pages are compared by number; extra pages show as present in one file only.`,
          })}
        </Note>
      )}

      <Segmented<View>
        value={view}
        onChange={setView}
        label={t({ ar: "طريقة العرض", en: "View" })}
        columns={4}
        options={[
          { value: "side", label: t({ ar: "جنباً إلى جنب", en: "Side by side" }) },
          { value: "overlay", label: t({ ar: "تراكب", en: "Overlay" }) },
          { value: "diff", label: t({ ar: "الفروقات", en: "Difference" }) },
          { value: "text", label: t({ ar: "النص", en: "Text" }) },
        ]}
      />

      <div className="flex items-center gap-2">
        <Button size="icon" variant="outline" className="size-9 rounded-lg" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t({ ar: "الصفحة السابقة", en: "Previous page" })}>
          {locale === "ar" ? <ChevronRight /> : <ChevronLeft />}
        </Button>
        <p className="min-w-0 flex-1 text-center text-sm" role="status" aria-live="polite">
          {t({ ar: `الصفحة ${page} من ${total}`, en: `Page ${page} of ${total}` })}
          {currentStatus && (
            <span data-testid="page-status" className={cn("ms-2 rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[currentStatus])}>
              {t(STATUS_LABELS[currentStatus])}
            </span>
          )}
        </p>
        <Button size="icon" variant="outline" className="size-9 rounded-lg" disabled={page >= total} onClick={() => setPage(page + 1)} aria-label={t({ ar: "الصفحة التالية", en: "Next page" })}>
          {locale === "ar" ? <ChevronLeft /> : <ChevronRight />}
        </Button>
      </div>

      {results.length > 1 && (
        <div className="flex max-h-24 flex-wrap gap-1 overflow-auto" aria-label={t({ ar: "حالة الصفحات", en: "Page status" })}>
          {results.map((r) => {
            const st = pageStatus(r);
            return (
              <button
                key={r.page}
                type="button"
                onClick={() => setPage(r.page)}
                aria-label={`${t({ ar: `الصفحة ${r.page}`, en: `Page ${r.page}` })}: ${t(STATUS_LABELS[st])}`}
                aria-current={r.page === page ? "page" : undefined}
                className={cn("min-w-8 rounded-md px-1.5 py-1 text-xs font-medium tabular-nums", STATUS_STYLE[st], r.page === page && "ring-2 ring-primary")}
              >
                {r.page}
              </button>
            );
          })}
        </div>
      )}

      {view === "text" ? (
        current ? (
          <TextDiff result={current} />
        ) : (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )
      ) : !vis ? (
        <div className="flex h-60 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          {t({ ar: "جارٍ رسم الصفحتين…", en: "Rendering both pages…" })}
        </div>
      ) : view === "side" ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {(["a", "b"] as const).map((which) => (
            <figure key={which} className="min-w-0 space-y-1">
              <figcaption className="text-xs font-medium text-muted-foreground">{which === "a" ? nameA : nameB}</figcaption>
              {vis[which] ? <PixelCanvas image={vis[which]!} label={`${which === "a" ? nameA : nameB} — ${page}`} /> : <MissingPage ratio={ratio} label={missing(which)} />}
            </figure>
          ))}
        </div>
      ) : view === "overlay" ? (
        <div className="space-y-2">
          <div className="relative">
            {vis.a ? <PixelCanvas image={vis.a} label={nameA} /> : <MissingPage ratio={ratio} label={missing("a")} />}
            {vis.b && (
              <div className="absolute inset-0" style={{ opacity: opacity / 100 }}>
                <PixelCanvas image={vis.b} label={nameB} />
              </div>
            )}
          </div>
          <Field label={t({ ar: `شفافية الملف الثاني فوق الأول`, en: "Second file's opacity over the first" })}>
            <RangeField value={opacity} min={0} max={100} step={5} onChange={setOpacity} format={(v) => `${v}%`} ariaLabel={t({ ar: "شفافية الملف الثاني", en: "Second file opacity" })} />
          </Field>
        </div>
      ) : (
        <div className="space-y-2">
          <PixelCanvas image={vis.diff} label={t({ ar: `الفروقات البصرية في الصفحة ${page}`, en: `Visual differences on page ${page}` })} />
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span data-testid="visual-share">{t({ ar: "بكسلات مختلفة:", en: "Pixels changed:" })} <span dir="ltr">{pct(vis.share)}</span></span>
            <span className="inline-flex items-center gap-1">
              <span className="size-3 rounded-sm" style={{ background: `rgb(${DIFF_COLORS.removed.join(",")})` }} />
              {t({ ar: "في الملف الأول فقط", en: "Only in the first file" })}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-3 rounded-sm" style={{ background: `rgb(${DIFF_COLORS.added.join(",")})` }} />
              {t({ ar: "في الملف الثاني فقط", en: "Only in the second file" })}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-3 rounded-sm" style={{ background: `rgb(${DIFF_COLORS.changed.join(",")})` }} />
              {t({ ar: "تغيّر في الملفين", en: "Changed in both" })}
            </span>
            {vis.sizeDiffers && <span>{t({ ar: "مقاس الصفحة مختلف", en: "Page sizes differ" })}</span>}
          </p>
        </div>
      )}
    </div>
  );
}

const mod: ToolModule<CompareSettings> = {
  mode: "batch",
  defaultSettings: DEFAULT_COMPARE,
  Settings,
  Preview,
  process: (inputs, settings, ctx) => comparePdfs(inputs, settings, ctx, opener),
  validate: (files) => (files.length === 2 ? null : { ar: "أضف ملفَّي PDF اثنين بالضبط للمقارنة.", en: "Add exactly two PDF files to compare." }),
  actionLabel: { ar: "إنشاء تقرير المقارنة", en: "Create comparison report" },
};

export default mod;
