import type { Localized } from "@/lib/i18n";
import { parsePageRanges, rangesToPages, type PageRangeError } from "@/lib/pdf/page-ranges";

/** "Which pages" setting shared by many tools. */
export type PageSelection = { scope: "all" | "custom"; ranges: string };

export const ALL_PAGES: PageSelection = { scope: "all", ranges: "" };

export function rangeErrorText(error: PageRangeError): Localized {
  switch (error.code) {
    case "empty":
      return { ar: "اكتب أرقام الصفحات، مثل 1-3, 5", en: "Type page numbers, e.g. 1-3, 5" };
    case "syntax":
      return { ar: `صيغة غير مفهومة: «${error.token}»`, en: `Can't read “${error.token}”` };
    case "out-of-bounds":
      return {
        ar: `«${error.token}» خارج الملف؛ عدد الصفحات ${error.total}`,
        en: `“${error.token}” is outside the file; it has ${error.total} pages`,
      };
    case "reversed":
      return { ar: `النطاق «${error.token}» مقلوب؛ اكتب الأصغر أولاً`, en: `“${error.token}” is reversed; put the smaller number first` };
  }
}

/** Resolves a selection to sorted 1-based page numbers. */
export function resolvePages(sel: PageSelection, total: number): { ok: true; pages: number[] } | { ok: false; error: Localized } {
  if (sel.scope === "all") return { ok: true, pages: Array.from({ length: total }, (_, i) => i + 1) };
  const parsed = parsePageRanges(sel.ranges, total);
  if (!parsed.ok) return { ok: false, error: rangeErrorText(parsed.error) };
  return { ok: true, pages: rangesToPages(parsed.ranges) };
}

/** Splits sorted pages into runs of consecutive numbers: [1,2,3,7,8] → [[1,2,3],[7,8]]. */
export function consecutiveRuns(pages: number[]): number[][] {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const p of sorted) {
    const last = runs[runs.length - 1];
    if (last && p === last[last.length - 1] + 1) last.push(p);
    else runs.push([p]);
  }
  return runs;
}

/** Toggles a page in a selection; with `extendFrom`, selects the whole span (shift-click). */
export function togglePage(selected: number[], page: number, extendFrom?: number): number[] {
  const set = new Set(selected);
  if (extendFrom !== undefined && extendFrom !== page) {
    const [a, b] = extendFrom < page ? [extendFrom, page] : [page, extendFrom];
    for (let p = a; p <= b; p++) set.add(p);
  } else if (set.has(page)) set.delete(page);
  else set.add(page);
  return [...set].sort((x, y) => x - y);
}
