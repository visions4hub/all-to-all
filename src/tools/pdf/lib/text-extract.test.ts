import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { UserFacingError } from "@/lib/engine/types";
import { imageName, maxDpiFor, fitsCanvas, pixelSize } from "./pdf-to-image";
import { composeText, extractPdfText, itemsToText, type PdfOpener, type TextItem } from "./text-extract";
import { asInput, ctx, openWithPdfJs } from "./test-fixtures";

const item = (str: string, x: number, y: number, width: number, size = 10): TextItem => ({ str, transform: [size, 0, 0, size, x, y], width, height: size });

describe("reading order", () => {
  it("orders lines top to bottom and items left to right", () => {
    const text = itemsToText([item("world", 60, 700, 30), item("Hello", 20, 700, 30), item("Second", 20, 686, 40)]);
    expect(text).toBe("Hello world\nSecond");
  });

  it("orders Arabic lines right to left", () => {
    // Two words on one line: the right-hand one is read first.
    const text = itemsToText([item("الطالب", 100, 700, 40), item("تقرير", 150, 700, 30)]);
    expect(text).toBe("تقرير الطالب");
  });

  it("keeps items that touch together and marks large gaps as paragraphs", () => {
    expect(itemsToText([item("Hel", 20, 700, 15), item("lo", 35, 700, 10)])).toBe("Hello");
    expect(itemsToText([item("A", 20, 700, 10), item("B", 20, 600, 10)])).toBe("A\n\nB");
  });

  it("composes pages and flags pages without text", () => {
    const out = composeText([{ page: 1, text: "Hi" }, { page: 2, text: "" }], true, "en");
    expect(out).toBe("--- Page 1 ---\nHi\n\n--- Page 2 ---\n[Page 2: no text — it may be a scanned image]");
    expect(composeText([{ page: 2, text: "" }], false, "ar")).toContain("الصفحة 2");
  });
});

describe("PDF → text (PDF.js in Node)", () => {
  const open: PdfOpener = (data) => openWithPdfJs(data);

  it("extracts native text, reports empty pages, writes UTF-8 TXT", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage().drawText("First line\nSecond line", { x: 50, y: 700, size: 14, font, lineHeight: 18 });
    doc.addPage(); // blank, like a scanned page with no text layer
    const input = asInput(await doc.save(), "تقرير الطالب.pdf");
    const [out] = await extractPdfText([input], { selection: { scope: "all", ranges: "" }, pageHeadings: true }, ctx(), open);
    expect(out.name).toBe("تقرير الطالب.txt");
    expect(out.blob.type).toBe("text/plain;charset=utf-8");
    const text = new TextDecoder().decode(await out.blob.arrayBuffer()).replace(/^﻿/, "");
    expect(text).toContain("First line\nSecond line");
    expect(text).toMatch(/الصفحة 2: لا يوجد نص|Page 2: no text/);
    expect(out.meta?.find((m) => m.label.en === "Pages without text")?.value).toBe("2");
  });

  it("reports a damaged file", async () => {
    const input = asInput(new TextEncoder().encode("%PDF-1.7 garbage"));
    await expect(extractPdfText([input], { selection: { scope: "all", ranges: "" }, pageHeadings: false }, ctx(), open)).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe("PDF → image math", () => {
  it("computes pixel size from DPI", () => {
    expect(pixelSize(595, 842, 72)).toEqual({ scale: 1, width: 595, height: 842 });
    expect(pixelSize(595, 842, 150).width).toBe(1239);
  });

  it("guards canvas limits and suggests a DPI that fits", () => {
    expect(fitsCanvas(4000, 4000)).toBe(true);
    expect(fitsCanvas(5000, 5000)).toBe(false);
    const max = maxDpiFor(595, 842);
    const at = pixelSize(595, 842, max);
    expect(fitsCanvas(at.width, at.height)).toBe(true);
    const over = pixelSize(595, 842, max + 5);
    expect(fitsCanvas(over.width, over.height)).toBe(false);
  });

  it("names pages with padding for sorting", () => {
    expect(imageName("تقرير.pdf", 3, 120, "jpeg")).toBe("تقرير-page-003.jpg");
    expect(imageName("a.pdf", 1, 1, "png")).toBe("a-page-1.png");
  });
});
