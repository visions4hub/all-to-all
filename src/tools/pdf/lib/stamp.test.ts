import { describe, expect, it } from "vitest";
import { UserFacingError } from "@/lib/engine/types";
import { canUseStandardFont, hasRtl, pageGeometry, type TextRasterizer } from "./page-space";
import {
  addPageNumbers,
  addWatermark,
  cropBoxFor,
  cropPdf,
  DEFAULT_PAGE_NUMBERS,
  DEFAULT_WATERMARK,
  formatPageLabel,
  pageNumberPlan,
  tileCentres,
} from "./stamp";
import { asInput, ctx, makePdf, openOutput, pageContent, pageImageCount, pageTexts, RED_PNG } from "./test-fixtures";

const fakeRaster: TextRasterizer = async (text, style) => ({ png: RED_PNG, width: text.length * style.fontSize * 0.5, height: style.fontSize * 1.3 });

describe("text encoding choice", () => {
  it("keeps Latin text as real text and sends Arabic to the renderer", () => {
    expect(canUseStandardFont("Page 3 of 10")).toBe(true);
    expect(canUseStandardFont("Café – “quoted”")).toBe(true);
    expect(canUseStandardFont("صفحة 3")).toBe(false);
    expect(hasRtl("صفحة 3")).toBe(true);
    expect(hasRtl("Page")).toBe(false);
  });
});

describe("page number layout", () => {
  it("formats labels", () => {
    expect(formatPageLabel("n-of-total", "", 3, 9)).toBe("3 / 9");
    expect(formatPageLabel("page-n-of-total", "", 3, 9)).toBe("Page 3 of 9");
    expect(formatPageLabel("ar-page-n-of-total", "", 3, 9)).toBe("صفحة 3 من 9");
    expect(formatPageLabel("custom", "{n}/{total} — Draft", 2, 4)).toBe("2/4 — Draft");
  });

  it("plans numbers with start, skip-first and selection", () => {
    const plan = pageNumberPlan({ selection: { scope: "all", ranges: "" }, skipFirst: true, start: 1 }, 4);
    expect(plan).toEqual({ ok: true, entries: [{ index: 1, number: 1 }, { index: 2, number: 2 }, { index: 3, number: 3 }], last: 3 });
    const sel = pageNumberPlan({ selection: { scope: "custom", ranges: "2-3" }, skipFirst: false, start: 10 }, 4);
    expect(sel).toEqual({ ok: true, entries: [{ index: 1, number: 10 }, { index: 2, number: 11 }], last: 11 });
  });

  it("draws extractable Latin numbers on the chosen pages", async () => {
    const input = asInput(await makePdf(3));
    const [out] = await addPageNumbers([input], { ...DEFAULT_PAGE_NUMBERS, format: "page-n-of-total", skipFirst: true }, ctx());
    expect(out.name).toBe("تقرير الطالب-numbered.pdf");
    expect(await pageTexts(out.blob)).toEqual(["Page 1", "Page 2 Page 1 of 2", "Page 3 Page 2 of 2"]);
  });

  it("puts the number at the bottom centre of a rotated page as the reader sees it", async () => {
    const input = asInput(await makePdf(1, { size: [600, 400], rotate: [90] }));
    const [out] = await addPageNumbers([input], { ...DEFAULT_PAGE_NUMBERS, marginY: 20 }, ctx());
    const doc = await openOutput(out);
    const content = await pageContent(doc, 0);
    // Display space for /Rotate 90 is set with "0 1 -1 0 600 0 cm".
    expect(content).toMatch(/0 1 -1 0 600 0 cm/);
  });

  it("renders Arabic labels as an embedded image", async () => {
    const input = asInput(await makePdf(2));
    const [out] = await addPageNumbers([input], { ...DEFAULT_PAGE_NUMBERS, format: "ar-page-n-of-total" }, ctx(), fakeRaster);
    const doc = await openOutput(out);
    expect(await pageImageCount(doc, 0)).toBe(1);
    expect(await pageImageCount(doc, 1)).toBe(1);
  });

  it("rejects bad page selections", async () => {
    const input = asInput(await makePdf(2));
    await expect(
      addPageNumbers([input], { ...DEFAULT_PAGE_NUMBERS, selection: { scope: "custom", ranges: "7" } }, ctx()),
    ).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe("watermark", () => {
  it("tiles cover the page", () => {
    const tiles = tileCentres({ width: 600, height: 800 }, { width: 100, height: 50 }, 50);
    expect(tiles.length).toBeGreaterThan(12);
    expect(Math.min(...tiles.map((t) => t.y))).toBeLessThan(100);
    expect(Math.max(...tiles.map((t) => t.y))).toBeGreaterThan(700);
  });

  it("adds Latin text with transparency on selected pages only", async () => {
    const input = asInput(await makePdf(3));
    const [out] = await addWatermark(
      [input],
      { ...DEFAULT_WATERMARK, text: "CONFIDENTIAL", selection: { scope: "custom", ranges: "1, 3" } },
      ctx(),
    );
    const texts = await pageTexts(out.blob);
    expect(texts[0]).toContain("CONFIDENTIAL");
    expect(texts[1]).not.toContain("CONFIDENTIAL");
    expect(texts[2]).toContain("CONFIDENTIAL");
    const doc = await openOutput(out);
    expect(await pageContent(doc, 0)).toMatch(/\/GS-?\w*\s+gs/); // opacity graphics state
  });

  it("adds an image watermark, tiled", async () => {
    const input = asInput(await makePdf(1));
    const [out] = await addWatermark(
      [input],
      { ...DEFAULT_WATERMARK, kind: "image", tile: true, image: { bytes: RED_PNG, type: "png", name: "logo.png", width: 1, height: 1 }, imageScale: 0.1 },
      ctx(),
    );
    const doc = await openOutput(out);
    expect(await pageImageCount(doc, 0)).toBe(1); // one image, drawn many times
    const draws = (await pageContent(doc, 0)).match(/\bDo\b/g) ?? [];
    expect(draws.length).toBeGreaterThan(10);
  });

  it("renders Arabic watermark text as an image", async () => {
    const input = asInput(await makePdf(1));
    const [out] = await addWatermark([input], { ...DEFAULT_WATERMARK, text: "سري" }, ctx(), fakeRaster);
    expect(await pageImageCount(await openOutput(out), 0)).toBe(1);
  });

  it("asks for text or an image", async () => {
    const input = asInput(await makePdf(1));
    await expect(addWatermark([input], { ...DEFAULT_WATERMARK, text: " " }, ctx())).rejects.toBeInstanceOf(UserFacingError);
    await expect(addWatermark([input], { ...DEFAULT_WATERMARK, kind: "image" }, ctx())).rejects.toBeInstanceOf(UserFacingError);
  });
});

describe("crop", () => {
  it("turns display margins into a CropBox", async () => {
    const geom = { box: { x: 0, y: 0, width: 600, height: 800 }, rotation: 0 as const, width: 600, height: 800 };
    expect(cropBoxFor(geom, { top: 10, right: 20, bottom: 30, left: 40 })).toEqual({ x: 40, y: 30, width: 540, height: 760 });
    expect(cropBoxFor(geom, { top: 400, right: 0, bottom: 400, left: 0 })).toBeNull();
  });

  it("handles rotated pages: margins follow what the reader sees", async () => {
    // Page 600×400 user space, /Rotate 90 → reader sees 400 wide × 600 high.
    const geom = { box: { x: 0, y: 0, width: 600, height: 400 }, rotation: 90 as const, width: 400, height: 600 };
    // Cutting 50 from the visible top removes user-space x from 0..50 (the user left edge is the visible top).
    expect(cropBoxFor(geom, { top: 50, right: 0, bottom: 0, left: 0 })).toEqual({ x: 50, y: 0, width: 550, height: 400 });
  });

  it("sets the CropBox on selected pages and keeps the content", async () => {
    const input = asInput(await makePdf(2));
    const [out] = await cropPdf([input], { margins: { top: 72, right: 36, bottom: 72, left: 36 }, selection: { scope: "custom", ranges: "1" } }, ctx());
    const doc = await openOutput(out);
    const c = doc.getPage(0).getCropBox();
    expect([c.x, c.y, c.width, c.height]).toEqual([36, 72, 523, 698]);
    expect(pageGeometry(doc.getPage(1)).box).toEqual({ x: 0, y: 0, width: 595, height: 842 });
    // Content outside the box is hidden, not deleted: the text is still in the file.
    expect((await pageTexts(out.blob))[0]).toBe("Page 1");
  });

  it("refuses margins larger than a page", async () => {
    const input = asInput(await makePdf(1));
    await expect(
      cropPdf([input], { margins: { top: 500, right: 0, bottom: 500, left: 0 }, selection: { scope: "all", ranges: "" } }, ctx()),
    ).rejects.toBeInstanceOf(UserFacingError);
  });
});
