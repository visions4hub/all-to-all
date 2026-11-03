"use client";

import { useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import type { PreviewProps, SettingsProps, ToolModule } from "@/tools/types";
import { Field, Note, NumberField, PageSelectionField } from "./lib/controls";
import { mmToPt, ptToMm } from "./lib/geometry";
import { PdfStatus, RenderedPage } from "./lib/pages";
import { resolvePages } from "./lib/page-selection";
import { cropPdf, MIN_CROPPED_SIZE, type CropMargins, type CropSettings } from "./lib/stamp";
import { usePageCount, usePdfJs } from "./lib/use-pdf";

const SIDES: (keyof CropMargins)[] = ["top", "bottom", "left", "right"];
const round1 = (n: number) => Math.round(n * 10) / 10;

function Settings({ settings, onChange, activeFile, disabled }: SettingsProps<CropSettings>) {
  const t = useT();
  const ids = { top: useId(), bottom: useId(), left: useId(), right: useId() };
  const total = usePageCount(activeFile);
  const labels: Record<keyof CropMargins, string> = {
    top: t({ ar: "من الأعلى", en: "Top" }),
    bottom: t({ ar: "من الأسفل", en: "Bottom" }),
    left: t({ ar: "من اليسار", en: "Left" }),
    right: t({ ar: "من اليمين", en: "Right" }),
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t({ ar: "اسحب حواف المربع في المعاينة، أو اكتب مقدار القص من كل جهة:", en: "Drag the box edges in the preview, or type how much to cut from each side:" })}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {SIDES.map((side) => (
          <Field key={side} label={labels[side]} htmlFor={ids[side]}>
            <NumberField
              id={ids[side]}
              value={round1(ptToMm(settings.margins[side]))}
              min={0}
              max={2000}
              suffix="mm"
              disabled={disabled}
              onChange={(v) => onChange({ ...settings, margins: { ...settings.margins, [side]: mmToPt(v) } })}
            />
          </Field>
        ))}
      </div>
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => onChange({ ...settings, margins: { top: 0, right: 0, bottom: 0, left: 0 } })}>
        {t({ ar: "إعادة الضبط", en: "Reset" })}
      </Button>
      <PageSelectionField value={settings.selection} onChange={(selection) => onChange({ ...settings, selection })} pageCount={total} disabled={disabled} label={{ ar: "الصفحات المقصوصة", en: "Pages to crop" }} />
      <Note tone="warning">
        {t({
          ar: "القص يغيّر المنطقة الظاهرة من الصفحة فقط؛ المحتوى خارجها يبقى داخل الملف ويمكن استعادته ببرامج التحرير. لا تعتمد عليه لإخفاء معلومات حساسة.",
          en: "Cropping changes only the visible area of the page; content outside it stays in the file and can be recovered with editing software. Don't rely on it to hide sensitive information.",
        })}
      </Note>
    </div>
  );
}

type Drag = { kind: "move" | keyof CropMargins | `${"top" | "bottom"}-${"left" | "right"}`; x: number; y: number; start: CropMargins };

function CropBoxOverlay({ margins, size, onChange }: { margins: CropMargins; size: { width: number; height: number }; onChange: (m: CropMargins) => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const W = size.width;
  const H = size.height;

  const begin = (e: React.PointerEvent, kind: Drag["kind"]) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, x: e.clientX, y: e.clientY, start: margins };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    const dx = ((e.clientX - d.x) * W) / rect.width;
    const dy = ((e.clientY - d.y) * H) / rect.height;
    const m = { ...d.start };
    const kinds = d.kind === "move" ? [] : d.kind.split("-");
    if (d.kind === "move") {
      const mx = Math.max(-m.left, Math.min(m.right, dx));
      const my = Math.max(-m.top, Math.min(m.bottom, dy));
      m.left += mx;
      m.right -= mx;
      m.top += my;
      m.bottom -= my;
    }
    if (kinds.includes("left")) m.left = Math.max(0, Math.min(W - m.right - MIN_CROPPED_SIZE, d.start.left + dx));
    if (kinds.includes("right")) m.right = Math.max(0, Math.min(W - m.left - MIN_CROPPED_SIZE, d.start.right - dx));
    if (kinds.includes("top")) m.top = Math.max(0, Math.min(H - m.bottom - MIN_CROPPED_SIZE, d.start.top + dy));
    if (kinds.includes("bottom")) m.bottom = Math.max(0, Math.min(H - m.top - MIN_CROPPED_SIZE, d.start.bottom - dy));
    onChange(m);
  };
  const end = () => (drag.current = null);

  const box = {
    left: `${(margins.left / W) * 100}%`,
    top: `${(margins.top / H) * 100}%`,
    right: `${(margins.right / W) * 100}%`,
    bottom: `${(margins.bottom / H) * 100}%`,
  };
  const handle = "absolute size-6 -m-3 flex items-center justify-center touch-none";
  const dot = <span className="size-3.5 rounded-full border-2 border-white bg-primary shadow" />;
  const handles: { kind: Drag["kind"]; style: React.CSSProperties; cursor: string }[] = [
    { kind: "top-left", style: { left: 0, top: 0 }, cursor: "nwse-resize" },
    { kind: "top-right", style: { right: 0, top: 0 }, cursor: "nesw-resize" },
    { kind: "bottom-left", style: { left: 0, bottom: 0 }, cursor: "nesw-resize" },
    { kind: "bottom-right", style: { right: 0, bottom: 0 }, cursor: "nwse-resize" },
    { kind: "top", style: { left: "50%", top: 0 }, cursor: "ns-resize" },
    { kind: "bottom", style: { left: "50%", bottom: 0 }, cursor: "ns-resize" },
    { kind: "left", style: { left: 0, top: "50%" }, cursor: "ew-resize" },
    { kind: "right", style: { right: 0, top: "50%" }, cursor: "ew-resize" },
  ];

  return (
    <div ref={ref} dir="ltr" className="absolute inset-0 touch-none select-none" onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end}>
      {/* Dim what will be hidden */}
      <div className="pointer-events-none absolute inset-0 bg-black/45" style={{ clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0, ${box.left} ${box.top}, ${box.left} calc(100% - ${box.bottom}), calc(100% - ${box.right}) calc(100% - ${box.bottom}), calc(100% - ${box.right}) ${box.top}, ${box.left} ${box.top})` }} />
      <div
        role="group"
        aria-label={t({ ar: "منطقة القص", en: "Crop area" })}
        className="absolute cursor-move border-2 border-primary"
        style={box}
        onPointerDown={(e) => begin(e, "move")}
      >
        {handles.map((h) => (
          <span key={h.kind} className={handle} style={{ ...h.style, cursor: h.cursor }} onPointerDown={(e) => begin(e, h.kind)}>
            {dot}
          </span>
        ))}
      </div>
    </div>
  );
}

function Preview({ settings, onChange, file }: PreviewProps<CropSettings>) {
  const t = useT();
  const pdf = usePdfJs(file.file);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  if (!pdf.doc) return <PdfStatus pdf={pdf} />;
  const shown = Math.min(page, pdf.numPages - 1);
  const m = settings.margins;
  const tooBig = size && (size.width - m.left - m.right < MIN_CROPPED_SIZE || size.height - m.top - m.bottom < MIN_CROPPED_SIZE);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="outline" disabled={shown <= 0} onClick={() => setPage(shown - 1)} aria-label={t({ ar: "الصفحة السابقة", en: "Previous page" })}>
          <ChevronRight className="ltr:rotate-180" />
        </Button>
        <span className="text-sm" dir="ltr">
          {shown + 1} / {pdf.numPages}
        </span>
        <Button size="icon-sm" variant="outline" disabled={shown >= pdf.numPages - 1} onClick={() => setPage(shown + 1)} aria-label={t({ ar: "الصفحة التالية", en: "Next page" })}>
          <ChevronLeft className="ltr:rotate-180" />
        </Button>
        {size && (
          <span className="ms-auto text-xs text-muted-foreground" dir="ltr">
            {Math.round(ptToMm(size.width - m.left - m.right))} × {Math.round(ptToMm(size.height - m.top - m.bottom))} mm
          </span>
        )}
      </div>
      {tooBig && <p className="text-sm text-destructive">{t({ ar: "الهوامش أكبر من هذه الصفحة.", en: "The margins are larger than this page." })}</p>}
      <RenderedPage source={file.file} page={shown + 1} maxHeight={720} onSize={setSize}>
        {size && <CropBoxOverlay margins={m} size={size} onChange={(margins) => onChange({ ...settings, margins })} />}
      </RenderedPage>
    </div>
  );
}

const mod: ToolModule<CropSettings> = {
  mode: "per-file",
  defaultSettings: { margins: { top: 36, right: 36, bottom: 36, left: 36 }, selection: { scope: "all", ranges: "" } },
  Settings,
  Preview,
  process: cropPdf,
  validate: (files, s) => {
    if (SIDES.every((k) => s.margins[k] === 0)) return { ar: "حدّد منطقة القص أولاً", en: "Set the crop area first" };
    for (const f of files) {
      if (!f.pageCount) continue;
      const r = resolvePages(s.selection, f.pageCount);
      if (!r.ok) return r.error;
    }
    return null;
  },
  actionLabel: { ar: "قص", en: "Crop" },
};

export default mod;
