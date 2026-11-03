import { describe, expect, it } from "vitest";
import {
  buildReportHtml,
  comparePageText,
  countWords,
  diffPixels,
  diffWords,
  escapeHtml,
  formatStamp,
  pageStatus,
  summarize,
  tokenize,
  wordKey,
  type DiffOp,
} from "./compare-core";

/** Rebuilds both sides from a diff, to check it is a valid edit script. */
function sides(ops: DiffOp[]) {
  const a: string[] = [];
  const b: string[] = [];
  for (const op of ops) {
    if (op.type !== "added") a.push(...op.words);
    if (op.type !== "removed") b.push(...op.words);
  }
  return { a, b };
}

const RLM = String.fromCharCode(0x200f); // right-to-left mark
const w = (s: string) => s.split(" ").filter(Boolean);

describe("words", () => {
  it("tokenizes on any whitespace and drops invisible-only tokens", () => {
    expect(tokenize("  one\ttwo\n three  ")).toEqual(["one", "two", "three"]);
    expect(tokenize(`a ${RLM} b`)).toEqual(["a", "b"]);
    expect(tokenize("")).toEqual([]);
    // Presentation forms come out as ordinary letters (lam-alef ligature → two letters).
    expect(tokenize("ﻣﻤﺘﺎز اﻷول")).toEqual(["ممتاز", "الأول"]);
  });

  it("compares Arabic presentation forms, tatweel and bidi marks as the same word", () => {
    expect(wordKey("ﻣﺮﺣﺒﺎ")).toBe(wordKey("مرحبا")); // presentation forms → letters
    expect(wordKey("الـعـربـيـة")).toBe(wordKey("العربية")); // tatweel
    expect(wordKey(`${RLM}سلام`)).toBe(wordKey("سلام"));
    // Diacritics and digits are real differences.
    expect(wordKey("عَلم")).not.toBe(wordKey("علم"));
    expect(wordKey("2024")).not.toBe(wordKey("2025"));
    expect(wordKey("x²")).not.toBe(wordKey("x2")); // only presentation forms are folded
    expect(wordKey("ﬁle")).toBe(wordKey("file"));
    // Persian yeh/keheh (same glyph in many fonts) match Arabic yeh/kaf; alef maksura doesn't.
    expect(wordKey("جید")).toBe(wordKey("جيد"));
    expect(wordKey("کتاب")).toBe(wordKey("كتاب"));
    expect(wordKey("على")).not.toBe(wordKey("علي"));
  });
});

describe("diffWords", () => {
  it("finds a single replaced word (English)", () => {
    const ops = diffWords(w("the quick brown fox"), w("the quick red fox"));
    expect(ops).toEqual([
      { type: "equal", words: ["the", "quick"] },
      { type: "removed", words: ["brown"] },
      { type: "added", words: ["red"] },
      { type: "equal", words: ["fox"] },
    ]);
  });

  it("finds added and removed Arabic words", () => {
    const a = w("بسم الله الرحمن الرحيم تقرير الطالب للفصل الأول");
    const b = w("بسم الله الرحمن الرحيم تقرير الطالب النهائي للفصل الثاني");
    const ops = diffWords(a, b);
    expect(ops.filter((o) => o.type === "added").flatMap((o) => o.words)).toEqual(["النهائي", "الثاني"]);
    expect(ops.filter((o) => o.type === "removed").flatMap((o) => o.words)).toEqual(["الأول"]);
    expect(sides(ops)).toEqual({ a, b });
  });

  it("treats the same Arabic text stored as presentation forms as unchanged", () => {
    const ops = diffWords(w("ﺍﻟﺴﻼﻡ ﻋﻠﻴﻜﻢ"), w("السلام عليكم"));
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe("equal");
  });

  it("handles mixed Arabic and English, empty sides and identical input", () => {
    expect(diffWords([], w("new words"))).toEqual([{ type: "added", words: ["new", "words"] }]);
    expect(diffWords(w("old words"), [])).toEqual([{ type: "removed", words: ["old", "words"] }]);
    expect(diffWords(w("Total المجموع 100"), w("Total المجموع 100"))).toEqual([{ type: "equal", words: ["Total", "المجموع", "100"] }]);
    const ops = diffWords(w("Total المجموع 100 دينار"), w("Total المجموع 150 دينار"));
    expect(countWords(ops, "removed")).toBe(1);
    expect(countWords(ops, "added")).toBe(1);
  });

  it("always returns a valid, minimal edit script (random cases)", () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed % n;
    };
    const vocab = ["a", "b", "c", "d", "كلمة", "نص", "x"];
    for (let t = 0; t < 300; t++) {
      const a = Array.from({ length: rnd(25) }, () => vocab[rnd(vocab.length)]);
      const b = Array.from({ length: rnd(25) }, () => vocab[rnd(vocab.length)]);
      const ops = diffWords(a, b);
      expect(sides(ops)).toEqual({ a, b });
      // Minimal: edits = n + m − 2·LCS.
      const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
      for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) lcs[i][j] = a[i - 1] === b[j - 1] ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      expect(countWords(ops, "added") + countWords(ops, "removed")).toBe(a.length + b.length - 2 * lcs[a.length][b.length]);
    }
  });

  it("falls back to whole-page removed + added beyond the edit limit, still valid", () => {
    const a = Array.from({ length: 50 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 50 }, (_, i) => `b${i}`);
    const ops = diffWords(a, b, 10);
    expect(sides(ops)).toEqual({ a, b });
    expect(countWords(ops, "removed")).toBe(50);
  });

  it("is fast on long pages with a few edits", () => {
    const a = Array.from({ length: 20000 }, (_, i) => `w${i % 977}`);
    const b = [...a];
    b.splice(5000, 3, "changed", "words");
    b.splice(15000, 0, "inserted");
    const t0 = performance.now();
    const ops = diffWords(a, b);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(countWords(ops, "removed")).toBe(3);
    expect(countWords(ops, "added")).toBe(3);
  });
});

describe("diffPixels", () => {
  const px = (...rgb: number[][]) => Uint8ClampedArray.from(rgb.flatMap((c) => [...c, 255]));
  it("counts changed pixels and colours removed red, added green", () => {
    const white = [255, 255, 255];
    const black = [0, 0, 0];
    const a = px(white, black, white, [250, 250, 250]);
    const b = px(white, white, black, white);
    const { changed, total, image } = diffPixels(a, b, 4, 1, 48);
    expect([changed, total]).toEqual([2, 4]);
    expect(Array.from(image.slice(4, 7))).toEqual([220, 38, 38]); // only in first
    expect(Array.from(image.slice(8, 11))).toEqual([22, 163, 74]); // only in second
    expect(image[12]).toBeGreaterThan(240); // tiny difference ignored → faint grey
  });

  it("colours content that is in both files but differs amber", () => {
    const { image } = diffPixels(px([30, 60, 200]), px([200, 60, 30]), 1, 1, 48);
    expect(Array.from(image.slice(0, 3))).toEqual([217, 119, 6]);
  });

  it("treats a missing page as blank", () => {
    const a = px([0, 0, 0], [255, 255, 255]);
    expect(diffPixels(a, null, 2, 1, 48).changed).toBe(1);
    expect(diffPixels(null, a, 2, 1, 48).image.slice(0, 3)).toEqual(Uint8ClampedArray.from([22, 163, 74]));
  });
});

describe("pages and report", () => {
  it("pairs pages by number and labels each one", () => {
    const same = comparePageText(1, { text: "Hello world" }, { text: "Hello world" });
    const changed = comparePageText(2, { text: "Total 100" }, { text: "Total 150" });
    const onlyA = comparePageText(3, { text: "Appendix" }, null);
    const onlyB = comparePageText(4, null, { text: "New page" });
    const scanned = comparePageText(5, { text: "" }, { text: "" });
    expect([same, changed, onlyA, onlyB, scanned].map(pageStatus)).toEqual(["same", "changed", "only-a", "only-b", "no-text"]);
    // A scan that looks identical in the picture comparison counts as the same.
    expect(pageStatus({ ...scanned, visual: 0 })).toBe("same");
    expect(pageStatus({ ...scanned, visual: 0.05 })).toBe("changed");
    expect(pageStatus({ ...same, visual: 0.00001 })).toBe("same"); // rendering noise
  });

  it("builds a self-contained HTML report with the differences (Arabic UI)", () => {
    const pages = [
      comparePageText(1, { text: "تقرير الطالب للفصل الأول" }, { text: "تقرير الطالب للفصل الثاني" }),
      comparePageText(2, { text: "Same <b>text</b>" }, { text: "Same <b>text</b>" }),
      { ...comparePageText(3, { text: "" }, { text: "" }), visual: 0.12 },
      comparePageText(4, null, { text: "Extra page" }),
    ];
    pages[1].visual = 0;
    const html = buildReportHtml(
      {
        nameA: "نسخة 1.pdf",
        nameB: "نسخة <2>.pdf",
        pagesA: 3,
        pagesB: 4,
        pages,
        images: new Map([[3, "data:image/png;base64,AAAA"]]),
        visualIncluded: true,
        generatedAt: new Date(2026, 10, 4, 9, 5),
      },
      "ar",
    );
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("<del>الأول</del>");
    expect(html).toContain("<ins>الثاني</ins>");
    expect(html).toContain("<ins>Extra page</ins>");
    expect(html).toContain("نسخة &lt;2&gt;.pdf"); // names escaped
    expect(html).not.toContain("<b>text</b>"); // page text escaped (and identical page has no details)
    expect(html).toContain("عدد الصفحات مختلف: 3 في الملف الأول و4 في الملف الثاني");
    expect(html).toContain("لا يوجد نص في هذه الصفحة في كلا الملفين");
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain("2026-11-04 09:05");
    // Self-contained: no external resources or scripts.
    expect(html).not.toMatch(/<script|<link|https?:\/\/(?!www\.w3)/);
    expect(summarize(pages)).toMatchObject({ same: [2], changed: [1, 3], onlyA: [], onlyB: [4], noText: [3], added: 3, removed: 1 });
  });

  it("English report with no differences says so", () => {
    const html = buildReportHtml(
      { nameA: "a.pdf", nameB: "b.pdf", pagesA: 1, pagesB: 1, pages: [comparePageText(1, { text: "x" }, { text: "x" })], images: new Map(), visualIncluded: false, generatedAt: new Date() },
      "en",
    );
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain("No differences were found.");
    expect(html).toContain("Visual comparison not included");
  });

  it("escapes HTML and formats stamps with Latin digits", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    expect(formatStamp(new Date(2026, 0, 2, 3, 4))).toBe("2026-01-02 03:04");
  });
});
