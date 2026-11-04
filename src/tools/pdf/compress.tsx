"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n";
import { openPdf } from "@/lib/pdf/pdfjs";
import type { SettingsProps, ToolModule } from "@/tools/types";
import { Field, Note, RangeField, Segmented, ToggleField } from "./lib/controls";
import { compressInWorker } from "./lib/compress-client";
import { compressionOutput, verifyCompressed } from "./lib/compress-result";
import { DEFAULT_COMPRESS, DPI_OPTIONS, type CompressSettings, type CompressStage } from "./lib/compress-settings";
import { currentLocale } from "./lib/errors";
import type { PdfOpener } from "./lib/text-extract";

const opener: PdfOpener = (data) => openPdf(data);

/** Image recompression runs in a worker with OffscreenCanvas (missing in Safari before 16.4). Null until checked. */
const noSubscribe = () => () => {};
function useWorkerCanvas(): boolean | null {
  return useSyncExternalStore(
    noSubscribe,
    () => typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function",
    () => null,
  );
}

function Settings({ settings: s, onChange, disabled }: SettingsProps<CompressSettings>) {
  const t = useT();
  const canvasOk = useWorkerCanvas();
  return (
    <div className="space-y-4">
      <Note>
        {t({
          ar: "يُعاد بناء الملف داخل متصفحك دون أي فقد: تُحذف الكائنات غير المستخدمة والنسخ القديمة، وتُجمَع الكائنات في تدفقات مضغوطة، ويُعاد ضغط البيانات بأعلى مستوى. النص والخطوط والصور تبقى كما هي تماماً.",
          en: "The file is rebuilt in your browser without any loss: unused objects and old revisions are removed, objects are packed into compressed streams and data is recompressed at the highest level. Text, fonts and images stay exactly as they are.",
        })}
      </Note>
      <ToggleField
        checked={s.images}
        disabled={disabled}
        onChange={(images) => onChange({ ...s, images })}
        label={t({ ar: "إعادة ضغط الصور أيضاً (بفقد في الجودة)", en: "Also recompress images (lossy)" })}
        hint={t({ ar: "يوفّر أكثر في الملفات المليئة بالصور، لكنه يخفّض جودة الصور.", en: "Saves more on image-heavy files, but lowers image quality." })}
      />
      {s.images && canvasOk === false && (
        <Note tone="warning">
          <span data-testid="images-unsupported">
            {t({
              ar: "هذا المتصفح لا يدعم إعادة ضغط الصور (OffscreenCanvas، مثل Safari الأقدم من 16.4)، لذا سيُطبَّق التحسين دون فقد فقط.",
              en: "This browser can't recompress images (OffscreenCanvas, e.g. Safari older than 16.4), so only lossless optimisation will run.",
            })}
          </span>
        </Note>
      )}
      {s.images && (
        <>
          <Field label={t({ ar: "أقصى دقة للصور", en: "Maximum image resolution" })} hint={t({ ar: "الصور الأكبر من هذه الدقة بالنسبة لحجم الصفحة تُصغَّر.", en: "Images sharper than this for the page size are scaled down." })}>
            <Segmented
              value={s.maxDpi}
              disabled={disabled}
              onChange={(maxDpi) => onChange({ ...s, maxDpi })}
              label={t({ ar: "أقصى دقة للصور", en: "Maximum image resolution" })}
              options={DPI_OPTIONS.map((d) => ({ value: d, label: <span dir="ltr">{`${d} DPI`}</span> }))}
              columns={DPI_OPTIONS.length}
            />
          </Field>
          <Field label={t({ ar: "جودة JPEG", en: "JPEG quality" })}>
            <RangeField
              value={s.quality}
              min={30}
              max={95}
              step={5}
              disabled={disabled}
              onChange={(quality) => onChange({ ...s, quality })}
              ariaLabel={t({ ar: "جودة JPEG", en: "JPEG quality" })}
              format={(v) => `${v}%`}
            />
          </Field>
          <Note tone="warning">
            {t({
              ar: "هذا الخيار يفقد جزءاً من جودة الصور ولا يمكن التراجع عنه في الملف الناتج. لا تُحوَّل الصفحات إلى صور أبداً: النص يبقى نصاً قابلاً للتحديد، وتبقى الرسوم المتجهة كما هي، ولا تُستبدل صورة إلا إذا صارت أصغر.",
              en: "This option loses some image quality and can't be undone in the result. Pages are never turned into pictures: text stays selectable text, vector graphics are unchanged, and an image is replaced only if it gets smaller.",
            })}
          </Note>
        </>
      )}
      <Note>
        {t({
          ar: "يُتحقَّق من كل ملف ناتج: يُفتح، ويُطابَق عدد صفحاته ونص كل صفحة مع الأصل. إن لم يصغر الحجم فستحصل على ملفك الأصلي مع توضيح ذلك. التوقيعات الرقمية في الملف تصبح غير صالحة بعد إعادة بنائه.",
          en: "Every result is checked: it is opened, and its page count and each page's text are matched against the original. If the size doesn't go down you get your original file back, clearly marked. Digital signatures in the file become invalid once it is rebuilt.",
        })}
      </Note>
    </div>
  );
}

const STAGES: Record<CompressStage | "verifying", { ar: string; en: string }> = {
  reading: { ar: "قراءة الملف", en: "Reading the file" },
  images: { ar: "إعادة ضغط الصور", en: "Recompressing images" },
  optimizing: { ar: "تحسين البنية", en: "Optimising structure" },
  verifying: { ar: "التحقق من الناتج", en: "Checking the result" },
};

const mod: ToolModule<CompressSettings> = {
  mode: "per-file",
  defaultSettings: DEFAULT_COMPRESS,
  Settings,
  process: async ([input], settings, ctx) => {
    const locale = currentLocale();
    const label = (stage: keyof typeof STAGES) => `${input.name} — ${STAGES[stage][locale]}`;
    const original = new Uint8Array(await input.file.arrayBuffer());
    const { bytes, report } = await compressInWorker(original, settings, ctx.signal, (stage, done, total) =>
      ctx.onProgress({ done: stage === "images" ? done : 0, total: stage === "images" ? Math.max(total, 1) : 1, label: label(stage) }),
    );
    let verification = null;
    if (bytes.length < original.length) {
      ctx.onProgress({ done: 0, total: 1, label: label("verifying") });
      verification = await verifyCompressed(original, bytes, opener, ctx.signal);
    }
    return [compressionOutput(input, original, bytes, report, verification, locale)];
  },
  actionLabel: { ar: "ضغط PDF", en: "Compress PDF" },
};

export default mod;
