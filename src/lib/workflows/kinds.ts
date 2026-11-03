import { KIND_INFO, type FileKind } from "@/lib/files/detect";
import type { ToolDefinition } from "@/lib/tools/types";

/**
 * What can flow between workflow steps. File kinds come from magic-byte detection;
 * "txt" and "html" are outputs no current tool accepts (they end a chain).
 */
export type ChainKind = FileKind | "txt" | "html";

/** Registry output labels (ToolDefinition.outputs) → kinds. "ZIP" only means "several files". */
const LABEL_TO_KIND: Record<string, ChainKind> = {
  PDF: "pdf",
  JPG: "jpeg",
  JPEG: "jpeg",
  PNG: "png",
  WEBP: "webp",
  GIF: "gif",
  SVG: "svg",
  BMP: "bmp",
  TXT: "txt",
  HTML: "html",
};

const IMAGE_FORMATS = new Set<ChainKind>(["jpeg", "png", "webp"]);

/** Kinds a tool can produce, read from its registry `outputs`. */
export function toolOutputKinds(tool: ToolDefinition): ChainKind[] {
  const kinds = tool.outputs.map((label) => LABEL_TO_KIND[label.toUpperCase()]).filter((k): k is ChainKind => !!k);
  return [...new Set(kinds)];
}

/**
 * Best prediction of what a step will output for these incoming kinds.
 * Tools with a `format` setting (the image tools, PDF → image) produce that format;
 * "keep" keeps JPG/PNG/WebP and turns other images into PNG, as the image pipeline does.
 * Everything else falls back to the registry outputs. The run itself re-checks the real bytes.
 */
export function predictOutputKinds(tool: ToolDefinition, settings: unknown, incoming: ChainKind[]): ChainKind[] {
  const declared = toolOutputKinds(tool);
  const format = settings && typeof settings === "object" ? (settings as { format?: unknown }).format : undefined;
  if (typeof format === "string") {
    if (format === "keep") {
      const kept = [...new Set(incoming.map((k) => (IMAGE_FORMATS.has(k) ? k : "png")))].filter((k) => declared.includes(k));
      if (kept.length) return kept;
    } else if (declared.includes(format as ChainKind)) {
      return [format as ChainKind];
    }
  }
  return declared;
}

export function kindLabel(kind: ChainKind): string {
  if (kind === "txt") return "TXT";
  if (kind === "html") return "HTML";
  return KIND_INFO[kind]?.label ?? kind;
}
