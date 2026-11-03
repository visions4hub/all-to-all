import { IMAGE_MODULES } from "./image";
import { PDF_MODULES } from "./pdf";
import type { ToolModuleLoader } from "./types";

const LOADERS: Record<string, ToolModuleLoader> = { ...PDF_MODULES, ...IMAGE_MODULES };

export function getToolLoader(slug: string): ToolModuleLoader | undefined {
  return LOADERS[slug];
}
