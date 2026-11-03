import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { comparePdfs, DEFAULT_COMPARE } from "./compare-run";
import { asInput, ctx, openWithPdfJs } from "./test-fixtures";
import type { PdfOpener } from "./text-extract";

const open: PdfOpener = (data) => openWithPdfJs(data);
const textOnly = { ...DEFAULT_COMPARE, visual: false };

async function doc(pages: (string[] | null)[]): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const p = d.addPage([595, 842]);
    lines?.forEach((line, i) => p.drawText(line, { x: 50, y: 780 - i * 30, size: 16, font }));
  }
  return d.save();
}

describe("comparePdfs (text, Node)", () => {
  it("reports word changes, an extra page and a page without text in a self-contained HTML file", async () => {
    const a = await doc([["Invoice 2026", "Total due: 100 USD"], null, ["Terms apply"]]);
    const b = await doc([["Invoice 2026", "Total due: 150 USD", "Paid in full"], null, ["Terms apply"], ["Appendix page"]]);
    const [out] = await comparePdfs([asInput(a, "old.pdf"), asInput(b, "new.pdf")], textOnly, ctx(), open);
    expect(out.name).toBe("old-comparison.html");
    expect(out.blob.type).toBe("text/html;charset=utf-8");
    const html = await out.blob.text();
    expect(html).toContain("<del>100</del>");
    expect(html).toContain("<ins>150</ins>");
    expect(html).toContain("<ins>Paid in full</ins>");
    expect(html).toContain("<ins>Appendix page</ins>");
    // Page 2 has no text in either file: said plainly.
    expect(html).toMatch(/(No text \(scanned\?\)|بلا نص)/);
    expect(out.meta?.find((m) => m.label.en === "Pages compared")?.value).toBe(4);
    expect(out.meta?.find((m) => m.label.en === "Words added")?.value).toBe(6); // 150 + "Paid in full" + "Appendix page"
    expect(out.meta?.find((m) => m.label.en === "Words removed")?.value).toBe(1);
  });

  it("identical files: no differences", async () => {
    const a = await doc([["Same text here"], ["Second page"]]);
    const [out] = await comparePdfs([asInput(a, "a.pdf"), asInput(a.slice(), "b.pdf")], textOnly, ctx(), open);
    expect(out.meta?.find((m) => m.label.en === "Pages with differences")?.value).toBe(0);
    expect(await out.blob.text()).toMatch(/(No differences were found|لم يُعثر على أي فروقات)/);
  });

  it("names the file that can't be opened, and needs exactly two files", async () => {
    const a = await doc([["x"]]);
    await expect(comparePdfs([asInput(a, "a.pdf"), asInput(new TextEncoder().encode("nope"), "broken.pdf")], textOnly, ctx(), open)).rejects.toThrow(/^broken\.pdf: /);
    await expect(comparePdfs([asInput(a, "a.pdf")], textOnly, ctx(), open)).rejects.toThrow();
  });

  it("stops when cancelled", async () => {
    const a = await doc([["x"], ["y"]]);
    const c = ctx();
    const controller = new AbortController();
    controller.abort();
    await expect(comparePdfs([asInput(a, "a.pdf"), asInput(a.slice(), "b.pdf")], textOnly, { ...c, signal: controller.signal }, open)).rejects.toThrow("Cancelled");
  });
});
