"use client";

import { throwIfCancelled } from "@/lib/engine/types";
import { useT } from "@/lib/i18n";
import type { SettingsProps, ToolModule } from "@/tools/types";
import { localize } from "./lib/errors";
import { getPixels, releaseCanvas } from "./lib/canvas";
import { FORMAT_INFO, resolveFormat, type FormatChoice } from "./lib/format";
import { computeResize } from "./lib/geometry";
import { exportCanvas, loadToCanvas, META, outputName } from "./lib/pipeline";
import { runImageJob } from "./lib/worker-client";
import { ColorField, Field, METADATA_NOTE, Note, NumberField, OutputFormatFields, Section, Segmented, SelectField, SwitchField } from "./lib/ui";

type Preset = "high" | "balanced" | "small" | "smallest" | "custom";

export type CompressSettings = {
  preset: Preset;
  /** 1–100, for JPG/WebP. */
  quality: number;
  format: FormatChoice;
  /** PNG output: exact pixels, or fewer colours (lossy, much smaller). */
  pngMode: "lossless" | "colors";
  colors: number;
  dither: boolean;
  /** Optional: shrink so the longer side is at most this many pixels. */
  maxSide: number | null;
  /** If the result is not smaller, give back the original file untouched. */
  keepSmaller: boolean;
  background: string;
};

const PRESETS: Record<Exclude<Preset, "custom">, { quality: number; colors: number }> = {
  high: { quality: 88, colors: 256 },
  balanced: { quality: 75, colors: 256 },
  small: { quality: 60, colors: 128 },
  smallest: { quality: 40, colors: 64 },
};

const defaultSettings: CompressSettings = {
  preset: "balanced",
  quality: 75,
  format: "keep",
  pngMode: "lossless",
  colors: 256,
  dither: true,
  maxSide: null,
  keepSmaller: true,
  background: "#ffffff",
};

function Settings({ settings: s, onChange, files, disabled }: SettingsProps<CompressSettings>) {
  const t = useT();
  const set = (patch: Partial<CompressSettings>) => onChange({ ...s, ...patch });
  const outputs = new Set(files.map((f) => resolveFormat(s.format, f.kind)));
  const anyPng = outputs.has("png");
  const toJpegFromAlpha = s.format === "jpeg" && files.some((f) => f.kind !== "jpeg");

  return (
    <div className="space-y-4">
      <Field label={t({ ar: "مستوى الضغط", en: "Compression level" })}>
        <Segmented
          label={t({ ar: "مستوى الضغط", en: "Compression level" })}
          value={s.preset}
          columns={2}
          disabled={disabled}
          onChange={(preset) => set(preset === "custom" ? { preset } : { preset, ...PRESETS[preset] })}
          options={[
            { value: "high", label: t({ ar: "جودة عالية", en: "High quality" }) },
            { value: "balanced", label: t({ ar: "متوازن", en: "Balanced" }) },
            { value: "small", label: t({ ar: "حجم صغير", en: "Small" }) },
            { value: "smallest", label: t({ ar: "أصغر حجم", en: "Smallest" }) },
          ]}
        />
      </Field>

      <OutputFormatFields
        format={s.format}
        quality={s.quality}
        disabled={disabled}
        onChange={({ format, quality }) => set({ format, quality, preset: quality !== s.quality ? "custom" : s.preset })}
      />

      {anyPng && (
        <Section title="PNG">
          <Segmented
            label={t({ ar: "طريقة ضغط PNG", en: "PNG method" })}
            value={s.pngMode}
            disabled={disabled}
            onChange={(pngMode) => set({ pngMode })}
            options={[
              { value: "lossless", label: t({ ar: "بلا فقد", en: "Lossless" }) },
              { value: "colors", label: t({ ar: "تقليل الألوان", en: "Fewer colours" }) },
            ]}
          />
          {s.pngMode === "lossless" ? (
            <Note>
              {t({
                ar: "يعيد ترميز PNG بأصغر تمثيل مطابق تماماً (لوحة ألوان، رمادي، أو بدون شفافية عند الإمكان). البكسلات لا تتغير، لكن الوفر غالباً محدود.",
                en: "Re-encodes the PNG in its smallest exact form (palette, greyscale or no alpha when possible). Pixels don't change, but savings are often modest.",
              })}
            </Note>
          ) : (
            <>
              <SelectField
                label={t({ ar: "عدد الألوان", en: "Colours" })}
                value={String(s.colors)}
                disabled={disabled}
                onChange={(v) => set({ colors: Number(v), preset: "custom" })}
                options={[256, 128, 64, 32, 16, 8].map((n) => ({ value: String(n), label: String(n) }))}
              />
              <SwitchField
                label={t({ ar: "تنعيم التدرجات (Dithering)", en: "Dithering" })}
                checked={s.dither}
                disabled={disabled}
                onChange={(dither) => set({ dither })}
              />
              <Note tone="warning">
                {t({
                  ar: "هذا ضغط مع فقد: تُدمج الألوان المتقاربة. ممتاز للرسوم ولقطات الشاشة، وقد يظهر تدرّج في الصور الفوتوغرافية.",
                  en: "This is lossy: similar colours are merged. Great for graphics and screenshots; photos may show banding.",
                })}
              </Note>
            </>
          )}
        </Section>
      )}

      <NumberField
        label={t({ ar: "أقصى طول للضلع الأطول (اختياري)", en: "Max longer side (optional)" })}
        value={s.maxSide}
        min={1}
        suffix="px"
        placeholder={t({ ar: "بدون تغيير", en: "No change" })}
        disabled={disabled}
        onChange={(maxSide) => set({ maxSide })}
        hint={t({ ar: "تصغير الأبعاد يقلل الحجم كثيراً. لا تُكبَّر الصور الأصغر.", en: "Smaller dimensions save a lot. Smaller images are never enlarged." })}
      />

      {toJpegFromAlpha && (
        <ColorField label={t({ ar: "لون خلفية المناطق الشفافة", en: "Background for transparent areas" })} value={s.background} disabled={disabled} onChange={(background) => set({ background })} />
      )}

      <SwitchField
        label={t({ ar: "أبقِ الأصل إن لم يصغر", en: "Keep original if not smaller" })}
        checked={s.keepSmaller}
        disabled={disabled}
        onChange={(keepSmaller) => set({ keepSmaller })}
        hint={t({
          ar: "إذا خرج الملف المضغوط أكبر من الأصل بنفس الصيغة والأبعاد، تحصل على الأصل كما هو.",
          en: "If the compressed file comes out larger than the original (same format and size), you get the original unchanged.",
        })}
      />
      <Note>{t(METADATA_NOTE)}</Note>
    </div>
  );
}

const compress: ToolModule<CompressSettings> = {
  mode: "per-file",
  defaultSettings,
  Settings,
  actionLabel: { ar: "ضغط الصور", en: "Compress" },
  async process([input], s, { signal }) {
    const format = resolveFormat(s.format, input.kind);
    const { canvas, src } = await loadToCanvas(input, (src) =>
      s.maxSide ? computeResize(src, { mode: "max", maxWidth: s.maxSide, maxHeight: s.maxSide, keepRatio: true, noUpscale: true }) : src,
    );
    const size = { width: canvas.width, height: canvas.height };
    try {
      let blob: Blob;
      const meta = [META.size(size), META.format(format)];
      if (format === "png" && s.pngMode === "colors") {
        const result = await runImageJob({ op: "png-quantized", px: getPixels(canvas), colors: s.colors, dither: s.dither }, signal);
        if (result.op !== "png") throw new Error("Unexpected worker result");
        blob = new Blob([result.bytes as BlobPart], { type: "image/png" });
        meta.push({ label: { ar: "الألوان", en: "Colours" }, value: String(result.info.colors) });
      } else {
        blob = await exportCanvas(canvas, format, { quality: s.quality, background: s.background, signal });
        if (FORMAT_INFO[format].lossy) meta.push({ label: { ar: "الجودة", en: "Quality" }, value: `${s.quality}%` });
        else meta.push({ label: { ar: "الطريقة", en: "Method" }, value: localize({ ar: "بلا فقد", en: "lossless" }) });
      }
      throwIfCancelled(signal);

      const sameShape = size.width === src.width && size.height === src.height && resolveFormat("keep", input.kind) === format;
      if (s.keepSmaller && sameShape && blob.size >= input.file.size) {
        return [
          {
            name: outputName(input, "compressed", format),
            blob: new Blob([input.file], { type: FORMAT_INFO[format].mime }),
            sourceIds: [input.id],
            meta: [META.size(src), META.format(format), { label: { ar: "ملاحظة", en: "Note" }, value: localize({ ar: "أُبقي الأصل — مضغوط جيداً أصلاً", en: "original kept — already well compressed" }) }],
          },
        ];
      }
      return [{ name: outputName(input, "compressed", format), blob, sourceIds: [input.id], meta }];
    } finally {
      releaseCanvas(canvas);
    }
  },
};

export default compress;
