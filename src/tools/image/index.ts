import type { ToolModuleLoader } from "@/tools/types";

// Image tool modules, keyed by tool slug (see src/lib/tools/image-tools.ts).
// Each module is loaded only when its tool page opens.
export const IMAGE_MODULES: Record<string, ToolModuleLoader> = {
  "compress-image": () => import("./compress"),
  "resize-image": () => import("./resize"),
  "rotate-image": () => import("./rotate"),
  "convert-image": () => import("./convert"),
  "crop-image": () => import("./crop"),
  "watermark-image": () => import("./watermark"),
  "blur-image": () => import("./blur"),
  "meme-generator": () => import("./meme"),
  "photo-editor": () => import("./photo-editor"),
};
