import type { Page } from "@playwright/test";
import JSZip from "jszip";
import { expect, test, decode, downloadResult, fixture, imageDiff, makeImage, openTool, run, settings, sliderTo, sniff, upload, useEnglish } from "./helpers";

const ACTION = /^(إضافة العلامة|Add watermark)$/;

async function solidRedText(page: Page) {
  const panel = await settings(page);
  await panel.getByLabel(/^(نص العلامة|Watermark text)$/).fill("حقوق محفوظة ٢٠٢٦ Visions");
  await panel.getByLabel(/^(اللون|Colour)$/).fill("#ff0000");
  await panel.getByLabel(/حدّ حول النص|Outline/).click();
  await sliderTo(panel, /الشفافية|Opacity/, "max");
  return panel;
}

test.describe("Watermark Image", () => {
  test("Arabic text in the bottom-right corner changes only that area", async ({ page }) => {
    await openTool(page, "watermark-image");
    const input = await makeImage(page, { width: 600, height: 400, pattern: "solid", color: "#ffffff", format: "png" });
    await upload(page, [fixture("صورة تجربة.png", input)]);
    await expect(page.getByRole("img", { name: /معاينة العلامة|Watermark preview/ })).toBeVisible();
    await solidRedText(page);
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.name).toBe("صورة تجربة-watermarked.png");
    expect(sniff(out.buffer)).toBe("png");
    const br = await imageDiff(page, input, out.buffer, { x: 300, y: 300, width: 300, height: 100 });
    const tl = await imageDiff(page, input, out.buffer, { x: 0, y: 0, width: 300, height: 250 });
    expect(br.mean).toBeGreaterThan(2);
    expect(tl.max).toBe(0);
  });

  test("tiled watermark covers all four quarters", async ({ page }) => {
    await openTool(page, "watermark-image");
    const input = await makeImage(page, { width: 800, height: 600, pattern: "solid", color: "#ffffff", format: "png" });
    await upload(page, [fixture("tile.png", input)]);
    const panel = await solidRedText(page);
    await panel.getByLabel(/تكرار على كامل الصورة|Tile across/).click();
    await run(page, ACTION);
    const out = await downloadResult(page);
    for (const r of [
      { x: 0, y: 0, width: 400, height: 300 },
      { x: 400, y: 0, width: 400, height: 300 },
      { x: 0, y: 300, width: 400, height: 300 },
      { x: 400, y: 300, width: 400, height: 300 },
    ]) {
      expect((await imageDiff(page, input, out.buffer, r)).mean).toBeGreaterThan(2);
    }
  });

  test("logo at top-left, no text", async ({ page }) => {
    await openTool(page, "watermark-image");
    const input = await makeImage(page, { width: 600, height: 400, pattern: "solid", color: "#ffffff", format: "jpeg" });
    const logo = await makeImage(page, { width: 100, height: 100, pattern: "solid", color: "#0000ff", format: "png" });
    await upload(page, [fixture("logo-test.jpg", input, "image/jpeg")]);
    const panel = await settings(page);
    await panel.getByLabel(/^(إضافة نص|Add text)$/).click();
    await panel.getByLabel(/^(إضافة شعار|Add logo)$/).click();
    await panel.getByTestId("logo-input").setInputFiles([fixture("شعار.png", logo)]);
    await expect(panel.getByRole("button", { name: /إزالة الشعار|Remove logo/ })).toBeVisible();
    await sliderTo(panel, /الشفافية|Opacity/, "max");
    await panel.getByRole("radio", { name: /أعلى اليسار|Top left/ }).click();
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("jpeg");
    // margin 3% of 400 = 12px, logo 18% of 600 = 108px → (40, 40) is inside the logo, (300, 300) is not.
    const info = await decode(page, out.buffer, [[40, 40], [300, 300]]);
    expect(info.pixels[0][2]).toBeGreaterThan(200);
    expect(info.pixels[0][0]).toBeLessThan(50);
    expect(info.pixels[1].slice(0, 3).every((v) => v > 240)).toBe(true);
  });

  test("batch: two images → ZIP of two watermarked images (English)", async ({ page }) => {
    await useEnglish(page);
    await openTool(page, "watermark-image");
    const a = await makeImage(page, { width: 400, height: 300, pattern: "photo", format: "jpeg" });
    const b = await makeImage(page, { width: 300, height: 500, pattern: "photo", format: "png" });
    await upload(page, [fixture("a.jpg", a, "image/jpeg"), fixture("b.png", b)]);
    const panel = await settings(page);
    await panel.getByLabel("Watermark text").fill("© Visions 2026");
    await run(page, /^Add watermark$/);
    const out = await downloadResult(page, true);
    const zip = await JSZip.loadAsync(out.buffer);
    expect(Object.keys(zip.files).sort()).toEqual(["a-watermarked.jpg", "b-watermarked.png"]);
    const bOut = Buffer.from(await zip.files["b-watermarked.png"].async("uint8array"));
    const diff = await imageDiff(page, b, bOut, { x: 150, y: 400, width: 150, height: 100 });
    expect(diff.mean).toBeGreaterThan(0.5);
    const info = await decode(page, bOut);
    expect([info.width, info.height]).toEqual([300, 500]);
  });
});
