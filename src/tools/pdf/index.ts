import type { ToolModuleLoader } from "@/tools/types";

// PDF tool modules, keyed by tool slug (see src/lib/tools/pdf-tools.ts).
// Each module is loaded only when its tool page opens.
// Example: "merge-pdf": () => import("./merge"),
export const PDF_MODULES: Record<string, ToolModuleLoader> = {};
