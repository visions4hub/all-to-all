import { expect, test, type Page } from "@playwright/test";
import { closeSettings, downloadResult, imageCount, loadPdf, makeForm, makePdf, openSettings, openTool, pageTexts, pdfUpload, runTool, upload } from "./helpers";

async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 8 });
  await page.mouse.up();
}

test("fill forms: text, checkbox and dropdown values are saved", async ({ page }) => {
  await openTool(page, "fill-pdf-forms", "en");
  await upload(page, [pdfUpload("استمارة.pdf", await makeForm())]);
  await expect(page.getByText("3 fields in this form")).toBeVisible();
  await page.getByLabel("name", { exact: true }).fill("Hussam Khalil");
  await page.getByRole("checkbox").check();
  await page.getByLabel("city", { exact: true }).selectOption("Basra");
  await runTool(page, "Save form");
  const out = await downloadResult(page, "en");
  expect(out.name).toBe("استمارة-filled.pdf");
  const form = (await loadPdf(out.bytes)).getForm();
  expect(form.getTextField("name").getText()).toBe("Hussam Khalil");
  expect(form.getCheckBox("agree").isChecked()).toBe(true);
  expect(form.getDropdown("city").getSelected()).toEqual(["Basra"]);
});

test("fill forms: Arabic value + flatten is drawn as an image, fields removed", async ({ page }) => {
  await openTool(page, "fill-pdf-forms");
  await upload(page, [pdfUpload("form.pdf", await makeForm())]);
  await page.getByLabel("name", { exact: true }).fill("حسام خليل");
  const settings = await openSettings(page, "ar");
  await expect(settings.getByText(/القيم العربية تُحفظ في الحقول/)).toBeVisible();
  await settings.getByRole("switch", { name: "تسطيح النموذج" }).click();
  await expect(settings.getByText(/تُرسم كصورة عند التسطيح/)).toBeVisible();
  await closeSettings(page);
  await runTool(page, "حفظ النموذج");
  const doc = await loadPdf((await downloadResult(page, "ar")).bytes);
  expect(doc.getForm().getFields()).toHaveLength(0);
  expect(imageCount(doc, 0)).toBe(1);
});

test("fill forms: a PDF without fields says so", async ({ page }) => {
  await openTool(page, "fill-pdf-forms");
  await upload(page, [pdfUpload("plain.pdf", await makePdf(1))]);
  await expect(page.getByText(/لا يحتوي هذا الملف على حقول نموذج/)).toBeVisible();
});

test("edit PDF: rectangle, Latin text, Arabic text, undo", async ({ page }) => {
  await openTool(page, "edit-pdf");
  await upload(page, [pdfUpload("doc.pdf", await makePdf(1))]);
  const area = page.getByRole("application", { name: "مساحة التحرير" });
  await expect(area).toBeVisible();
  // Typing in the properties panel can scroll the page, so measure before each pointer action.
  const at = async (fx: number, fy: number): Promise<[number, number]> => {
    await area.scrollIntoViewIfNeeded();
    const b = (await area.boundingBox())!;
    return [b.x + b.width * fx, b.y + b.height * fy];
  };

  // Rectangle by dragging.
  await page.getByRole("button", { name: "مستطيل" }).click();
  await drag(page, await at(0.2, 0.3), await at(0.5, 0.4));
  await expect(area.locator("rect").first()).toBeAttached();

  // Text: tap to place, then type in the properties panel.
  await page.getByRole("button", { name: "نص", exact: true }).click();
  await page.mouse.click(...(await at(0.2, 0.6)));
  await page.getByLabel("النص", { exact: true }).fill("Approved");
  await expect(area.getByText("Approved")).toBeVisible();

  // A second text in Arabic.
  await page.getByRole("button", { name: "نص", exact: true }).click();
  await page.mouse.click(...(await at(0.2, 0.75)));
  await page.getByLabel("النص", { exact: true }).fill("تمت المراجعة");
  await expect(area.getByText("Approved")).toBeVisible();
  await expect(area.getByText("تمت المراجعة")).toBeVisible();
  // Undo and redo the last typing step.
  await page.getByRole("button", { name: "تراجع" }).click();
  await expect(area.getByText("تمت المراجعة")).toHaveCount(0);
  await page.getByRole("button", { name: "إعادة" }).click();
  await expect(area.getByText("تمت المراجعة")).toBeVisible();

  await runTool(page, "حفظ PDF");
  const out = await downloadResult(page, "ar");
  expect(out.name).toBe("doc-edited.pdf");
  const doc = await loadPdf(out.bytes);
  const text = (await pageTexts(out.bytes))[0];
  expect(text).toContain("Page 1"); // original content kept
  expect(text).toContain("Approved"); // Latin text stays real text
  expect(imageCount(doc, 0)).toBe(1); // Arabic text as an image
});

test("edit PDF: freehand, arrow, highlight, delete with keyboard", async ({ page }) => {
  test.skip(!!test.info().project.use.isMobile, "Keyboard delete is a desktop shortcut; touch uses the delete button.");
  await openTool(page, "edit-pdf", "en");
  await upload(page, [pdfUpload("doc.pdf", await makePdf(1))]);
  const area = page.getByRole("application", { name: "Editing area" });
  await expect(area).toBeVisible();
  const b = (await area.boundingBox())!;
  await page.getByRole("button", { name: "Freehand" }).click();
  const at = (fx: number, fy: number): [number, number] => [b.x + b.width * fx, b.y + b.height * fy];
  await drag(page, at(0.1, 0.1), at(0.4, 0.2));
  await page.getByRole("button", { name: "Arrow" }).click();
  await drag(page, at(0.1, 0.35), at(0.6, 0.4));
  await page.getByRole("button", { name: "Highlight" }).click();
  await drag(page, at(0.1, 0.6), at(0.7, 0.63));
  // The highlight is selected after drawing; Delete removes it, undo brings it back.
  await page.keyboard.press("Delete");
  await page.getByRole("button", { name: "Undo" }).click();
  await runTool(page, "Save PDF");
  const out = await downloadResult(page, "en");
  const doc = await loadPdf(out.bytes);
  expect(doc.getPageCount()).toBe(1);
  expect(out.bytes.length).toBeGreaterThan(1000);
  await expect(page.locator("section[aria-live=polite]").getByText(/Objects added: 3/)).toBeVisible();
});

test("sign PDF: draw a signature, add the date, export", async ({ page }) => {
  await openTool(page, "sign-pdf");
  await upload(page, [pdfUpload("contract.pdf", await makePdf(2))]);
  await expect(page.getByRole("application", { name: "مساحة التحرير" })).toBeVisible();
  await page.getByRole("button", { name: "توقيع", exact: true }).click();
  const pad = page.getByLabel("مساحة رسم التوقيع");
  await expect(pad).toBeVisible();
  const p = (await pad.boundingBox())!;
  await drag(page, [p.x + 30, p.y + p.height / 2], [p.x + p.width * 0.6, p.y + p.height * 0.3]);
  await drag(page, [p.x + p.width * 0.6, p.y + p.height * 0.3], [p.x + p.width * 0.8, p.y + p.height * 0.7]);
  await page.getByRole("button", { name: "إضافة إلى الصفحة" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "التاريخ" }).click();
  const settings = await openSettings(page, "ar");
  await expect(settings.getByText(/توقيع مرئي/)).toBeVisible();
  await closeSettings(page);
  await runTool(page, "حفظ الملف الموقّع");
  const out = await downloadResult(page, "ar");
  expect(out.name).toBe("contract-signed.pdf");
  const doc = await loadPdf(out.bytes);
  expect(imageCount(doc, 0)).toBe(1);
  expect((await pageTexts(out.bytes))[0]).toMatch(/\d{2}\/\d{2}\/\d{4}/);
});

test("sign PDF: typed signature", async ({ page }) => {
  await openTool(page, "sign-pdf", "en");
  await upload(page, [pdfUpload("contract.pdf", await makePdf(1))]);
  await page.getByRole("button", { name: "Signature", exact: true }).click();
  await page.getByRole("radio", { name: "Type" }).click();
  await page.getByPlaceholder("Type your name").fill("Hussam");
  await page.getByRole("button", { name: "Add to page" }).click();
  await runTool(page, "Save signed PDF");
  const doc = await loadPdf((await downloadResult(page, "en")).bytes);
  expect(imageCount(doc, 0)).toBe(1);
});
