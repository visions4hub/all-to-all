import JSZip from "jszip";
import { expect, test, decode, dragFrac, downloadResult, fixture, imageDiff, makeImage, openTool, run, settings, sniff, upload, useEnglish } from "./helpers";

const ACTION = /^(تطبيق وحفظ|Apply & save)$/;

test.describe("Blur & Pixelate", () => {
  test("needs an area first; pixelate changes only inside the area", async ({ page }) => {
    await openTool(page, "blur-image");
    const input = await makeImage(page, { width: 400, height: 300, pattern: "photo", format: "png" });
    await upload(page, [fixture("صورة تجربة.png", input)]);
    await expect(page.getByText(/اسحب على الصورة لتحديد منطقة واحدة|Drag on the image to mark at least one area/).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: ACTION }).filter({ visible: true }).first()).toBeDisabled();
    await dragFrac(page, page.getByTestId("blur-overlay"), [0.1, 0.1], [0.5, 0.5]);
    await expect(page.locator("[data-region]")).toHaveCount(1);
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.name).toBe("صورة تجربة-blurred.png");
    expect(sniff(out.buffer)).toBe("png");
    const inside = await imageDiff(page, input, out.buffer, { x: 60, y: 45, width: 120, height: 90 });
    const outside = await imageDiff(page, input, out.buffer, { x: 240, y: 180, width: 160, height: 120 });
    expect(inside.mean).toBeGreaterThan(5);
    expect(outside.max).toBe(0);
  });

  test("solid cover is fully opaque black; ellipse leaves the box corners", async ({ page }) => {
    await openTool(page, "blur-image");
    const input = await makeImage(page, { width: 400, height: 400, pattern: "solid", color: "#ffffff", format: "png" });
    await upload(page, [fixture("mask.png", input)]);
    await page.getByRole("radio", { name: /تغطية|Solid/ }).click();
    await page.getByRole("radio", { name: /بيضاوي|Ellipse/ }).click();
    await dragFrac(page, page.getByTestId("blur-overlay"), [0.25, 0.25], [0.75, 0.75]);
    await run(page, ACTION);
    const out = await downloadResult(page);
    const info = await decode(page, out.buffer, [[200, 200], [105, 105], [280, 200]]);
    expect(info.pixels[0].slice(0, 4)).toEqual([0, 0, 0, 255]);
    expect(info.pixels[1].slice(0, 3)).toEqual([255, 255, 255]); // box corner, outside the ellipse
    expect(info.pixels[2].slice(0, 3)).toEqual([0, 0, 0]);
  });

  test("undo and redo areas (buttons and keyboard)", async ({ page }) => {
    await openTool(page, "blur-image");
    const input = await makeImage(page, { width: 300, height: 300, pattern: "photo", format: "jpeg" });
    await upload(page, [fixture("u.jpg", input, "image/jpeg")]);
    const overlay = page.getByTestId("blur-overlay");
    await dragFrac(page, overlay, [0.05, 0.05], [0.3, 0.3]);
    await dragFrac(page, overlay, [0.6, 0.6], [0.9, 0.9]);
    await expect(page.locator("[data-region]")).toHaveCount(2);
    await page.getByRole("button", { name: /^(تراجع|Undo)$/ }).click();
    await expect(page.locator("[data-region]")).toHaveCount(1);
    await page.getByRole("button", { name: /^(إعادة|Redo)$/ }).click();
    await expect(page.locator("[data-region]")).toHaveCount(2);
    await page.keyboard.press("Control+z");
    await expect(page.locator("[data-region]")).toHaveCount(1);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator("[data-region]")).toHaveCount(2);
    // Select the first area and delete it.
    await page.locator("[data-region]").first().click();
    await page.getByRole("button", { name: /حذف المنطقة المحددة|Delete selected area/ }).click();
    await expect(page.locator("[data-region]")).toHaveCount(1);
  });

  test("blur on two images via 'use these areas on all images' → ZIP (English)", async ({ page }) => {
    await useEnglish(page);
    await openTool(page, "blur-image");
    const a = await makeImage(page, { width: 400, height: 300, pattern: "photo", format: "png" });
    const b = await makeImage(page, { width: 400, height: 300, pattern: "photo", format: "webp" });
    await upload(page, [fixture("a.png", a), fixture("b.webp", b, "image/webp")]);
    await page.getByRole("radio", { name: "Blur" }).click();
    await dragFrac(page, page.getByTestId("blur-overlay"), [0.2, 0.2], [0.8, 0.8]);
    const panel = await settings(page);
    await panel.getByRole("button", { name: "Use these areas on all images" }).click();
    await run(page, /^Apply & save$/);
    const out = await downloadResult(page, true);
    const zip = await JSZip.loadAsync(out.buffer);
    expect(Object.keys(zip.files).sort()).toEqual(["a-blurred.png", "b-blurred.webp"]);
    const aOut = Buffer.from(await zip.files["a-blurred.png"].async("uint8array"));
    expect((await imageDiff(page, a, aOut, { x: 150, y: 100, width: 100, height: 100 })).mean).toBeGreaterThan(5);
    expect((await imageDiff(page, a, aOut, { x: 0, y: 0, width: 40, height: 300 })).max).toBe(0);
  });
});
