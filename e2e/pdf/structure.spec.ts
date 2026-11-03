import { expect, test } from "@playwright/test";
import { closeSettings, downloadResult, L, loadPdf, makePdf, openSettings, openTool, pageTexts, pdfUpload, runTool, unzip, upload, type Locale } from "./helpers";

for (const locale of ["ar", "en"] as Locale[]) {
  test(`merge: two files in list order, text kept (${locale})`, async ({ page }) => {
    await openTool(page, "merge-pdf", locale);
    await upload(page, [pdfUpload("تقرير الطالب.pdf", await makePdf(2, "A")), pdfUpload("b.pdf", await makePdf(3, "B"))]);
    await runTool(page, L(locale, "دمج الملفات", "Merge files"));
    const out = await downloadResult(page, locale);
    expect(out.name).toBe("تقرير الطالب-merged.pdf");
    const doc = await loadPdf(out.bytes);
    expect(doc.getPageCount()).toBe(5);
    expect(await pageTexts(out.bytes)).toEqual(["A 1", "A 2", "B 1", "B 2", "B 3"]);
  });
}

test("merge: reordering the file list changes the result", async ({ page }) => {
  await openTool(page, "merge-pdf");
  await upload(page, [pdfUpload("a.pdf", await makePdf(1, "A")), pdfUpload("b.pdf", await makePdf(1, "B"))]);
  // Touch/keyboard alternative to dragging: the up/down buttons in the file list.
  await page.getByRole("button", { name: /تحريك للأعلى|Move up/ }).last().click();
  await runTool(page, "دمج الملفات");
  const out = await downloadResult(page, "ar");
  expect(await pageTexts(out.bytes)).toEqual(["B 1", "A 1"]);
});

test("split: every page into a ZIP of separate PDFs", async ({ page }) => {
  await openTool(page, "split-pdf");
  await upload(page, [pdfUpload("تقرير.pdf", await makePdf(3))]);
  const settings = await openSettings(page, "ar");
  await settings.getByRole("radio", { name: "كل صفحة" }).click();
  await expect(settings.getByText("سينتج 3 ملف PDF")).toBeVisible();
  await closeSettings(page);
  await runTool(page, "تقسيم");
  const out = await downloadResult(page, "ar");
  expect(out.name).toMatch(/\.zip$/);
  const files = await unzip(out.bytes);
  expect(files.map((f) => f.name)).toEqual(["تقرير-page-1.pdf", "تقرير-page-2.pdf", "تقرير-page-3.pdf"]);
  for (const [i, f] of files.entries()) expect(await pageTexts(f.bytes)).toEqual([`Page ${i + 1}`]);
});

test("split: custom ranges, with validation", async ({ page }) => {
  await openTool(page, "split-pdf");
  await upload(page, [pdfUpload("doc.pdf", await makePdf(5))]);
  const settings = await openSettings(page, "ar");
  const ranges = settings.getByLabel("النطاقات");
  await ranges.fill("1-9");
  await expect(settings.getByText(/خارج الملف/).first()).toBeVisible();
  await ranges.fill("1-2, 3-5");
  await expect(settings.getByText("سينتج 2 ملف PDF")).toBeVisible();
  await closeSettings(page);
  await runTool(page, "تقسيم");
  const files = await unzip((await downloadResult(page, "ar")).bytes);
  expect(files.map((f) => f.name)).toEqual(["doc-pages-1-2.pdf", "doc-pages-3-5.pdf"]);
  expect((await loadPdf(files[1].bytes)).getPageCount()).toBe(3);
});

test("remove pages: tap thumbnails, keep the rest", async ({ page }) => {
  await openTool(page, "remove-pages");
  await upload(page, [pdfUpload("doc.pdf", await makePdf(4))]);
  await page.getByRole("option", { name: "الصفحة 2" }).click();
  await page.getByRole("option", { name: "الصفحة 4" }).click();
  await expect(page.getByText("2 صفحة للحذف · ستبقى 2")).toBeVisible();
  await runTool(page, "حذف الصفحات");
  const out = await downloadResult(page, "ar");
  expect(await pageTexts(out.bytes)).toEqual(["Page 1", "Page 3"]);
});

test("extract pages: typed range into separate files", async ({ page }) => {
  await openTool(page, "extract-pages", "en");
  await upload(page, [pdfUpload("doc.pdf", await makePdf(5))]);
  const settings = await openSettings(page, "en");
  await settings.getByLabel("Pages to extract").fill("2, 4-5");
  await settings.getByRole("radio", { name: "One per range" }).click();
  await closeSettings(page);
  // The thumbnails follow the typed range.
  await expect(page.getByRole("option", { name: "Page 4" })).toHaveAttribute("aria-selected", "true");
  await runTool(page, "Extract pages");
  const files = await unzip((await downloadResult(page, "en")).bytes);
  expect(files.map((f) => f.name)).toEqual(["doc-page-2.pdf", "doc-pages-4-5.pdf"]);
  expect(await pageTexts(files[1].bytes)).toEqual(["Page 4", "Page 5"]);
});

test("rotate: selected pages only, and batch of files", async ({ page }) => {
  await openTool(page, "rotate-pdf");
  await upload(page, [pdfUpload("a.pdf", await makePdf(3)), pdfUpload("b.pdf", await makePdf(2))]);
  // Tapping a page switches to "some pages".
  await page.getByRole("option", { name: "الصفحة 2" }).click();
  await runTool(page, "تدوير");
  const files = await unzip((await downloadResult(page, "ar")).bytes);
  expect(files.map((f) => f.name)).toEqual(["a-rotated.pdf", "b-rotated.pdf"]);
  expect((await loadPdf(files[0].bytes)).getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 0]);
  expect((await loadPdf(files[1].bytes)).getPages().map((p) => p.getRotation().angle)).toEqual([0, 90]);
});

test("organize: move, rotate, duplicate, delete, undo, insert from another file", async ({ page }) => {
  await openTool(page, "organize-pdf");
  await upload(page, [pdfUpload("a.pdf", await makePdf(3, "A")), pdfUpload("b.pdf", await makePdf(2, "B"))]);
  const pageBtn = (pos: number) => page.getByRole("button", { name: new RegExp(`^الموضع ${pos}:`) });
  await expect(pageBtn(3)).toBeVisible();
  // Select position 1 and move it later (touch/keyboard alternative to dragging).
  await pageBtn(1).click();
  await page.getByRole("button", { name: "نقل للخلف" }).click();
  await page.getByRole("button", { name: "تدوير لليمين" }).click();
  // Duplicate, then delete the copy, then undo the delete.
  await page.getByRole("button", { name: "تكرار" }).click();
  await page.getByRole("button", { name: "إلغاء", exact: true }).click();
  await pageBtn(4).click();
  await page.getByRole("button", { name: "حذف", exact: true }).click();
  await expect(pageBtn(4)).toHaveCount(0);
  await page.getByRole("button", { name: "تراجع" }).click();
  await expect(pageBtn(4)).toBeVisible();
  // Insert page 2 of b.pdf at the end.
  await page.getByRole("button", { name: "إدراج صفحات" }).click();
  await page.getByLabel("من الملف").selectOption({ label: "b.pdf" });
  await page.getByLabel("الصفحات (فارغ = الكل)").fill("2");
  await page.getByLabel("الموضع", { exact: true }).selectOption({ label: "في النهاية" });
  await page.getByRole("button", { name: "إدراج", exact: true }).click();
  await expect(pageBtn(5)).toBeVisible();

  await runTool(page, "حفظ الملف المرتب");
  const out = await downloadResult(page, "ar");
  const doc = await loadPdf(out.bytes);
  expect(await pageTexts(out.bytes)).toEqual(["A 2", "A 1", "A 1", "A 3", "B 2"]);
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 90, 0, 0]);
});

test("damaged and encrypted files get a clear error", async ({ page }) => {
  await openTool(page, "split-pdf");
  const bad = new TextEncoder().encode("%PDF-1.7\nthis is not really a pdf");
  // A document whose trailer declares encryption.
  const { PDFDocument } = await import("pdf-lib");
  const enc = await PDFDocument.create();
  enc.addPage();
  enc.context.trailerInfo.Encrypt = enc.context.register(enc.context.obj({ Filter: "Standard", V: 1, R: 2, O: "x", U: "y", P: -4 }));
  await upload(page, [pdfUpload("bad.pdf", bad), pdfUpload("locked.pdf", await enc.save({ useObjectStreams: false }))]);
  const settings = await openSettings(page, "ar");
  await settings.getByRole("radio", { name: "كل صفحة" }).click();
  await closeSettings(page);
  await runTool(page, "تقسيم");
  const results = page.locator("section[aria-live=polite]");
  await expect(results.getByText(/bad\.pdf/)).toBeVisible();
  await expect(results.getByText(/تالفاً أو ليس ملف PDF/)).toBeVisible();
  await expect(results.getByText(/محمي بكلمة مرور أو مشفّر/)).toBeVisible();
});
