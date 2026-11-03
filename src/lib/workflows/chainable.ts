import { ALL_TOOLS, getToolBySlug, isUsable } from "@/lib/tools/registry";
import type { Localized, ToolDefinition } from "@/lib/tools/types";
import { getToolLoader } from "@/tools/load";
import type { ToolModule } from "@/tools/types";

/**
 * Tools whose settings are made by hand on one specific file (drawing, placing,
 * filling fields, picking pages from thumbnails). They can't run unattended on
 * files produced by an earlier step, so they are not offered as steps.
 * Any other usable tool with a module becomes chainable automatically.
 */
export const NOT_CHAINABLE: Record<string, Localized> = {
  "photo-editor": {
    ar: "محرر تفاعلي: التعديلات تُرسم يدوياً على صورة واحدة.",
    en: "Interactive editor: edits are made by hand on one image.",
  },
  "blur-image": {
    ar: "مناطق التمويه تُرسم يدوياً على كل صورة.",
    en: "Blur areas are drawn by hand on each image.",
  },
  "meme-generator": {
    ar: "النصوص والصور تُوضع يدوياً على صورة واحدة.",
    en: "Captions and stickers are placed by hand on one image.",
  },
  "organize-pdf": {
    ar: "ترتيب الصفحات يتم بالسحب على صفحات ملف معروف مسبقاً.",
    en: "Pages are arranged by dragging the pages of a file you already have.",
  },
  "edit-pdf": {
    ar: "محرر تفاعلي: العناصر تُوضع يدوياً على الصفحات.",
    en: "Interactive editor: objects are placed by hand on the pages.",
  },
  "sign-pdf": {
    ar: "التوقيع يُرسم ويُوضع يدوياً على الصفحة.",
    en: "The signature is drawn and placed by hand on the page.",
  },
  "fill-pdf-forms": {
    ar: "الحقول تخص نموذجاً محدداً وتُملأ يدوياً.",
    en: "Fields belong to one specific form and are filled in by hand.",
  },
};

/** Usable and not interactive (registry only). The engine checks this before every step. */
export function canRunInChain(tool: ToolDefinition): boolean {
  return isUsable(tool) && !NOT_CHAINABLE[tool.slug];
}

/** Whether a tool can be offered as a workflow step: runnable and has a module loader. */
export function isChainable(tool: ToolDefinition): boolean {
  return canRunInChain(tool) && !!getToolLoader(tool.slug);
}

/** A loaded module that replaces the whole workspace is interactive too. */
export function isModuleChainable(module: ToolModule<unknown>): boolean {
  return !module.Workspace;
}

export function chainableTools(): ToolDefinition[] {
  return ALL_TOOLS.filter(isChainable);
}

/** Usable tools that can't be steps, with the reason shown to the user. */
export function notChainableTools(): { tool: ToolDefinition; reason: Localized }[] {
  return ALL_TOOLS.filter((t) => isUsable(t) && !isChainable(t)).map((tool) => ({
    tool,
    reason: NOT_CHAINABLE[tool.slug] ?? { ar: "تعمل في واجهتها الخاصة فقط.", en: "Works only in its own page." },
  }));
}

export function chainableBySlug(slug: string): ToolDefinition | undefined {
  const tool = getToolBySlug(slug);
  return tool && isChainable(tool) ? tool : undefined;
}
