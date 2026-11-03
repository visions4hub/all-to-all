import { describe, expect, it } from "vitest";
import { chunkPages, pagesToRangeText, parsePageRanges, rangesToPages, toLatinDigits } from "./page-ranges";

describe("parsePageRanges", () => {
  it("parses ranges and single pages", () => {
    expect(parsePageRanges("1-3,5", 10)).toEqual({
      ok: true,
      ranges: [
        { start: 1, end: 3 },
        { start: 5, end: 5 },
      ],
    });
  });

  it("ignores spaces around numbers, dashes and separators", () => {
    expect(parsePageRanges("  1 - 3 ,  5 ", 10)).toEqual(parsePageRanges("1-3,5", 10));
  });

  it("rejects spaces between digits instead of joining them", () => {
    // "1 2" must not silently become page 12.
    expect(parsePageRanges("1 2", 20)).toEqual({ ok: false, error: { code: "syntax", token: "1 2" } });
    expect(parsePageRanges("1 - 1 0", 20)).toMatchObject({ ok: false, error: { code: "syntax" } });
  });

  it("accepts Arabic-Indic digits and the Arabic comma", () => {
    expect(parsePageRanges("١-٣، ٥", 10)).toEqual(parsePageRanges("1-3,5", 10));
  });

  it("accepts Persian digits", () => {
    expect(parsePageRanges("۲-۴", 10)).toEqual({ ok: true, ranges: [{ start: 2, end: 4 }] });
  });

  it("accepts en and em dashes and semicolons", () => {
    expect(parsePageRanges("2–4; 6—7", 10)).toEqual({
      ok: true,
      ranges: [
        { start: 2, end: 4 },
        { start: 6, end: 7 },
      ],
    });
  });

  it("supports open-ended ranges", () => {
    expect(parsePageRanges("8-", 10)).toEqual({ ok: true, ranges: [{ start: 8, end: 10 }] });
    expect(parsePageRanges("-3", 10)).toEqual({ ok: true, ranges: [{ start: 1, end: 3 }] });
  });

  it("reports out-of-bounds pages", () => {
    expect(parsePageRanges("11", 10)).toEqual({ ok: false, error: { code: "out-of-bounds", token: "11", total: 10 } });
    expect(parsePageRanges("0", 10)).toMatchObject({ ok: false, error: { code: "out-of-bounds" } });
    expect(parsePageRanges("5-12", 10)).toMatchObject({ ok: false, error: { code: "out-of-bounds", token: "5-12" } });
    expect(parsePageRanges("12-", 10)).toMatchObject({ ok: false, error: { code: "out-of-bounds" } });
  });

  it("reports reversed ranges", () => {
    expect(parsePageRanges("5-2", 10)).toEqual({ ok: false, error: { code: "reversed", token: "5-2" } });
  });

  it("reports syntax errors", () => {
    for (const bad of ["a", "1--2", "-", "1-2-3", "1.5", "3a"]) {
      expect(parsePageRanges(bad, 10), bad).toMatchObject({ ok: false, error: { code: "syntax" } });
    }
  });

  it("reports the first bad token", () => {
    expect(parsePageRanges("1-2, x, 99", 10)).toEqual({ ok: false, error: { code: "syntax", token: "x" } });
  });

  it("reports empty input", () => {
    expect(parsePageRanges("", 10)).toEqual({ ok: false, error: { code: "empty" } });
    expect(parsePageRanges("  , ،; ", 10)).toEqual({ ok: false, error: { code: "empty" } });
  });

  it("handles a one-page document", () => {
    expect(parsePageRanges("1", 1)).toEqual({ ok: true, ranges: [{ start: 1, end: 1 }] });
    expect(parsePageRanges("1-", 1)).toEqual({ ok: true, ranges: [{ start: 1, end: 1 }] });
    expect(parsePageRanges("-1", 1)).toEqual({ ok: true, ranges: [{ start: 1, end: 1 }] });
    expect(parsePageRanges("2", 1)).toMatchObject({ ok: false, error: { code: "out-of-bounds", total: 1 } });
  });
});

describe("toLatinDigits", () => {
  it("converts Arabic-Indic and Persian digits", () => {
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
    expect(toLatinDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(toLatinDigits("abc 12")).toBe("abc 12");
  });
});

describe("rangesToPages", () => {
  it("flattens, de-duplicates and sorts", () => {
    expect(
      rangesToPages([
        { start: 5, end: 7 },
        { start: 1, end: 2 },
        { start: 6, end: 8 },
        { start: 2, end: 2 },
      ]),
    ).toEqual([1, 2, 5, 6, 7, 8]);
    expect(rangesToPages([])).toEqual([]);
  });
});

describe("chunkPages", () => {
  it("splits into consecutive chunks with a shorter last chunk", () => {
    expect(chunkPages(10, 3)).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 6 },
      { start: 7, end: 9 },
      { start: 10, end: 10 },
    ]);
  });

  it("handles exact multiples, size 1, size larger than total, and empty documents", () => {
    expect(chunkPages(4, 2)).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 4 },
    ]);
    expect(chunkPages(3, 1)).toHaveLength(3);
    expect(chunkPages(3, 10)).toEqual([{ start: 1, end: 3 }]);
    expect(chunkPages(0, 2)).toEqual([]);
  });

  it("throws for invalid sizes", () => {
    expect(() => chunkPages(10, 0)).toThrow();
    expect(() => chunkPages(10, -2)).toThrow();
    expect(() => chunkPages(10, 1.5)).toThrow();
    expect(() => chunkPages(10, NaN)).toThrow();
  });
});

describe("pagesToRangeText", () => {
  it("builds compact text", () => {
    expect(pagesToRangeText([1, 2, 3, 5, 7, 8])).toBe("1-3, 5, 7-8");
  });

  it("sorts and de-duplicates", () => {
    expect(pagesToRangeText([8, 3, 1, 2, 2, 7])).toBe("1-3, 7-8");
  });

  it("handles empty and single pages", () => {
    expect(pagesToRangeText([])).toBe("");
    expect(pagesToRangeText([4])).toBe("4");
  });

  it("round-trips through parsePageRanges", () => {
    const pages = [1, 2, 3, 5, 9, 10];
    const parsed = parsePageRanges(pagesToRangeText(pages), 10);
    expect(parsed.ok && rangesToPages(parsed.ranges)).toEqual(pages);
  });
});
