import { expect, test, fixture, makeImage, openTool, upload, useEnglish } from "./helpers";

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
