import type { Localized } from "./types";

export type WorkflowPresetStep = {
  /** Tool slug. */
  slug: string;
  /** Changes from the tool's defaults; merged with sanitizeSettings when the tool loads. */
  settings?: Record<string, unknown>;
};

export type WorkflowPreset = { id: string; name: Localized; description: Localized; steps: WorkflowPresetStep[] };

/** Ready-made chains for the workflow builder (/workflows/?preset=<id>). */
export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: "web-ready",
    name: { ar: "صور جاهزة للنشر", en: "Web-ready images" },
    description: {
      ar: "تصغير إلى 1600 بكسل كحد أقصى، ثم ضغط متوازن، ثم علامة مائية نصية.",
      en: "Shrink to at most 1600 px, compress (balanced), then add a text watermark.",
    },
    steps: [
      { slug: "resize-image", settings: { mode: "max", maxWidth: 1600, maxHeight: 1600, noUpscale: true } },
      { slug: "compress-image", settings: { preset: "balanced", quality: 75 } },
      { slug: "watermark-image" },
    ],
  },
  {
    id: "crop-convert",
    name: { ar: "قص وتحويل", en: "Crop and convert" },
    description: {
      ar: "قص مربع من وسط الصورة، ثم تحويله إلى WebP.",
      en: "Crop a centred square, then convert it to WebP.",
    },
    steps: [
      { slug: "crop-image", settings: { ratio: "1:1" } },
      { slug: "convert-image", settings: { format: "webp", quality: 85 } },
    ],
  },
  {
    id: "pdf-package",
    name: { ar: "ملف PDF موحّد ومرقّم", en: "Merged, numbered PDF" },
    description: {
      ar: "دمج ملفات PDF، ثم ترقيم الصفحات «1 من 10»، ثم علامة مائية CONFIDENTIAL.",
      en: "Merge PDFs, number the pages “1 of 10”, then add a CONFIDENTIAL watermark.",
    },
    steps: [
      { slug: "merge-pdf" },
      { slug: "add-page-numbers", settings: { format: "n-of-total" } },
      { slug: "watermark-pdf", settings: { text: "CONFIDENTIAL" } },
    ],
  },
  {
    id: "scan-to-pdf",
    name: { ar: "صور إلى PDF مرقّم", en: "Photos to numbered PDF" },
    description: {
      ar: "تحويل الصور إلى ملف PDF واحد بحجم A4، ثم ترقيم صفحاته.",
      en: "Turn photos into one A4 PDF, then number its pages.",
    },
    steps: [{ slug: "image-to-pdf" }, { slug: "add-page-numbers" }],
  },
  {
    id: "phone-photos",
    name: { ar: "صور الهاتف", en: "Phone photos" },
    description: {
      ar: "تدوير 90°، ثم تصغير إلى 2048 بكسل كحد أقصى، ثم ضغط لحجم صغير.",
      en: "Rotate 90°, shrink to at most 2048 px, then compress to a small size.",
    },
    steps: [
      { slug: "rotate-image" },
      { slug: "resize-image", settings: { mode: "max", maxWidth: 2048, maxHeight: 2048, noUpscale: true } },
      { slug: "compress-image", settings: { preset: "small", quality: 60, colors: 128 } },
    ],
  },
];

export function getWorkflowPreset(id: string): WorkflowPreset | undefined {
  return WORKFLOW_PRESETS.find((p) => p.id === id);
}
