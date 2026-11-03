import { expect, test, decode, dragFrac, downloadResult, fixture, imageDiff, makeImage, openTool, run, settings, sniff, upload, useEnglish } from "./helpers";

const ACTION = /^(حفظ الميم|Save meme)$/;

test.describe("Meme Generator", () => {
  test("top and bottom Arabic captions with outline", async ({ page }) => {
    await openTool(page, "meme-generator");
    const input = await makeImage(page, { width: 600, height: 400, pattern: "solid", color: "#3366cc", format: "png" });
    await upload(page, [fixture("صورة تجربة.png", input)]);
    await expect(page.getByRole("button", { name: ACTION }).filter({ visible: true }).first()).toBeDisabled();
    const panel = await settings(page);
    await panel.getByLabel(/^(نص 1|Text 1)$/).fill("عندما يعمل الكود");
    await panel.getByLabel(/^(نص 2|Text 2)$/).fill("من أول مرة");
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.name).toBe("صورة تجربة-meme.jpg");
    expect(sniff(out.buffer)).toBe("jpeg");
    const info = await decode(page, out.buffer);
    expect([info.width, info.height]).toEqual([600, 400]);
    expect((await imageDiff(page, input, out.buffer, { x: 100, y: 10, width: 400, height: 60 })).mean).toBeGreaterThan(10);
    expect((await imageDiff(page, input, out.buffer, { x: 100, y: 330, width: 400, height: 60 })).mean).toBeGreaterThan(10);
    expect((await imageDiff(page, input, out.buffer, { x: 0, y: 150, width: 600, height: 100 })).mean).toBeLessThan(2);
  });

  test("caption bar layout adds a white bar above the picture", async ({ page }) => {
    await openTool(page, "meme-generator");
    const input = await makeImage(page, { width: 500, height: 400, pattern: "photo", format: "jpeg" });
    await upload(page, [fixture("bar.jpg", input, "image/jpeg")]);
    const panel = await settings(page);
    await panel.getByRole("radio", { name: /شريط علوي|Top caption/ }).click();
    await panel.getByLabel(/^(نص 1|Text 1)$/).fill("لما تشوف الفاتورة");
    await panel.getByRole("radio", { name: "PNG" }).click();
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("png");
    const info = await decode(page, out.buffer, [[4, 4], [495, 100]]);
    expect([info.width, info.height]).toEqual([500, 512]); // 400 + 28%
    expect(info.pixels[0].slice(0, 3)).toEqual([255, 255, 255]);
    expect(info.pixels[1].slice(0, 3)).toEqual([255, 255, 255]);
    // Dark caption text inside the bar.
    const dark = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes]));
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, 500, 112).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 80 && d[i + 1] < 80 && d[i + 2] < 80) n++;
      return n;
    }, out.buffer.toString("base64"));
    expect(dark).toBeGreaterThan(200);
  });

  test("drag a caption to the middle; add an image layer", async ({ page }) => {
    await openTool(page, "meme-generator");
    const input = await makeImage(page, { width: 600, height: 400, pattern: "solid", color: "#808080", format: "png" });
    const sticker = await makeImage(page, { width: 100, height: 100, pattern: "solid", color: "#00ff00", format: "png" });
    await upload(page, [fixture("drag.png", input)]);
    let panel = await settings(page);
    await panel.getByLabel(/^(نص 1|Text 1)$/).fill("MOVE ME");
    await panel.getByTestId("meme-image-input").setInputFiles([fixture("sticker.png", sticker)]);
    if (await page.getByRole("dialog").isVisible()) await page.keyboard.press("Escape");
    const stage = page.getByRole("img", { name: /معاينة الميم|Meme preview/ });
    await expect(page.locator("[data-layer]")).toHaveCount(2);
    // The image layer starts in the centre; move it to the bottom-left.
    await dragFrac(page, stage, [0.5, 0.5], [0.2, 0.75]);
    // The caption starts at the top (y = 10%); move it to the middle.
    await dragFrac(page, stage, [0.5, 0.1], [0.5, 0.45]);
    panel = await settings(page);
    await panel.getByRole("radio", { name: "PNG" }).click();
    await run(page, ACTION);
    const out = await downloadResult(page);
    const info = await decode(page, out.buffer, [[120, 300], [300, 30]]);
    expect(info.pixels[0].slice(0, 3)).toEqual([0, 255, 0]);
    expect(info.pixels[1].slice(0, 3)).toEqual([128, 128, 128]); // caption moved away from the top
    expect((await imageDiff(page, input, out.buffer, { x: 150, y: 150, width: 300, height: 60 })).mean).toBeGreaterThan(10);
  });

  test("emoji sticker, English UI", async ({ page }) => {
    await useEnglish(page);
    await openTool(page, "meme-generator");
    const input = await makeImage(page, { width: 400, height: 400, pattern: "solid", color: "#ffffff", format: "png" });
    await upload(page, [fixture("e.png", input)]);
    const panel = await settings(page);
    await panel.getByRole("button", { name: "Add sticker 🔥" }).click();
    await run(page, /^Save meme$/);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("jpeg");
    // The sticker is drawn at x = 80%, y = 50%.
    expect((await imageDiff(page, input, out.buffer, { x: 280, y: 160, width: 120, height: 80 })).mean).toBeGreaterThan(5);
  });
});
