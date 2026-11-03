import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { closeSettings, downloadResult, imageCount, L, loadPdf, makeImages, makePdf, openSettings, openTool, pdfUpload, runTool, unzip, upload, type Locale } from "./helpers";

for (const locale of ["ar", "en"] as Locale[]) {
  test(`image to PDF: PNG, JPG and WebP into one PDF in order (${locale})`, async ({ page }) => {
    await openTool(page, "image-to-pdf", locale);
    const images = await makeImages(page);
    await upload(page, images);
    await expect(page.getByText(/mm$/).first()).toBeVisible(); // page mock-up
    await runTool(page, L(locale, "تحويل إلى PDF", "Convert to PDF"));
    const out = await downloadResult(page, locale);
    expect(out.name).toBe("صورة 1-images.pdf");
    const doc = await loadPdf(out.bytes);
    expect(doc.getPageCount()).toBe(3);
    // A4, auto orientation: the 400×300 PNG gets a landscape page, the 300×500 JPG a portrait one.
    expect(doc.getPage(0).getSize()).toEqual({ width: 841.89, height: 595.28 });
    expect(doc.getPage(1).getSize()).toEqual({ width: 595.28, height: 841.89 });
    for (let i = 0; i < 3; i++) expect(imageCount(doc, i)).toBe(1);
  });
}

test("image to PDF: separate files, original size, no margin", async ({ page }) => {
  await openTool(page, "image-to-pdf");
  const images = await makeImages(page);
  await upload(page, images.slice(0, 2));
  const settings = await openSettings(page, "ar");
  await settings.getByRole("radio", { name: "ملف لكل صورة" }).click();
  await settings.getByLabel("حجم الصفحة").selectOption("original");
  await settings.getByLabel("الهامش").fill("0");
  await closeSettings(page);
  await runTool(page, "تحويل إلى PDF");
  const files = await unzip((await downloadResult(page, "ar")).bytes);
  expect(files.map((f) => f.name)).toEqual(["photo.pdf", "صورة 1.pdf"]);
  const png = await loadPdf(files[1].bytes);
  expect(png.getPage(0).getSize()).toEqual({ width: 300, height: 225 }); // 400×300 px at 96 px/inch
});

test("PDF to image: pages to JPG at 150 DPI in a ZIP", async ({ page }) => {
  await openTool(page, "pdf-to-image");
  await upload(page, [pdfUpload("تقرير.pdf", await makePdf(2))]);
  await runTool(page, "تحويل إلى صور");
  const files = await unzip((await downloadResult(page, "ar")).bytes);
  expect(files.map((f) => f.name)).toEqual(["تقرير-page-1.jpg", "تقرير-page-2.jpg"]);
  const jpg = files[0].bytes;
  expect([jpg[0], jpg[1], jpg[2]]).toEqual([0xff, 0xd8, 0xff]);
  const size = await page.evaluate(async (bytes) => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }));
    return [bmp.width, bmp.height];
  }, Array.from(jpg));
  expect(size).toEqual([1239, 1754]); // A4 at 150 DPI
});

test("PDF to image: PNG of selected page at 72 DPI", async ({ page }) => {
  await openTool(page, "pdf-to-image", "en");
  await upload(page, [pdfUpload("doc.pdf", await makePdf(3))]);
  const settings = await openSettings(page, "en");
  await settings.getByRole("radio", { name: "PNG" }).click();
  await settings.getByRole("radio", { name: "Screen 72" }).click();
  await settings.getByRole("radio", { name: "Some pages" }).click();
  await settings.getByPlaceholder("1-3, 5, 8-").fill("2");
  await closeSettings(page);
  await runTool(page, "Convert to images");
  const out = await downloadResult(page, "en");
  expect(out.name).toBe("doc-page-2.png");
  expect(out.bytes.subarray(1, 4).toString()).toBe("PNG");
});

test("PDF to text: native text, scanned page reported, copy shown", async ({ page }) => {
  await openTool(page, "pdf-to-text", "en");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText("Hello from page one", { x: 50, y: 700, size: 16, font });
  doc.addPage(); // no text layer, like a scan
  await upload(page, [pdfUpload("تقرير الطالب.pdf", await doc.save())]);
  const preview = page.getByLabel("Extracted text");
  await expect(preview).toHaveValue(/Hello from page one/);
  await expect(page.getByText("Pages without text (may be scanned): 2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy text" })).toBeEnabled();
  await runTool(page, "Extract text (TXT)");
  const out = await downloadResult(page, "en");
  expect(out.name).toBe("تقرير الطالب.txt");
  const text = out.bytes.toString("utf8").replace(/^﻿/, "");
  expect(text).toContain("--- Page 1 ---\nHello from page one");
  expect(text).toContain("[Page 2: no text — it may be a scanned image]");
});

test("PDF to image: damaged file shows an error", async ({ page }) => {
  await openTool(page, "pdf-to-image");
  await upload(page, [pdfUpload("bad.pdf", new TextEncoder().encode("%PDF-1.4 broken"))]);
  // The preview reports it before processing, and processing fails with a clear message.
  await runTool(page, "تحويل إلى صور");
  await expect(page.locator("section[aria-live=polite]").getByText(/تالفاً أو ليس ملف PDF/)).toBeVisible();
});

test("English LTR layout for a tool page", async ({ page }) => {
  await openTool(page, "pdf-to-image", "en");
  await upload(page, [pdfUpload("doc.pdf", await makePdf(1))]);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  // No horizontal scrolling on phones or desktop.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await closeSettings(page);
});
