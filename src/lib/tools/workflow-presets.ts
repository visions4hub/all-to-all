import type { Localized } from "./types";

/** Example chains for the workflow builder (milestone 4). Steps are tool slugs. */
export const WORKFLOW_PRESETS: { id: string; name: Localized; steps: string[] }[] = [
  { id: "web-ready", name: { ar: "صور جاهزة للنشر", en: "Web-ready images" }, steps: ["resize-image", "compress-image", "watermark-image"] },
  { id: "crop-convert", name: { ar: "قص وتحويل", en: "Crop and convert" }, steps: ["crop-image", "convert-image"] },
  { id: "pdf-package", name: { ar: "ملف PDF موحّد ومرقّم", en: "Merged, numbered PDF" }, steps: ["merge-pdf", "add-page-numbers", "watermark-pdf"] },
  { id: "scan-to-pdf", name: { ar: "صور إلى PDF مرتب", en: "Photos to tidy PDF" }, steps: ["image-to-pdf", "organize-pdf"] },
  { id: "phone-photos", name: { ar: "صور الهاتف", en: "Phone photos" }, steps: ["rotate-image", "resize-image", "compress-image"] },
];
