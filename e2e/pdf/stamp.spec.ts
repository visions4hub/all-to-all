import { expect, test } from "@playwright/test";
import { closeSettings, downloadResult, imageCount, L, loadPdf, makeImages, makePdf, makeRotatedPdf, openSettings, openTool, pageTexts, pdfUpload, runTool, upload, type Locale } from "./helpers";

for (const locale of ["ar", "en"] as Locale[]) {
  test(`page numbers: Latin numbers are real text, with live preview (${locale})`, async ({ page }) => {
    await openTool(page, "add-page-numbers", locale);
    await upload(page, [pdfUpload("تقرير الطالب.pdf", await makePdf(3))]);
    await expect(page.getByText(L(locale, "معاينة حقيقية للناتج", "Live preview of the result"))).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible();
    const settings = await openSettings(page, locale);
    await settings.getByLabel(L(locale, "الصيغة", "Format")).selectOption("page-n-of-total");
    await settings.getByRole("switch", { name: L(locale, "تخطي الصفحة الأولى", "Skip the first page") }).click();
    await closeSettings(page);
    await runTool(page, L(locale, "إضافة الأرقام", "Add numbers"));
    const out = await downloadResult(page, locale);
    expect(out.name).toBe("تقرير الطالب-numbered.pdf");
    expect(await pageTexts(out.bytes)).toEqual(["Page 1", "Page 2 Page 1 of 2", "Page 3 Page 2 of 2"]);
  });
}

test("page numbers: Arabic label is drawn by the browser as an image", async ({ page }) => {
  await openTool(page, "add-page-numbers");
  await upload(page, [pdfUpload("doc.pdf", await makePdf(2))]);
  const settings = await openSettings(page, "ar");
  await settings.getByLabel("الصيغة").selectOption("ar-page-n-of-total");
  await expect(settings.getByText(/يُرسم كصورة/)).toBeVisible();
  await closeSettings(page);
  await runTool(page, "إضافة الأرقام");
  const doc = await loadPdf((await downloadResult(page, "ar")).bytes);
  expect(imageCount(doc, 0)).toBe(1);
  expect(imageCount(doc, 1)).toBe(1);
});

test("watermark: Latin text on every page, Arabic tiled as image", async ({ page }) => {
  await openTool(page, "watermark-pdf");
  await upload(page, [pdfUpload("doc.pdf", await makePdf(2))]);
  let settings = await openSettings(page, "ar");
  await settings.getByLabel("النص", { exact: true }).fill("DRAFT");
  await closeSettings(page);
  await runTool(page, "إضافة العلامة المائية");
  const latin = await downloadResult(page, "ar");
  expect(await pageTexts(latin.bytes)).toEqual(["Page 1 DRAFT", "Page 2 DRAFT"]);

  await page.getByRole("button", { name: "معالجة جديدة" }).click();
  settings = await openSettings(page, "ar");
  await settings.getByLabel("النص", { exact: true }).fill("سري");
  await settings.getByRole("switch", { name: "تكرار على كامل الصفحة" }).click();
  await closeSettings(page);
  await runTool(page, "إضافة العلامة المائية");
  const doc = await loadPdf((await downloadResult(page, "ar")).bytes);
  expect(imageCount(doc, 0)).toBe(1);
});

test("watermark: image logo", async ({ page }) => {
  await openTool(page, "watermark-pdf", "en");
  const [png] = await makeImages(page);
  await upload(page, [pdfUpload("doc.pdf", await makePdf(1))]);
  const settings = await openSettings(page, "en");
  await settings.getByRole("radio", { name: "Image / logo" }).click();
  await settings.getByLabel("Watermark image").setInputFiles(png);
  await expect(settings.getByText("صورة 1.png")).toBeVisible();
  await closeSettings(page);
  await runTool(page, "Add watermark");
  const doc = await loadPdf((await downloadResult(page, "en")).bytes);
  expect(imageCount(doc, 0)).toBe(1);
});

test("crop: numeric margins set the CropBox; content is kept", async ({ page }) => {
  await openTool(page, "crop-pdf");
  await upload(page, [pdfUpload("doc.pdf", await makePdf(2))]);
  await expect(page.getByRole("group", { name: "منطقة القص" })).toBeVisible();
  const settings = await openSettings(page, "ar");
  await settings.getByLabel("من الأعلى").fill("25.4"); // 72 pt
  await expect(settings.getByText(/المحتوى خارجها يبقى داخل الملف/)).toBeVisible();
  await closeSettings(page);
  await runTool(page, "قص");
  const out = await downloadResult(page, "ar");
  const doc = await loadPdf(out.bytes);
  for (const p of doc.getPages()) {
    const box = p.getCropBox();
    expect(box.x).toBeCloseTo(36, 1);
    expect(box.y).toBeCloseTo(36, 1);
    expect(box.width).toBeCloseTo(595 - 72, 1);
    expect(box.height).toBeCloseTo(842 - 36 - 72, 1);
  }
  expect((await pageTexts(out.bytes))[0]).toBe("Page 1");
});

test("crop: dragging the box changes the margins", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "Drag is covered on desktop; phones use the same pointer events.");
  await openTool(page, "crop-pdf", "en");
  await upload(page, [pdfUpload("doc.pdf", await makeRotatedPdf())]);
  const area = page.getByRole("group", { name: "Crop area" });
  await expect(area).toBeVisible();
  const box = (await area.boundingBox())!;
  // Drag the bottom-right corner up and left.
  await page.mouse.move(box.x + box.width, box.y + box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 60, box.y + box.height - 40, { steps: 5 });
  await page.mouse.up();
  const settings = await openSettings(page, "en");
  expect(Number(await settings.getByLabel("Right").inputValue())).toBeGreaterThan(12.7);
  expect(Number(await settings.getByLabel("Bottom").inputValue())).toBeGreaterThan(12.7);
  await runTool(page, "Crop");
  const doc = await loadPdf((await downloadResult(page, "en")).bytes);
  // A /Rotate 90 page: the crop still matches what the reader saw.
  const c = doc.getPage(0).getCropBox();
  expect(c.width).toBeLessThan(595 - 72);
  expect(c.height).toBeLessThan(842 - 72);
});
