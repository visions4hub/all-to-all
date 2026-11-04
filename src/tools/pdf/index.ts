import type { ToolModuleLoader } from "@/tools/types";

// PDF tool modules, keyed by tool slug (see src/lib/tools/pdf-tools.ts).
// Each module is loaded only when its tool page opens.
export const PDF_MODULES: Record<string, ToolModuleLoader> = {
  "merge-pdf": () => import("./merge"),
  "split-pdf": () => import("./split"),
  "remove-pages": () => import("./remove-pages"),
  "extract-pages": () => import("./extract-pages"),
  "organize-pdf": () => import("./organize"),
  "rotate-pdf": () => import("./rotate"),
  "add-page-numbers": () => import("./page-numbers"),
  "watermark-pdf": () => import("./watermark"),
  "crop-pdf": () => import("./crop"),
  "image-to-pdf": () => import("./image-to-pdf"),
  "pdf-to-image": () => import("./pdf-to-image"),
  "pdf-to-text": () => import("./pdf-to-text"),
  "fill-pdf-forms": () => import("./fill-forms"),
  "edit-pdf": () => import("./edit-pdf"),
  "sign-pdf": () => import("./sign-pdf"),
  "compress-pdf": () => import("./compress"),
  "compare-pdf": () => import("./compare"),
};
