import type { ToolModuleLoader } from "@/tools/types";

// Image tool modules, keyed by tool slug (see src/lib/tools/image-tools.ts).
// Each module is loaded only when its tool page opens.
// Example: "compress-image": () => import("./compress"),
export const IMAGE_MODULES: Record<string, ToolModuleLoader> = {};
