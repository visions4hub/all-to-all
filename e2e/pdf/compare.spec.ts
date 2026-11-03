import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { closeSettings, downloadResult, L, openSettings, openTool, pdfUpload, runTool, upload, type Locale } from "./helpers";

async function englishPair() {
  const make = async (pages: (string[] | "picture")[]) => {
    const d = await PDFDocument.create();
    const font = await d.embedFont(StandardFonts.Helvetica);
    for (const content of pages) {
      const p = d.addPage([595, 842]);
      if (content === "picture") p.drawRectangle({ x: 100, y: 300, width: 300, height: 300, color: rgb(0.2, 0.4, 0.8) });
      else content.forEach((line, i) => p.drawText(line, { x: 50, y: 780 - i * 30, size: 18, font }));
    }
    return d.save();
  };
  return {
    a: await make([["Contract version one", "Price: 100 USD"], "picture"]),
    b: await make([["Contract version one", "Price: 250 USD", "Signed by both parties"], "picture", ["Appendix"]]),
  };
}

/** Arabic PDFs printed by Chromium itself, so the text layer is real shaped Arabic. */
async function arabicPair(page: Page) {
  const print = async (body: string) => {
    const p = await page.context().newPage();
    await p.setContent(`<html dir="rtl" lang="ar"><body style="font-family: Tahoma, Arial, sans-serif; font-size: 22px; padding: 40px">${body}</body></html>`);
    const pdf = await p.pdf({ format: "A4" });
    await p.close();
    return pdf;
  };
  return {
    a: await print("<p>تقرير الطالب للفصل الأول</p><p>الدرجة النهائية ممتاز</p>"),
    b: await print("<p>تقرير الطالب للفصل الثاني</p><p>الدرجة النهائية جيد جدا</p>"),
  };
}

const preview = (page: Page) => page.locator("main");

// PDF.js reads the yeh in Chrome's «جيد» as Persian yeh (U+06CC): the font shares the glyph.
// The tool compares them as the same letter and shows text as extracted.
const arabicYeh = (s: string) => s.replace(/ی/g, "ي");

for (const locale of ["ar", "en"] as Locale[]) {
  test(`compare: preview views and HTML report with differences (${locale})`, async ({ page }) => {
    await openTool(page, "compare-pdf", locale);
    const { a, b } = await englishPair();
    await upload(page, [pdfUpload("v1.pdf", a), pdfUpload("v2.pdf", b)]);

    // Page counts differ → said up front.
    await expect(preview(page).getByText(L(locale, "عدد الصفحات مختلف (2 و3)", "The page counts differ (2 and 3)"))).toBeVisible();
    // Side by side: two rendered pages.
    await expect(preview(page).getByRole("img", { name: new RegExp(L(locale, "الملف الأول — 1", "First file — 1")) })).toBeVisible();
    await expect(preview(page).getByRole("img", { name: new RegExp(L(locale, "الملف الثاني — 1", "Second file — 1")) })).toBeVisible();
    await expect(page.getByTestId("page-status")).toHaveText(L(locale, "فيها فروقات", "Changed"));

    // Text view: removed and added words.
    await preview(page).getByRole("radio", { name: L(locale, "النص", "Text") }).click();
    const diff = page.getByTestId("text-diff");
    await expect(diff.locator("del")).toHaveText(["100"]);
    await expect(diff.locator("ins")).toHaveText(["250", "Signed by both parties"]);

    // Difference view: a real share of pixels changed.
    await preview(page).getByRole("radio", { name: L(locale, "الفروقات", "Difference") }).click();
    await expect(page.getByTestId("visual-share")).toBeVisible();
    const share = Number((await page.getByTestId("visual-share").textContent())!.match(/([\d.]+)%/)![1]);
    expect(share).toBeGreaterThan(0);

    // Page 3 exists only in the second file.
    await preview(page).getByRole("button", { name: L(locale, "الصفحة 3: في الملف الثاني فقط", "Page 3: Only in the second file") }).click();
    await expect(page.getByTestId("page-status")).toHaveText(L(locale, "في الملف الثاني فقط", "Only in the second file"));

    await runTool(page, L(locale, "إنشاء تقرير المقارنة", "Create comparison report"));
    const out = await downloadResult(page, locale);
    expect(out.name).toBe("v1-comparison.html");
    const html = out.bytes.toString("utf8");
    expect(html).toContain(`<html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}">`);
    expect(html).toContain("<del>100</del>");
    expect(html).toContain("<ins>250</ins>");
    expect(html).toContain("<ins>Appendix</ins>");
    expect(html).toContain(L(locale, "عدد الصفحات مختلف: 2 في الملف الأول و3 في الملف الثاني", "Page counts differ: 2 in the first file and 3 in the second"));
    // The picture-only page (2) has no text: reported honestly; it looks identical, so no details section.
    expect(html).toMatch(new RegExp(L(locale, "صفحات بلا نص \\(قد تكون ممسوحة ضوئياً\\)", "Pages without text \\(may be scanned\\)") + `: <span dir="ltr">2</span>`));
    // Difference pictures are embedded, nothing is fetched.
    expect(html).toContain('src="data:image/jpeg;base64,');
    expect(html).not.toMatch(/<script|<link /);
  });
}

test("compare: Arabic text differences, word by word", async ({ page }) => {
  await openTool(page, "compare-pdf", "ar");
  const { a, b } = await arabicPair(page);
  await upload(page, [pdfUpload("التقرير القديم.pdf", a), pdfUpload("التقرير الجديد.pdf", b)]);
  await preview(page).getByRole("radio", { name: "النص" }).click();
  const diff = page.getByTestId("text-diff");
  await expect(diff.locator("del")).toHaveText(["الأول", "ممتاز"]);
  expect((await diff.locator("ins").allTextContents()).map(arabicYeh)).toEqual(["الثاني", "جيد جدا"]);
  await expect(diff).toContainText("تقرير الطالب للفصل");

  const settings = await openSettings(page, "ar");
  await settings.getByRole("switch", { name: "مقارنة بصرية في التقرير" }).click();
  await closeSettings(page);
  await runTool(page, "إنشاء تقرير المقارنة");
  const html = arabicYeh((await downloadResult(page, "ar")).bytes.toString("utf8"));
  expect(html).toContain("<del>الأول</del>");
  expect(html).toContain("<ins>الثاني</ins>");
  expect(html).toContain("<del>ممتاز</del>");
  expect(html).toContain("<ins>جيد جدا</ins>");
  expect(html).toContain("المقارنة البصرية لم تُضمَّن");
  expect(html).not.toContain("data:image");
});

test("compare: identical files say so", async ({ page }) => {
  await openTool(page, "compare-pdf", "en");
  const { a } = await englishPair();
  await upload(page, [pdfUpload("a.pdf", a), pdfUpload("b.pdf", a)]);
  await expect(page.getByTestId("page-status")).toHaveText("Identical");
  await runTool(page, "Create comparison report");
  await expect(page.locator("section[aria-live=polite]")).toContainText("Pages with differences: 0");
  const html = (await downloadResult(page, "en")).bytes.toString("utf8");
  expect(html).toContain("No differences were found.");
});
