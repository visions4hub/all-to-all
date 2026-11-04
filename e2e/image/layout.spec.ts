import { expect, test, fixture, makeImage, openTool, run, upload, useEnglish } from "./helpers";

const SLUGS = [
  "compress-image",
  "resize-image",
  "crop-image",
  "rotate-image",
  "convert-image",
  "watermark-image",
  "meme-generator",
  "blur-image",
  "photo-editor",
  "image-metadata",
  "gif-maker",
];

for (const locale of ["ar", "en"] as const) {
  for (const slug of SLUGS) {
    test(`${slug} (${locale}): direction and no horizontal scroll with a file loaded`, async ({ page }, info) => {
      if (locale === "en") await useEnglish(page);
      await openTool(page, slug);
      await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
      const input = await makeImage(page, { width: 1200, height: 800, pattern: "photo", format: "jpeg" });
      await upload(page, [fixture("صورة.jpg", input, "image/jpeg")]);
      await expect(page.getByRole("button", { name: /^(الإعدادات|Settings)$/ }).or(page.getByRole("heading", { name: /^(الإعدادات|Settings)$/ })).first()).toBeVisible();
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/${info.project.name}-${locale}-${slug}.png`, fullPage: true });
    });
  }
}

// The results panel used to be wider than a phone screen after processing (long filename row).
for (const locale of ["ar", "en"] as const) {
  test(`results (${locale}): no horizontal scroll after processing, long Arabic filename`, async ({ page }) => {
    if (locale === "en") await useEnglish(page);
    await openTool(page, "compress-image");
    const input = await makeImage(page, { width: 900, height: 600, pattern: "photo", format: "jpeg" });
    const name = "صورة رحلة العائلة إلى الشمال في الصيف الماضي مع الأصدقاء والأقارب.jpg";
    await upload(page, [fixture(name, input, "image/jpeg"), fixture("second-photo.jpg", input, "image/jpeg")]);
    await run(page, /^(ضغط الصور|Compress)$/);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

// A long, unbreakable filename must not widen pages that list files (phones).
for (const path of ["/", "/studio/", "/workflows/"]) {
  test(`${path}: long Arabic filename keeps the page within the screen`, async ({ page }) => {
    await page.goto(path);
    const input = await makeImage(page, { width: 900, height: 600, pattern: "photo", format: "jpeg" });
    const name = "صورة رحلة العائلة إلى الشمال في الصيف الماضي مع الأصدقاء والأقارب.jpg";
    await page.locator('input[type="file"]').first().setInputFiles([fixture(name, input, "image/jpeg"), fixture("second.jpg", input, "image/jpeg")]);
    await expect(page.getByText(name.slice(0, 20)).first()).toBeVisible();
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
