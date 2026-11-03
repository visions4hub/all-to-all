import type { FileKind } from "@/lib/files/detect";

export type Locale = "ar" | "en";
export type Localized = Record<Locale, string>;

export type ToolCategory = "pdf" | "image";

/**
 * operational — built and its output verified by tests; the only status shown as usable.
 * beta        — built but not fully verified yet; usable, marked as such.
 * building    — part of Phase 1 but not built yet; listed, not clickable.
 * unsupported — cannot be done reliably in the browser in Phase 1.
 */
export type ToolStatus = "operational" | "beta" | "building" | "unsupported";

/** Names of icons in src/components/tool-icon.tsx. Keep them in sync. */
export type ToolIconName =
  | "merge"
  | "split"
  | "remove-pages"
  | "extract-pages"
  | "organize"
  | "rotate-pdf"
  | "page-numbers"
  | "watermark-pdf"
  | "crop-pdf"
  | "edit-pdf"
  | "image-to-pdf"
  | "pdf-to-image"
  | "pdf-text"
  | "pdf-forms"
  | "sign-pdf"
  | "compress-pdf"
  | "compare-pdf"
  | "compress-image"
  | "resize-image"
  | "crop-image"
  | "rotate-image"
  | "convert-image"
  | "photo-editor"
  | "watermark-image"
  | "meme"
  | "blur-image"
  | "metadata"
  | "gif";

export type ToolDefinition = {
  id: string; // stable, e.g. "pdf-merge"
  slug: string; // URL segment under /tools/
  category: ToolCategory;
  icon: ToolIconName;
  name: Localized;
  description: Localized;
  /** Extra search terms (both languages, synonyms, common misspellings). */
  keywords: { ar: string[]; en: string[] };
  /** File kinds the tool accepts. */
  accepts: FileKind[];
  /** Output formats as shown to users, e.g. ["PDF", "ZIP"]. */
  outputs: string[];
  minFiles: number;
  /** null = no artificial limit. */
  maxFiles: number | null;
  status: ToolStatus;
  /** Roadmap milestone that delivers it (2, 3 or 4). */
  milestone: 2 | 3 | 4;
  popular?: boolean;
  /** Honest limitation shown on the tool page, if any. */
  note?: Localized;
};
