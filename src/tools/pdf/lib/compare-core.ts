// Compare PDF: pure logic shared by the preview, the worker and the report.
// No DOM, no PDF.js here, so all of it is tested in Node.

import type { Localized } from "@/lib/i18n";

// ---- Words -----------------------------------------------------------------------

// Tatweel (kashida) only stretches Arabic letters; zero-width and bidi marks are invisible.
/** A regex character class from [from, to] code point ranges (keeps invisible characters out of the source). */
function charClass(ranges: [number, number][], flags: string): RegExp {
  return new RegExp(`[${ranges.map(([a, b]) => (a === b ? String.fromCharCode(a) : `${String.fromCharCode(a)}-${String.fromCharCode(b)}`)).join("")}]`, flags);
}

const INVISIBLE = charClass([[0x0640, 0x0640], [0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]], "g");

// Presentation forms: Latin ligatures (ﬁ), Hebrew and Arabic contextual letter shapes and
// ligatures (ﻣ ﻷ ﷲ). Many PDFs, including Chrome's, store Arabic this way.
const PRESENTATION_FORMS = charClass([[0xfb00, 0xfb06], [0xfb13, 0xfb17], [0xfb1d, 0xfdff], [0xfe70, 0xfefe]], "g");

/** Turns presentation forms into ordinary letters ("ﻣﺮﺣﺒﺎ" → "مرحبا"); nothing else changes. */
export function foldForms(word: string): string {
  return word.replace(PRESENTATION_FORMS, (m) => m.normalize("NFKC"));
}

// Fonts often share one glyph for Persian and Arabic yeh/kaf, so a PDF may give either
// code point for the same visible letter. Alef maksura (ى) stays distinct: على ≠ علي.
const PERSIAN_YEH = new RegExp(String.fromCharCode(0x06cc), "g");
const KEHEH = new RegExp(String.fromCharCode(0x06a9), "g");

/**
 * The form a word is compared in: presentation forms folded, Persian yeh/keheh read as
 * Arabic yeh/kaf, tatweel and invisible marks ignored. Case, digits, superscripts,
 * punctuation and diacritics still count as changes.
 */
export function wordKey(word: string): string {
  return foldForms(word).replace(INVISIBLE, "").replace(PERSIAN_YEH, String.fromCharCode(0x064a)).replace(KEHEH, String.fromCharCode(0x0643));
}

/** Splits page text into words (any whitespace separates them), presentation forms folded. */
export function tokenize(text: string): string[] {
  return text
    .split(/\s+/u)
    .filter((w) => w.replace(INVISIBLE, "") !== "")
    .map(foldForms);
}

export type DiffOp = { type: "equal" | "added" | "removed"; words: string[] };

/** Above this many edits a page counts as rewritten: shown as all removed + all added. */
export const MAX_EDITS = 4000;

/**
 * Word-level diff (Myers' O(ND) algorithm on the compared keys). Common words at the
 * start and end are matched first. Equal and removed words are shown as in `a`, added
 * words as in `b`.
 */
export function diffWords(a: string[], b: string[], maxEdits = MAX_EDITS): DiffOp[] {
  const ka = a.map(wordKey);
  const kb = b.map(wordKey);
  let start = 0;
  while (start < ka.length && start < kb.length && ka[start] === kb[start]) start++;
  let endA = ka.length;
  let endB = kb.length;
  while (endA > start && endB > start && ka[endA - 1] === kb[endB - 1]) {
    endA--;
    endB--;
  }
  const ops: DiffOp[] = [];
  const push = (type: DiffOp["type"], word: string) => {
    const last = ops[ops.length - 1];
    if (last?.type === type) last.words.push(word);
    else ops.push({ type, words: [word] });
  };
  for (let i = 0; i < start; i++) push("equal", a[i]);
  for (const [type, i] of myers(ka.slice(start, endA), kb.slice(start, endB), maxEdits)) push(type, type === "added" ? b[start + i] : a[start + i]);
  for (let i = endA; i < a.length; i++) push("equal", a[i]);
  return ops;
}

/** Edit script between a and b as [type, index] (index into a for equal/removed, into b for added). */
function myers(a: string[], b: string[], maxEdits: number): [DiffOp["type"], number][] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((_, i) => ["added", i]);
  if (m === 0) return a.map((_, i) => ["removed", i]);
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  // snaps[d] = v[-d..d] after round d, for walking back.
  const snaps: Int32Array[] = [];
  for (let d = 0; d <= Math.min(max, maxEdits); d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        snaps.push(v.slice(off - d, off + d + 1));
        return backtrack(snaps, n, m);
      }
    }
    snaps.push(v.slice(off - d, off + d + 1));
  }
  // Too different to align word by word.
  return [...a.map((_, i) => ["removed", i] as [DiffOp["type"], number]), ...b.map((_, i) => ["added", i] as [DiffOp["type"], number])];
}

function backtrack(snaps: Int32Array[], n: number, m: number): [DiffOp["type"], number][] {
  const out: [DiffOp["type"], number][] = [];
  let x = n;
  let y = m;
  for (let d = snaps.length - 1; d > 0; d--) {
    const prev = snaps[d - 1];
    const at = (k: number) => prev[k + d - 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push(["equal", --x]);
      y--;
    }
    if (x === prevX) out.push(["added", --y]);
    else out.push(["removed", --x]);
  }
  while (x > 0 && y > 0) {
    out.push(["equal", --x]);
    y--;
  }
  return out.reverse();
}

export function countWords(ops: DiffOp[], type: DiffOp["type"]): number {
  return ops.reduce((n, op) => (op.type === type ? n + op.words.length : n), 0);
}

// ---- Pixels ----------------------------------------------------------------------

export const SENSITIVITY = { low: 96, normal: 48, high: 16 } as const;
export type Sensitivity = keyof typeof SENSITIVITY;

export const DIFF_COLORS = { removed: [220, 38, 38], added: [22, 163, 74], changed: [217, 119, 6] } as const;

/** Lighter than this (0–255 luminance) counts as empty paper. */
const PAPER = 235;

/**
 * Compares two renders of the same size (RGBA). A pixel counts as changed when any
 * channel differs by more than `threshold`. In the returned picture, unchanged pixels
 * are a faint grey copy of the page; content only in the first file is red, content
 * only in the second is green, and content in both that differs (e.g. a new colour) is amber.
 * A missing page (null) is treated as blank white.
 */
export function diffPixels(a: Uint8ClampedArray | null, b: Uint8ClampedArray | null, width: number, height: number, threshold: number) {
  const total = width * height;
  const image = new Uint8ClampedArray(total * 4);
  let changed = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const ra = a ? a[o] : 255;
    const ga = a ? a[o + 1] : 255;
    const ba = a ? a[o + 2] : 255;
    const rb = b ? b[o] : 255;
    const gb = b ? b[o + 1] : 255;
    const bb = b ? b[o + 2] : 255;
    const delta = Math.max(Math.abs(ra - rb), Math.abs(ga - gb), Math.abs(ba - bb));
    if (delta > threshold) {
      changed++;
      const lumA = 0.299 * ra + 0.587 * ga + 0.114 * ba;
      const lumB = 0.299 * rb + 0.587 * gb + 0.114 * bb;
      const c = lumA < PAPER && lumB < PAPER ? DIFF_COLORS.changed : lumA < lumB ? DIFF_COLORS.removed : DIFF_COLORS.added;
      image[o] = c[0];
      image[o + 1] = c[1];
      image[o + 2] = c[2];
    } else {
      const lum = 0.299 * rb + 0.587 * gb + 0.114 * bb;
      const faint = 255 - (255 - lum) * 0.22;
      image[o] = image[o + 1] = image[o + 2] = faint;
    }
    image[o + 3] = 255;
  }
  return { changed, total, image };
}

// ---- Pages -----------------------------------------------------------------------

export type PageText = { text: string } | null;

export type PageResult = {
  page: number;
  /** The page exists in the first / second file. */
  inA: boolean;
  inB: boolean;
  /** The page has extractable text in the first / second file. */
  textA: boolean;
  textB: boolean;
  ops: DiffOp[];
  added: number;
  removed: number;
  /** Share of pixels that differ (0–1), when a visual comparison ran. */
  visual: number | null;
  /** Visible page sizes (points) differ. */
  sizeDiffers: boolean;
};

export type PageStatus = "same" | "changed" | "only-a" | "only-b" | "no-text";

/** Text comparison of one page position. Pages are paired by number. */
export function comparePageText(page: number, a: PageText, b: PageText): PageResult {
  const wordsA = a ? tokenize(a.text) : [];
  const wordsB = b ? tokenize(b.text) : [];
  const ops = diffWords(wordsA, wordsB);
  return {
    page,
    inA: !!a,
    inB: !!b,
    textA: wordsA.length > 0,
    textB: wordsB.length > 0,
    ops,
    added: countWords(ops, "added"),
    removed: countWords(ops, "removed"),
    visual: null,
    sizeDiffers: false,
  };
}

/** Pixel share above which a page is reported as visually changed (ignores rendering noise). */
export const VISUAL_CHANGE_MIN = 0.0002;

export function pageStatus(p: PageResult): PageStatus {
  if (!p.inA) return "only-b";
  if (!p.inB) return "only-a";
  const visual = p.visual !== null && p.visual > VISUAL_CHANGE_MIN;
  if (p.added || p.removed || visual || p.sizeDiffers) return "changed";
  // Neither page has text and no picture comparison says they match: we can't tell.
  if (!p.textA && !p.textB && p.visual === null) return "no-text";
  return "same";
}

export const STATUS_LABELS: Record<PageStatus, Localized> = {
  same: { ar: "متطابقة", en: "Identical" },
  changed: { ar: "فيها فروقات", en: "Changed" },
  "only-a": { ar: "في الملف الأول فقط", en: "Only in the first file" },
  "only-b": { ar: "في الملف الثاني فقط", en: "Only in the second file" },
  "no-text": { ar: "بلا نص (ممسوحة ضوئياً؟)", en: "No text (scanned?)" },
};

// ---- Report ----------------------------------------------------------------------

export type ReportInput = {
  nameA: string;
  nameB: string;
  pagesA: number;
  pagesB: number;
  pages: PageResult[];
  /** Difference pictures (data: URLs) by page number, for visually changed pages. */
  images: Map<number, string>;
  visualIncluded: boolean;
  generatedAt: Date;
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Date and time with Latin digits, e.g. 2026-11-04 14:05. */
export function formatStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function summarize(pages: PageResult[]) {
  const by = (s: PageStatus) => pages.filter((p) => pageStatus(p) === s).map((p) => p.page);
  return {
    same: by("same"),
    changed: by("changed"),
    onlyA: by("only-a"),
    onlyB: by("only-b"),
    noText: pages.filter((p) => p.inA && p.inB && (!p.textA || !p.textB)).map((p) => p.page),
    added: pages.reduce((n, p) => n + p.added, 0),
    removed: pages.reduce((n, p) => n + p.removed, 0),
  };
}

function diffHtml(ops: DiffOp[]): string {
  return ops
    .map((op) => {
      const text = escapeHtml(op.words.join(" "));
      if (op.type === "added") return `<ins>${text}</ins>`;
      if (op.type === "removed") return `<del>${text}</del>`;
      return `<span>${text}</span>`;
    })
    .join(" ");
}

/** A self-contained HTML difference report (inline CSS, images as data: URLs, no scripts). */
export function buildReportHtml(r: ReportInput, locale: "ar" | "en"): string {
  const L = (x: Localized) => escapeHtml(x[locale]);
  const s = summarize(r.pages);
  const list = (pages: number[]) => (pages.length ? pages.join(", ") : "—");
  const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;

  const rows = r.pages
    .map((p) => {
      const st = pageStatus(p);
      return `<tr class="${st}"><td>${p.page}</td><td>${L(STATUS_LABELS[st])}</td><td class="num">${p.added}</td><td class="num">${p.removed}</td><td class="num" dir="ltr">${p.visual === null ? "—" : pct(p.visual)}</td></tr>`;
    })
    .join("\n");

  const sections = r.pages
    .filter((p) => pageStatus(p) !== "same")
    .map((p) => {
      const st = pageStatus(p);
      const notes: string[] = [];
      if (p.inA && p.inB && !p.textA && !p.textB)
        notes.push(L({ ar: "لا يوجد نص في هذه الصفحة في كلا الملفين (قد تكون صورة ممسوحة ضوئياً)، فلا يمكن مقارنة النص؛ المقارنة البصرية فقط.", en: "This page has no text in either file (it may be a scanned image), so text can't be compared; only the visual comparison applies." }));
      else if (p.inA && p.inB && (!p.textA || !p.textB))
        notes.push(L({ ar: `الصفحة بلا نص في ${!p.textA ? "الملف الأول" : "الملف الثاني"} (قد تكون ممسوحة ضوئياً)، لذا يظهر نص الملف الآخر كله كفرق.`, en: `The page has no text in the ${!p.textA ? "first" : "second"} file (it may be scanned), so all text of the other file shows as a difference.` }));
      if (p.sizeDiffers) notes.push(L({ ar: "مقاس الصفحة مختلف بين الملفين.", en: "The page size differs between the files." }));
      const text = p.ops.length ? `<p class="diff" dir="auto">${diffHtml(p.ops)}</p>` : "";
      const img = r.images.get(p.page);
      const picture = img
        ? `<figure><img src="${img}" alt="${L({ ar: `الفروقات البصرية في الصفحة ${p.page}`, en: `Visual differences on page ${p.page}` })}"><figcaption>${L({ ar: "الأحمر: موجود في الملف الأول فقط · الأخضر: موجود في الملف الثاني فقط · البرتقالي: تغيّر في الملفين", en: "Red: only in the first file · Green: only in the second file · Amber: changed in both" })}${p.visual !== null ? ` · <span dir="ltr">${pct(p.visual)}</span>` : ""}</figcaption></figure>`
        : "";
      return `<section><h3>${L({ ar: `الصفحة ${p.page}`, en: `Page ${p.page}` })} <small>${L(STATUS_LABELS[st])}</small></h3>${notes.map((n) => `<p class="note">${n}</p>`).join("")}${text}${picture}</section>`;
    })
    .join("\n");

  const mismatch =
    r.pagesA !== r.pagesB
      ? `<p class="note">${L({
          ar: `عدد الصفحات مختلف: ${r.pagesA} في الملف الأول و${r.pagesB} في الملف الثاني. تُقارَن الصفحات حسب رقمها، والصفحات الزائدة تظهر كموجودة في ملف واحد فقط.`,
          en: `Page counts differ: ${r.pagesA} in the first file and ${r.pagesB} in the second. Pages are compared by number; extra pages show as present in one file only.`,
        })}</p>`
      : "";

  return `<!doctype html>
<html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${L({ ar: "تقرير مقارنة PDF", en: "PDF comparison report" })}</title>
<style>
body{font-family:system-ui,"Segoe UI",Tahoma,"Noto Sans Arabic",sans-serif;margin:0;padding:24px;background:#f8fafc;color:#0f172a;line-height:1.7}
main{max-width:960px;margin:0 auto}
h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.15rem;margin:28px 0 8px}h3{font-size:1rem;margin:0 0 8px}h3 small{font-weight:400;color:#64748b;margin-inline-start:8px}
.meta{color:#64748b;font-size:.85rem}.files{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:16px 0}
.card,section{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px}section{margin:12px 0}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.stats div{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px}.stats b{display:block;font-size:1.2rem}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-size:.9rem}th,td{padding:6px 10px;border-bottom:1px solid #f1f5f9;text-align:start}td.num{font-variant-numeric:tabular-nums}
tr.changed td:nth-child(2){color:#b45309}tr.only-a td:nth-child(2){color:#b91c1c}tr.only-b td:nth-child(2){color:#15803d}tr.no-text td:nth-child(2){color:#64748b}
.diff{white-space:pre-wrap;word-break:break-word}ins{background:#dcfce7;color:#14532d;text-decoration:underline}del{background:#fee2e2;color:#7f1d1d}
.note{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:6px 10px;font-size:.88rem}
figure{margin:12px 0 0}img{max-width:100%;border:1px solid #e2e8f0;border-radius:8px}figcaption{font-size:.8rem;color:#64748b}
.legend ins,.legend del{padding:0 4px}
</style>
</head>
<body><main>
<h1>${L({ ar: "تقرير مقارنة PDF", en: "PDF comparison report" })}</h1>
<p class="meta">${L({ ar: "أُنشئ محلياً في المتصفح بواسطة All To All — By Visions", en: "Generated locally in the browser by All To All — By Visions" })} · <span dir="ltr">${formatStamp(r.generatedAt)}</span></p>
<div class="files">
<div class="card"><b>${L({ ar: "الملف الأول", en: "First file" })}</b><div dir="auto">${escapeHtml(r.nameA)}</div><div class="meta">${L({ ar: `${r.pagesA} صفحة`, en: `${r.pagesA} pages` })}</div></div>
<div class="card"><b>${L({ ar: "الملف الثاني", en: "Second file" })}</b><div dir="auto">${escapeHtml(r.nameB)}</div><div class="meta">${L({ ar: `${r.pagesB} صفحة`, en: `${r.pagesB} pages` })}</div></div>
</div>
${mismatch}
<h2>${L({ ar: "الملخص", en: "Summary" })}</h2>
<div class="stats">
<div>${L({ ar: "صفحات متطابقة", en: "Identical pages" })}<b>${s.same.length}</b></div>
<div>${L({ ar: "صفحات فيها فروقات", en: "Pages with differences" })}<b>${s.changed.length}</b></div>
<div>${L({ ar: "كلمات مضافة", en: "Words added" })}<b>${s.added}</b></div>
<div>${L({ ar: "كلمات محذوفة", en: "Words removed" })}<b>${s.removed}</b></div>
</div>
<p class="meta">${L({ ar: "صفحات فيها فروقات", en: "Pages with differences" })}: <span dir="ltr">${list(s.changed)}</span> · ${L({ ar: "في الملف الأول فقط", en: "Only in the first file" })}: <span dir="ltr">${list(s.onlyA)}</span> · ${L({ ar: "في الملف الثاني فقط", en: "Only in the second file" })}: <span dir="ltr">${list(s.onlyB)}</span> · ${L({ ar: "صفحات بلا نص (قد تكون ممسوحة ضوئياً)", en: "Pages without text (may be scanned)" })}: <span dir="ltr">${list(s.noText)}</span></p>
<p class="meta legend"><ins>${L({ ar: "نص مضاف في الملف الثاني", en: "Text added in the second file" })}</ins> · <del>${L({ ar: "نص محذوف من الملف الأول", en: "Text removed from the first file" })}</del>${r.visualIncluded ? "" : ` · ${L({ ar: "المقارنة البصرية لم تُضمَّن", en: "Visual comparison not included" })}`}</p>
<h2>${L({ ar: "الصفحات", en: "Pages" })}</h2>
<table>
<thead><tr><th>${L({ ar: "الصفحة", en: "Page" })}</th><th>${L({ ar: "الحالة", en: "Status" })}</th><th>${L({ ar: "كلمات مضافة", en: "Added" })}</th><th>${L({ ar: "كلمات محذوفة", en: "Removed" })}</th><th>${L({ ar: "اختلاف بصري", en: "Visual change" })}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
${sections ? `<h2>${L({ ar: "التفاصيل", en: "Details" })}</h2>\n${sections}` : `<p class="note">${L({ ar: "لم يُعثر على أي فروقات.", en: "No differences were found." })}</p>`}
</main></body>
</html>
`;
}
