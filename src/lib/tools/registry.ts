import type { FileKind } from "@/lib/files/detect";
import { IMAGE_TOOLS } from "./image-tools";
import { PDF_TOOLS } from "./pdf-tools";
import type { ToolCategory, ToolDefinition } from "./types";

export const ALL_TOOLS: ToolDefinition[] = [...PDF_TOOLS, ...IMAGE_TOOLS];

const BY_SLUG = new Map(ALL_TOOLS.map((t) => [t.slug, t]));

export function getToolBySlug(slug: string): ToolDefinition | undefined {
  return BY_SLUG.get(slug);
}

export function toolsInCategory(category: ToolCategory): ToolDefinition[] {
  return ALL_TOOLS.filter((t) => t.category === category);
}

/** Tools a user can open and run now. */
export function isUsable(tool: ToolDefinition): boolean {
  return tool.status === "operational" || tool.status === "beta";
}

/** Tools that accept a given file kind; usable ones first, then by popularity. */
export function toolsForKind(kind: FileKind): ToolDefinition[] {
  return ALL_TOOLS.filter((t) => t.accepts.includes(kind)).sort(
    (a, b) => Number(isUsable(b)) - Number(isUsable(a)) || Number(!!b.popular) - Number(!!a.popular),
  );
}

export function popularTools(): ToolDefinition[] {
  return ALL_TOOLS.filter((t) => t.popular);
}

/** Accept attribute for <input type="file"> built from file kinds. */
export function acceptAttribute(kinds: FileKind[]): string {
  const map: Partial<Record<FileKind, string>> = {
    pdf: "application/pdf,.pdf",
    jpeg: "image/jpeg,.jpg,.jpeg",
    png: "image/png,.png",
    webp: "image/webp,.webp",
    gif: "image/gif,.gif",
    svg: "image/svg+xml,.svg",
    bmp: "image/bmp,.bmp",
  };
  return [...new Set(kinds.map((k) => map[k]).filter(Boolean))].join(",");
}
