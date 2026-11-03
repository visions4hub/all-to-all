import { describe, expect, it } from "vitest";
import { applyCustomName, buildOutputName, dedupeNames, sanitizeBaseName, splitExtension } from "./filename";

describe("splitExtension", () => {
  it("splits on the last dot and lowercases the extension", () => {
    expect(splitExtension("report.PDF")).toEqual({ base: "report", ext: "pdf" });
    expect(splitExtension("archive.tar.gz")).toEqual({ base: "archive.tar", ext: "gz" });
    expect(splitExtension("تقرير الطالب.pdf")).toEqual({ base: "تقرير الطالب", ext: "pdf" });
  });

  it("handles names without an extension, dotfiles and trailing dots", () => {
    expect(splitExtension("README")).toEqual({ base: "README", ext: "" });
    expect(splitExtension(".env")).toEqual({ base: ".env", ext: "" });
    expect(splitExtension("file.")).toEqual({ base: "file.", ext: "" });
    expect(splitExtension("  photo.jpg  ")).toEqual({ base: "photo", ext: "jpg" });
  });
});

describe("sanitizeBaseName", () => {
  it("replaces characters invalid on common file systems", () => {
    expect(sanitizeBaseName('a\\b/c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
  });

  it("replaces control characters", () => {
    expect(sanitizeBaseName("a\u0000b\u001fc\u007fd")).toBe("a_b_c_d");
  });

  it("collapses whitespace and removes trailing dots and spaces", () => {
    expect(sanitizeBaseName("  my   file  ")).toBe("my file");
    expect(sanitizeBaseName("name...")).toBe("name");
    expect(sanitizeBaseName("name. . .")).toBe("name");
  });

  it("uses the fallback for empty and reserved Windows names", () => {
    expect(sanitizeBaseName("")).toBe("file");
    expect(sanitizeBaseName("   ")).toBe("file");
    expect(sanitizeBaseName("...")).toBe("file");
    expect(sanitizeBaseName("CON")).toBe("file");
    expect(sanitizeBaseName("nul")).toBe("file");
    expect(sanitizeBaseName("com1", "out")).toBe("out");
    expect(sanitizeBaseName("LPT9 ")).toBe("file");
    // Only exact reserved names are blocked.
    expect(sanitizeBaseName("console")).toBe("console");
  });

  it("caps the length at 150 characters (code points)", () => {
    expect(sanitizeBaseName("a".repeat(200))).toHaveLength(150);
    expect(Array.from(sanitizeBaseName("ب".repeat(200)))).toHaveLength(150);
    // Emoji are cut on code-point boundaries, never leaving half a surrogate pair.
    expect(sanitizeBaseName("😀".repeat(160))).toBe("😀".repeat(150));
  });

  it("preserves Arabic and other Unicode text", () => {
    expect(sanitizeBaseName("تقرير الطالب")).toBe("تقرير الطالب");
    expect(sanitizeBaseName("صورة ١٢٣")).toBe("صورة ١٢٣");
    expect(sanitizeBaseName("日本語 ✓")).toBe("日本語 ✓");
  });

  it("normalizes to NFC", () => {
    expect(sanitizeBaseName("Café")).toBe("Café");
  });
});

describe("buildOutputName", () => {
  it("adds a suffix before the extension, keeping Arabic names", () => {
    expect(buildOutputName("تقرير الطالب.pdf", { suffix: "merged" })).toBe("تقرير الطالب-merged.pdf");
    expect(buildOutputName("تقرير.pdf", { suffix: "مضغوط" })).toBe("تقرير-مضغوط.pdf");
  });

  it("keeps emoji and other Unicode names", () => {
    expect(buildOutputName("🎉 party.png", { suffix: "small" })).toBe("🎉 party-small.png");
  });

  it("overrides the extension (with or without a leading dot)", () => {
    expect(buildOutputName("photo.png", { ext: "jpg" })).toBe("photo.jpg");
    expect(buildOutputName("photo.png", { ext: ".WEBP" })).toBe("photo.webp");
    expect(buildOutputName("photo.PNG")).toBe("photo.png");
  });

  it("appends an index", () => {
    expect(buildOutputName("doc.pdf", { suffix: "page", index: 3 })).toBe("doc-page-3.pdf");
    expect(buildOutputName("doc.pdf", { index: 0 })).toBe("doc-0.pdf");
  });

  it("handles names without an extension and dotfiles", () => {
    expect(buildOutputName("notes", { suffix: "x" })).toBe("notes-x");
    expect(buildOutputName("notes", { ext: "txt" })).toBe("notes.txt");
    expect(buildOutputName(".env", { suffix: "copy" })).toBe(".env-copy");
  });

  it("sanitizes the base and the suffix", () => {
    expect(buildOutputName("a:b.pdf", { suffix: "c/d" })).toBe("a_b-c_d.pdf");
    expect(buildOutputName("CON.pdf")).toBe("file.pdf");
    expect(buildOutputName("x.pdf", { suffix: "..." })).toBe("x-out.pdf");
  });
});

describe("applyCustomName", () => {
  it("adds the required extension", () => {
    expect(applyCustomName("report", "pdf", "fallback.pdf")).toBe("report.pdf");
    expect(applyCustomName("تقريري", "pdf", "fallback.pdf")).toBe("تقريري.pdf");
  });

  it("does not double the extension when the user already typed it", () => {
    expect(applyCustomName("report.pdf", "pdf", "fallback.pdf")).toBe("report.pdf");
    expect(applyCustomName("report.PDF", "pdf", "fallback.pdf")).toBe("report.pdf");
  });

  it("keeps a different typed extension as part of the name", () => {
    expect(applyCustomName("photo.png", "jpg", "fallback.jpg")).toBe("photo.png.jpg");
  });

  it("sanitizes the name and falls back when nothing usable is left", () => {
    expect(applyCustomName("a/b", "pdf", "fallback.pdf")).toBe("a_b.pdf");
    expect(applyCustomName("   ", "pdf", "fallback.pdf")).toBe("fallback.pdf");
    expect(applyCustomName("CON", "pdf", "fallback.pdf")).toBe("fallback.pdf");
  });
});

describe("dedupeNames", () => {
  it("leaves unique names unchanged", () => {
    expect(dedupeNames(["a.pdf", "b.pdf", "تقرير.pdf"])).toEqual(["a.pdf", "b.pdf", "تقرير.pdf"]);
  });

  it("numbers duplicates", () => {
    expect(dedupeNames(["a.pdf", "a.pdf", "a.pdf"])).toEqual(["a.pdf", "a (2).pdf", "a (3).pdf"]);
  });

  it("treats names case-insensitively", () => {
    const out = dedupeNames(["a.pdf", "A.PDF", "a.Pdf"]);
    expect(out).toEqual(["a.pdf", "A (2).pdf", "a (3).pdf"]);
  });

  it("never produces a name that is already in the list", () => {
    expect(dedupeNames(["a.pdf", "a (2).pdf", "a.pdf"])).toEqual(["a.pdf", "a (2).pdf", "a (3).pdf"]);
    for (const list of [
      ["a.pdf", "a.pdf", "a (2).pdf"],
      ["a (2).pdf", "a.pdf", "A.pdf", "a (3).PDF"],
    ]) {
      const out = dedupeNames(list);
      expect(out).toHaveLength(list.length);
      expect(new Set(out.map((n) => n.toLowerCase())).size).toBe(list.length);
    }
  });

  it("handles names without an extension", () => {
    expect(dedupeNames(["notes", "notes"])).toEqual(["notes", "notes (2)"]);
  });

  it("returns an empty list for an empty list", () => {
    expect(dedupeNames([])).toEqual([]);
  });
});
