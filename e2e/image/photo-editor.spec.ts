import type { Page } from "@playwright/test";
import { expect, test, canTouchDrag, closeSettings, decode, dragFrac, downloadResult, fixture, imageDiff, isMobile, makeImage, near, openTool, pinchOut, run, settings, sliderTo, sniff, upload, useEnglish } from "./helpers";

const ACTION = /^(حفظ الصورة|Save image)$/;
const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];
const YELLOW = [255, 255, 0];
const ROSE = [225, 29, 72]; // default drawing colour #e11d48

async function open(page: Page, opts: { width: number; height: number; pattern: "quadrants" | "solid" | "photo"; color?: string; name?: string }) {
  await openTool(page, "photo-editor");
  const input = await makeImage(page, { ...opts, format: "png" });
  await upload(page, [fixture(opts.name ?? "editor.png", input)]);
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  // Wait until the canvas has been drawn.
  await expect.poll(async () => page.getByTestId("editor-canvas").evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(10);
  return input;
}

async function save(page: Page) {
  await closeSettings(page);
  await run(page, ACTION);
  const out = await downloadResult(page);
  await page.getByRole("button", { name: /معالجة جديدة|Start over/ }).click();
  return out;
}

const canvas = (page: Page) => page.getByTestId("editor-canvas");

test.describe("Photo Editor", () => {
  test("rotate, flip, undo, redo — pixels move to the right places", async ({ page }) => {
    await open(page, { width: 400, height: 300, pattern: "quadrants", name: "صورة تجربة.png" });
    await page.getByRole("button", { name: /تدوير لليمين|Rotate right/ }).click();
    await page.getByRole("button", { name: /قلب أفقي|Flip horizontal/ }).click();
    let out = await save(page);
    expect(out.name).toBe("صورة تجربة-edited.png");
    expect(sniff(out.buffer)).toBe("png");
    let info = await decode(page, out.buffer, [[75, 100], [225, 100], [225, 300], [75, 300]]);
    expect([info.width, info.height]).toEqual([300, 400]);
    expect(info.pixels.map((p) => p.slice(0, 3))).toEqual([RED, BLUE, YELLOW, GREEN]);

    await page.getByRole("button", { name: /^(تراجع|Undo)$/ }).click();
    out = await save(page);
    info = await decode(page, out.buffer, [[75, 100]]);
    expect(info.pixels[0].slice(0, 3)).toEqual(BLUE);
    await page.getByRole("button", { name: /^(إعادة|Redo)$/ }).click();
    out = await save(page);
    info = await decode(page, out.buffer, [[75, 100]]);
    expect(info.pixels[0].slice(0, 3)).toEqual(RED);
  });

  test("brush draws; eraser removes the drawing but never the photo", async ({ page }) => {
    const input = await open(page, { width: 400, height: 300, pattern: "solid", color: "#ffffff" });
    await page.getByTestId("tool-brush").click();
    await dragFrac(page, canvas(page), [0.2, 0.5], [0.8, 0.5]);
    let out = await save(page);
    // The line is a few pixels thick; one of the pixels around y = 150 carries the full brush colour.
    const info = await decode(page, out.buffer, Array.from({ length: 11 }, (_, i) => [200, 145 + i] as [number, number]));
    expect(info.pixels.some((p) => near(p.slice(0, 3), ROSE, 30))).toBe(true);

    await page.getByTestId("tool-eraser").click();
    await dragFrac(page, canvas(page), [0.15, 0.5], [0.85, 0.5]);
    out = await save(page);
    const diff = await imageDiff(page, input, out.buffer);
    expect(diff.max).toBeLessThanOrEqual(3);
  });

  test("Arabic text, rectangle and arrow", async ({ page }) => {
    const input = await open(page, { width: 400, height: 300, pattern: "solid", color: "#ffffff" });
    const panel = await settings(page);
    await panel.getByLabel(/^(نص العناصر الجديدة|Text for new text items)$/).fill("مرحبا بالعالم");
    await closeSettings(page);
    await page.getByTestId("tool-text").click();
    await dragFrac(page, canvas(page), [0.5, 0.2], [0.5, 0.2]);
    await page.getByTestId("tool-rect").click();
    await dragFrac(page, canvas(page), [0.25, 0.4], [0.75, 0.9]);
    await page.getByTestId("tool-arrow").click();
    await dragFrac(page, canvas(page), [0.05, 0.05], [0.2, 0.3]);
    const out = await save(page);
    // Text near the top centre.
    expect((await imageDiff(page, input, out.buffer, { x: 120, y: 40, width: 160, height: 40 })).mean).toBeGreaterThan(5);
    // Rectangle outline on its left edge (x = 100) and an untouched middle.
    const info = await decode(page, out.buffer, [[100, 200], [200, 200]]);
    expect(near(info.pixels[0].slice(0, 3), ROSE, 40)).toBe(true);
    expect(info.pixels[1].slice(0, 3)).toEqual([255, 255, 255]);
    expect((await imageDiff(page, input, out.buffer, { x: 20, y: 15, width: 60, height: 75 })).mean).toBeGreaterThan(2);
  });

  test("move a text item by dragging it", async ({ page }) => {
    const input = await open(page, { width: 400, height: 300, pattern: "solid", color: "#ffffff" });
    const panel = await settings(page);
    await panel.getByRole("button", { name: /إضافة نص في الوسط|Add text in the centre/ }).click();
    await closeSettings(page);
    await page.getByTestId("tool-select").click();
    await dragFrac(page, canvas(page), [0.5, 0.5], [0.5, 0.15]);
    const out = await save(page);
    expect((await imageDiff(page, input, out.buffer, { x: 100, y: 120, width: 200, height: 60 })).max).toBe(0);
    expect((await imageDiff(page, input, out.buffer, { x: 100, y: 15, width: 200, height: 60 })).mean).toBeGreaterThan(0.5);
  });

  test("grayscale adjustment", async ({ page }) => {
    await open(page, { width: 200, height: 200, pattern: "quadrants" });
    const panel = await settings(page);
    await sliderTo(panel, /^(رمادي|Grayscale)$/, "max");
    const out = await save(page);
    const info = await decode(page, out.buffer, [[50, 50], [150, 150]]);
    for (const p of info.pixels) {
      expect(p[0]).toBe(p[1]);
      expect(p[1]).toBe(p[2]);
    }
    expect(info.pixels[1][0]).toBeGreaterThan(info.pixels[0][0]); // yellow is lighter than red
  });

  test("crop to 1:1, then resize, then a border frame; JPG export", async ({ page }) => {
    await open(page, { width: 400, height: 300, pattern: "quadrants" });
    await page.getByTestId("tool-crop").click();
    await page.getByRole("radio", { name: "1:1" }).click();
    await page.getByRole("button", { name: /تطبيق القص|Apply crop/ }).click();
    let panel = await settings(page);
    await panel.getByLabel(/^(العرض|Width)$/).fill("150");
    await expect(panel.getByLabel(/^(الارتفاع|Height)$/)).toHaveValue("150");
    await panel.getByRole("button", { name: /تطبيق الحجم|Apply size/ }).click();
    panel = await settings(page);
    await panel.getByRole("radio", { name: /^(حدّ|Border)$/ }).click();
    await panel.getByRole("radio", { name: "JPG" }).click();
    const out = await save(page);
    expect(sniff(out.buffer)).toBe("jpeg");
    const info = await decode(page, out.buffer, [[2, 2], [20, 20]]);
    // 150 + 2 × (4% of 150 = 6)
    expect([info.width, info.height]).toEqual([162, 162]);
    expect(info.pixels[0].slice(0, 3).every((v) => v > 240)).toBe(true);
    expect(near(info.pixels[1].slice(0, 3), RED, 40)).toBe(true);
  });

  test("image overlay and sticker; before/after; zoom buttons", async ({ page }) => {
    const input = await open(page, { width: 400, height: 300, pattern: "solid", color: "#ffffff" });
    const overlay = await makeImage(page, { width: 50, height: 50, pattern: "solid", color: "#00ff00", format: "png" });
    const panel = await settings(page);
    await panel.getByTestId("editor-image-input").setInputFiles([fixture("overlay.png", overlay)]);
    await expect(panel.getByRole("button", { name: /^(حذف العنصر|Delete item)$/ })).toBeVisible();
    await panel.getByRole("button", { name: /إضافة ملصق ⭐|Add sticker ⭐/ }).click();
    await closeSettings(page);
    const compare = page.getByRole("button", { name: /قبل \/ بعد|Before \/ after/ });
    await compare.click();
    await expect(page.getByTestId("editor-original")).toBeVisible();
    await compare.click();
    await expect(page.getByTestId("editor-original")).toBeHidden();
    await page.getByRole("button", { name: /تكبير العرض|Zoom in/ }).click();
    await expect(page.getByTestId("editor-zoom")).toHaveText("125%");
    await page.getByRole("button", { name: /ملاءمة الشاشة|Fit to screen/ }).click();
    await expect(page.getByTestId("editor-zoom")).toHaveText("100%");
    const out = await save(page);
    // Overlay: 40% of the width (160px) centred → x 120…280. The star sits on top in the middle.
    const info = await decode(page, out.buffer, [[110, 150], [125, 150]]);
    expect(info.pixels[0].slice(0, 3)).toEqual([255, 255, 255]);
    expect(near(info.pixels[1].slice(0, 3), GREEN, 10)).toBe(true);
    expect((await imageDiff(page, input, out.buffer, { x: 170, y: 120, width: 60, height: 60 })).mean).toBeGreaterThan(20);
  });

  test("pinch to zoom on a touch screen", async ({ page }) => {
    test.skip(!isMobile(page), "touch only");
    test.skip(
      !canTouchDrag(page),
      "Playwright can only send multi-touch (pinch) in Chromium (DevTools Input.dispatchTouchEvent); WebKit and Firefox have no multi-touch input API. Pinch is covered by the Chromium mobile project.",
    );
    await open(page, { width: 400, height: 300, pattern: "photo" });
    await pinchOut(page, canvas(page).locator(".."));
    await expect.poll(async () => Number((await page.getByTestId("editor-zoom").textContent())!.replace("%", ""))).toBeGreaterThan(150);
  });

  test("English UI, WebP export with polaroid frame", async ({ page }) => {
    await useEnglish(page);
    await open(page, { width: 300, height: 200, pattern: "photo" });
    const panel = await settings(page);
    await panel.getByRole("radio", { name: "Polaroid" }).click();
    await panel.getByRole("radio", { name: "WebP" }).click();
    await closeSettings(page);
    await run(page, /^Save image$/);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("webp");
    const info = await decode(page, out.buffer);
    // 4% of 200 = 8 → 300 + 16 wide, 200 + 8 + 28 tall
    expect([info.width, info.height]).toEqual([316, 236]);
  });
});
