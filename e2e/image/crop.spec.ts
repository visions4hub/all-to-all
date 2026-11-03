import { expect, test, decode, dragBy, downloadResult, fixture, makeImage, openTool, run, settings, sniff, upload, useEnglish } from "./helpers";

const ACTION = /^(قص الصورة|Crop)$/;

test.describe("Crop Image", () => {
  test("1:1 ratio, X input, exact crop rectangle and pixels", async ({ page }) => {
    await openTool(page, "crop-image");
    const input = await makeImage(page, { width: 400, height: 300, pattern: "quadrants", format: "png" });
    await upload(page, [fixture("صورة تجربة.png", input)]);
    await expect(page.getByTestId("crop-size")).toHaveText("400×300");
    const panel = await settings(page);
    await panel.getByRole("radio", { name: "1:1" }).click();
    await panel.getByLabel("X", { exact: true }).fill("0");
    await expect(panel.getByLabel("X", { exact: true })).toHaveValue("0");
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.name).toBe("صورة تجربة-cropped.png");
    const info = await decode(page, out.buffer, [[10, 10], [290, 10], [10, 290], [290, 290]]);
    expect([info.width, info.height]).toEqual([300, 300]);
    expect(info.pixels.map((p) => p.slice(0, 3))).toEqual([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]);
  });

  test("dragging a corner handle (mouse or touch) shrinks the crop", async ({ page }) => {
    await openTool(page, "crop-image");
    const input = await makeImage(page, { width: 400, height: 300, pattern: "quadrants", format: "jpeg" });
    await upload(page, [fixture("drag.jpg", input, "image/jpeg")]);
    await expect(page.getByTestId("crop-size")).toHaveText("400×300");
    const rect = page.getByTestId("crop-rect");
    const box = (await rect.boundingBox())!;
    // Drag the bottom-right handle to the middle of the image.
    // Start a few pixels inside the corner, where a finger lands (the outer half of the handle is clipped).
    await dragBy(page, rect.locator('[data-handle="se"]'), -box.width / 2, -box.height / 2, { x: -6, y: -6 });
    const text = await page.getByTestId("crop-size").textContent();
    const [w, h] = text!.split("×").map(Number);
    expect(Math.abs(w - 200)).toBeLessThanOrEqual(4);
    expect(Math.abs(h - 150)).toBeLessThanOrEqual(4);
    // Move the box by dragging its middle.
    await dragBy(page, rect, box.width / 4, box.height / 4);
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("jpeg");
    const info = await decode(page, out.buffer, [[Math.round(w / 2) + 15, Math.round(h / 2) + 15]]);
    expect([info.width, info.height]).toEqual([w, h]);
    // The moved box sits around the image centre, where all four quadrants meet — its middle is yellow (bottom-right).
    expect(info.pixels[0][0]).toBeGreaterThan(200);
    expect(info.pixels[0][1]).toBeGreaterThan(200);
  });

  test("16:9 with resize after crop, English", async ({ page }) => {
    await useEnglish(page);
    await openTool(page, "crop-image");
    const input = await makeImage(page, { width: 800, height: 800, pattern: "photo", format: "webp" });
    await upload(page, [fixture("w.webp", input, "image/webp")]);
    const panel = await settings(page);
    await panel.getByRole("radio", { name: "16:9" }).click();
    await expect(page.getByTestId("crop-size")).toHaveText("800×450");
    await panel.getByLabel(/Resize after crop/).fill("320");
    await run(page, /^Crop$/);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("webp");
    const info = await decode(page, out.buffer);
    expect([info.width, info.height]).toEqual([320, 180]);
  });

  test("custom ratio 2:1", async ({ page }) => {
    await openTool(page, "crop-image");
    const input = await makeImage(page, { width: 500, height: 500, pattern: "photo", format: "png" });
    await upload(page, [fixture("c.png", input)]);
    const panel = await settings(page);
    await panel.getByRole("radio", { name: /مخصص|Custom/ }).click();
    await panel.getByLabel(/نسبة العرض|Ratio width/).fill("2");
    await panel.getByLabel(/نسبة الارتفاع|Ratio height/).fill("1");
    await expect(page.getByTestId("crop-size")).toHaveText("500×250");
  });
});
