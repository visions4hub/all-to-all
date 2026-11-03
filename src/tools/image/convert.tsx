"use client";

import { useT } from "@/lib/i18n";
import type { SettingsProps, ToolModule } from "@/tools/types";
import type { ProcessInput } from "@/lib/engine/types";
import { createCanvas, releaseCanvas } from "./lib/canvas";
import { MESSAGES, userError } from "./lib/errors";
import { FORMAT_INFO, type OutputFormat } from "./lib/format";
import { computeResize, type Size } from "./lib/geometry";
import { finishCanvas, loadToCanvas } from "./lib/pipeline";
import { parseLength, svgIntrinsicSize } from "./lib/svg";
import { ColorField, METADATA_NOTE, Note, NumberField, OutputFormatFields, SwitchField } from "./lib/ui";

export type ConvertSettings = {
  format: OutputFormat;
  quality: number;
  /** Optional output width; height follows the aspect ratio. Required to enlarge SVGs crisply. */
  width: number | null;
  /** Fill transparent areas with `background` (always done for JPG). */
  fill: boolean;
  background: string;
};

const defaultSettings: ConvertSettings = { format: "png", quality: 90, width: null, fill: false, background: "#ffffff" };

function Settings({ settings: s, onChange, files, disabled }: SettingsProps<ConvertSettings>) {
  const t = useT();
  const set = (patch: Partial<ConvertSettings>) => onChange({ ...s, ...patch });
  const hasSvg = files.some((f) => f.kind === "svg");
  return (
    <div className="space-y-4">
      <OutputFormatFields format={s.format} quality={s.quality} allowKeep={false} disabled={disabled} onChange={({ format, quality }) => set({ format: format as OutputFormat, quality })} />
      <NumberField
        label={t({ ar: "عرض الناتج (اختياري)", en: "Output width (optional)" })}
        value={s.width}
        min={1}
        suffix="px"
        placeholder={t({ ar: "نفس العرض", en: "Same width" })}
        disabled={disabled}
        onChange={(width) => set({ width })}
        hint={t({ ar: "الارتفاع يتبع النسبة تلقائياً.", en: "Height follows the aspect ratio." })}
      />
      {s.format === "jpeg" ? (
        <ColorField label={t({ ar: "لون خلفية المناطق الشفافة", en: "Background for transparent areas" })} value={s.background} disabled={disabled} onChange={(background) => set({ background })} />
      ) : (
        <>
          <SwitchField label={t({ ar: "تعبئة الشفافية بلون", en: "Fill transparency with a colour" })} checked={s.fill} disabled={disabled} onChange={(fill) => set({ fill })} />
          {s.fill && <ColorField label={t({ ar: "لون الخلفية", en: "Background colour" })} value={s.background} disabled={disabled} onChange={(background) => set({ background })} />}
        </>
      )}
      {hasSvg && (
        <Note>
          {t({
            ar: "يُرسم SVG كصورة آمنة: لا تُشغَّل أي سكربتات داخله ولا يُحمَّل أي محتوى خارجي. حدّد العرض لتكبيره بوضوح كامل.",
            en: "SVG is drawn as a safe image: no scripts inside it run and no external content loads. Set a width to enlarge it with full sharpness.",
          })}
        </Note>
      )}
      <Note>{t(METADATA_NOTE)}</Note>
    </div>
  );
}

/** Rasterises an SVG at an exact size by rewriting its root width/height (keeps vectors sharp). */
async function svgToCanvas(input: ProcessInput, width: number | null) {
  const text = await input.file.text();
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.getElementsByTagName("parsererror").length || root.localName !== "svg") userError(MESSAGES.decode);
  const attrs = { width: root.getAttribute("width"), height: root.getAttribute("height"), viewBox: root.getAttribute("viewBox") };
  const intrinsic: Size = svgIntrinsicSize(attrs) ?? { width: 300, height: 150 };
  if (!attrs.viewBox && parseLength(attrs.width) && parseLength(attrs.height)) {
    root.setAttribute("viewBox", `0 0 ${intrinsic.width} ${intrinsic.height}`);
  }
  const size = width ? computeResize(intrinsic, { mode: "pixels", width, keepRatio: true, noUpscale: false }) : { width: Math.round(intrinsic.width), height: Math.round(intrinsic.height) };
  root.setAttribute("width", String(size.width));
  root.setAttribute("height", String(size.height));
  root.setAttribute("preserveAspectRatio", root.getAttribute("preserveAspectRatio") ?? "xMidYMid meet");

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(doc)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      userError(MESSAGES.decode);
    }
    const { canvas, ctx } = createCanvas(size.width, size.height);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const convert: ToolModule<ConvertSettings> = {
  mode: "per-file",
  defaultSettings,
  Settings,
  actionLabel: { ar: "تحويل", en: "Convert" },
  async process([input], s, { signal }) {
    let canvas: HTMLCanvasElement;
    if (input.kind === "svg") canvas = await svgToCanvas(input, s.width);
    else {
      canvas = (await loadToCanvas(input, (src) => (s.width ? computeResize(src, { mode: "pixels", width: s.width, keepRatio: true, noUpscale: false }) : src))).canvas;
    }
    if (s.fill && FORMAT_INFO[s.format].alpha) {
      const { canvas: filled, ctx } = createCanvas(canvas.width, canvas.height);
      ctx.fillStyle = s.background;
      ctx.fillRect(0, 0, filled.width, filled.height);
      ctx.drawImage(canvas, 0, 0);
      releaseCanvas(canvas);
      canvas = filled;
    }
    return [await finishCanvas(input, canvas, s.format, { suffix: "converted", quality: s.quality, background: s.background, signal })];
  },
};

export default convert;
