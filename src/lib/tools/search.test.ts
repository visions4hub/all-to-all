import { describe, expect, it } from "vitest";
import { ALL_TOOLS } from "./registry";
import { normalizeSearchText, searchTools } from "./search";

const ids = (query: string) => searchTools(ALL_TOOLS, query).map((t) => t.id);

describe("normalizeSearchText", () => {
  it("removes harakat and tatweel", () => {
    expect(normalizeSearchText("قَسِّمْ")).toBe("قسم");
    expect(normalizeSearchText("دمـــج")).toBe("دمج");
  });

  it("unifies alef, ya, ta marbuta and hamza forms", () => {
    expect(normalizeSearchText("أإآٱ")).toBe("اااا");
    expect(normalizeSearchText("إلى")).toBe("الي");
    expect(normalizeSearchText("الصورة")).toBe("الصوره");
    expect(normalizeSearchText("مؤشر")).toBe("موشر");
    expect(normalizeSearchText("قارئ")).toBe("قاري");
  });

  it("converts Arabic-Indic digits and lowercases Latin", () => {
    expect(normalizeSearchText("صفحة ١٢٣")).toBe("صفحه 123");
    expect(normalizeSearchText("Merge PDF")).toBe("merge pdf");
  });

  it("turns punctuation into single spaces and trims", () => {
    expect(normalizeSearchText("  jpg → pdf!!  ")).toBe("jpg pdf");
    expect(normalizeSearchText("دمج، تقسيم")).toBe("دمج تقسيم");
  });
});

describe("searchTools (real registry)", () => {
  it("دمج PDF → pdf-merge first", () => {
    expect(ids("دمج PDF")[0]).toBe("pdf-merge");
  });

  it("تقسيم → pdf-split", () => {
    expect(ids("تقسيم")[0]).toBe("pdf-split");
  });

  it("ضغط الصور → image-compress first", () => {
    expect(ids("ضغط الصور")[0]).toBe("image-compress");
  });

  it("تدوير → both rotate tools", () => {
    expect(ids("تدوير")).toEqual(expect.arrayContaining(["pdf-rotate", "image-rotate"]));
  });

  it("قص → both crop tools", () => {
    expect(ids("قص")).toEqual(expect.arrayContaining(["image-crop", "pdf-crop"]));
  });

  it("تحويل PNG → image-convert first", () => {
    expect(ids("تحويل PNG")[0]).toBe("image-convert");
  });

  it("Remove Pages → pdf-remove-pages first", () => {
    expect(ids("Remove Pages")[0]).toBe("pdf-remove-pages");
  });

  it("Watermark → both watermark tools", () => {
    expect(ids("Watermark")).toEqual(expect.arrayContaining(["pdf-watermark", "image-watermark"]));
  });

  it("Resize → image-resize first", () => {
    expect(ids("Resize")[0]).toBe("image-resize");
  });

  it("Compress → both compress tools", () => {
    expect(ids("Compress")).toEqual(expect.arrayContaining(["pdf-compress", "image-compress"]));
  });

  it("is case-insensitive and ignores diacritics in the query", () => {
    expect(ids("MERGE")[0]).toBe("pdf-merge");
    expect(ids("دَمْج")[0]).toBe("pdf-merge");
  });

  it("makes the Arabic article ال optional", () => {
    const withoutArticle = ids("صوره");
    const withArticle = ids("الصورة");
    expect(withoutArticle.length).toBeGreaterThan(0);
    expect(withoutArticle).toEqual(expect.arrayContaining(["image-resize", "image-crop"]));
    expect(withArticle).toEqual(expect.arrayContaining(["image-resize", "image-crop"]));
  });

  it("requires every query word to match", () => {
    expect(ids("دمج صوره")).not.toContain("pdf-merge");
  });

  it("returns every tool for an empty or whitespace query", () => {
    expect(searchTools(ALL_TOOLS, "")).toEqual(ALL_TOOLS);
    expect(searchTools(ALL_TOOLS, "   ")).toEqual(ALL_TOOLS);
  });

  it("returns nothing for nonsense", () => {
    expect(searchTools(ALL_TOOLS, "zzqxwv")).toEqual([]);
    expect(searchTools(ALL_TOOLS, "ثثثثخ")).toEqual([]);
  });

  it("does not mutate the input list", () => {
    const before = ALL_TOOLS.map((t) => t.id);
    searchTools(ALL_TOOLS, "pdf");
    expect(ALL_TOOLS.map((t) => t.id)).toEqual(before);
  });
});
