import type { ToolDefinition } from "./types";

/**
 * Normalizes text for forgiving Arabic/English search:
 * removes diacritics and tatweel, unifies alef / ya / ta-marbuta / hamza forms,
 * lowercases Latin, converts Arabic-Indic digits.
 */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "") // harakat, superscript alef, tatweel
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Arabic definite article "ال" is optional when matching words. */
function stripArticle(word: string) {
  return word.length > 3 && word.startsWith("ال") ? word.slice(2) : word;
}

function haystack(tool: ToolDefinition): string {
  return normalizeSearchText(
    [
      tool.name.ar,
      tool.name.en,
      tool.description.ar,
      tool.description.en,
      ...tool.keywords.ar,
      ...tool.keywords.en,
      ...tool.outputs,
      ...tool.accepts,
      tool.category,
    ].join(" "),
  );
}

/**
 * Returns tools matching every word of the query, best matches first.
 * A name match outranks a keyword match, which outranks a description match.
 */
export function searchTools(tools: ToolDefinition[], query: string): ToolDefinition[] {
  const words = normalizeSearchText(query).split(" ").filter(Boolean).map(stripArticle);
  if (words.length === 0) return tools;

  const scored = tools
    .map((tool) => {
      const hay = haystack(tool);
      const hayWords = hay.split(" ").map(stripArticle).join(" ");
      if (!words.every((w) => hayWords.includes(w))) return null;
      const names = normalizeSearchText(`${tool.name.ar} ${tool.name.en}`);
      const keywords = normalizeSearchText([...tool.keywords.ar, ...tool.keywords.en].join(" "));
      let score = 0;
      for (const w of words) {
        if (names.includes(w)) score += 3;
        else if (keywords.includes(w)) score += 2;
        else score += 1;
      }
      return { tool, score };
    })
    .filter((x): x is { tool: ToolDefinition; score: number } => x !== null);

  return scored.sort((a, b) => b.score - a.score).map((x) => x.tool);
}
