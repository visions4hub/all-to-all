// Parses page-range text such as "1-3, 5, 8-" into 1-based page numbers.

export type PageRange = { start: number; end: number };

export type PageRangeError =
  | { code: "empty" }
  | { code: "syntax"; token: string }
  | { code: "out-of-bounds"; token: string; total: number }
  | { code: "reversed"; token: string };

export type RangeParseResult = { ok: true; ranges: PageRange[] } | { ok: false; error: PageRangeError };

export function toLatinDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Accepted forms (Arabic or Latin digits; "-", "–" or "—"; separators "," "،" or ";"):
 *   "5"    single page
 *   "2-7"  inclusive range
 *   "8-"   page 8 to the end
 *   "-3"   pages 1 to 3
 */
export function parsePageRanges(input: string, totalPages: number): RangeParseResult {
  const normalized = toLatinDigits(input).replace(/[–—]/g, "-");
  const tokens = normalized
    .split(/[,،;]+/)
    // Spaces around "-" are fine; spaces between digits ("1 2") are a syntax error, not page 12.
    .map((t) => t.trim().replace(/\s*-\s*/g, "-"))
    .filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: { code: "empty" } };

  const ranges: PageRange[] = [];
  for (const token of tokens) {
    let start: number;
    let end: number;
    const single = /^(\d+)$/.exec(token);
    const span = /^(\d*)-(\d*)$/.exec(token);
    if (single) {
      start = end = Number(single[1]);
    } else if (span && (span[1] !== "" || span[2] !== "")) {
      start = span[1] === "" ? 1 : Number(span[1]);
      end = span[2] === "" ? totalPages : Number(span[2]);
    } else {
      return { ok: false, error: { code: "syntax", token } };
    }
    if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
      return { ok: false, error: { code: "out-of-bounds", token, total: totalPages } };
    }
    if (start > end) return { ok: false, error: { code: "reversed", token } };
    ranges.push({ start, end });
  }
  return { ok: true, ranges };
}

/** Flattens ranges into sorted, de-duplicated page numbers. */
export function rangesToPages(ranges: PageRange[]): number[] {
  const set = new Set<number>();
  for (const r of ranges) for (let p = r.start; p <= r.end; p++) set.add(p);
  return [...set].sort((a, b) => a - b);
}

/** Groups pages into consecutive chunks of `size` ("split every N pages"). */
export function chunkPages(totalPages: number, size: number): PageRange[] {
  if (size < 1 || !Number.isInteger(size)) throw new Error("Chunk size must be a positive integer");
  const out: PageRange[] = [];
  for (let start = 1; start <= totalPages; start += size) {
    out.push({ start, end: Math.min(start + size - 1, totalPages) });
  }
  return out;
}

/** Compact text form: [1,2,3,5,7,8] → "1-3, 5, 7-8". */
export function pagesToRangeText(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? `${start}` : `${start}-${sorted[i]}`);
  }
  return parts.join(", ");
}
