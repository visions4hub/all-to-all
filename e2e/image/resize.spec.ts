import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { decode, downloadResult, fixture, makeImage, openTool, run, settings, sniff, upload, useEnglish } from "./helpers";

const ACTION = /^(تغيير الحجم|Resize)$/;

test.describe("Resize Image", () => {
  test("width with locked ratio fills the height and previews the result", async ({ page }) => {
    await openTool(page, "resize-image");
    const input = await makeImage(page, { width: 800, height: 600, pattern: "quadrants", format: "png" });
    await upload(page, [fixture("صورة تجربة.png", input)]);
    const panel = await settings(page);
    await panel.getByLabel(/^(العرض|Width)$/).fill("400");
    await expect(panel.getByLabel(/^(الارتفاع|Height)$/)).toHaveValue("300");
    await expect(panel.getByTestId("resize-preview")).toContainText("800×600 → 400×300");
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.name).toBe("صورة تجربة-400x300.png");
    expect(sniff(out.buffer)).toBe("png");
    const info = await decode(page, out.buffer, [[50, 50], [350, 250]]);
    expect([info.width, info.height]).toEqual([400, 300]);
    expect(info.pixels[0].slice(0, 3)).toEqual([255, 0, 0]);
    expect(info.pixels[1].slice(0, 3)).toEqual([255, 255, 0]);
  });

  test("unlocked ratio gives the exact size", async ({ page }) => {
    await openTool(page, "resize-image");
    const input = await makeImage(page, { width: 300, height: 300, pattern: "photo", format: "jpeg" });
    await upload(page, [fixture("sq.jpg", input, "image/jpeg")]);
    const panel = await settings(page);
    await panel.getByRole("button", { name: /الحفاظ على النسبة|Keep aspect ratio/ }).click();
    await panel.getByLabel(/^(العرض|Width)$/).fill("500");
    await panel.getByLabel(/^(الارتفاع|Height)$/).fill("120");
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("jpeg");
    const info = await decode(page, out.buffer);
    expect([info.width, info.height]).toEqual([500, 120]);
  });

  test("percent mode, English", async ({ page }) => {
    await useEnglish(page);
    await openTool(page, "resize-image");
    const input = await makeImage(page, { width: 640, height: 480, pattern: "photo", format: "webp" });
    await upload(page, [fixture("p.webp", input, "image/webp")]);
    const panel = await settings(page);
    await panel.getByRole("radio", { name: "Percent" }).click();
    await panel.getByLabel("Percentage").fill("25");
    await run(page, /^Resize$/);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("webp");
    const info = await decode(page, out.buffer);
    expect([info.width, info.height]).toEqual([160, 120]);
  });

  test("max size batch: mixed orientations fit inside, smaller ones are not enlarged (ZIP)", async ({ page }) => {
    await openTool(page, "resize-image");
    const land = await makeImage(page, { width: 800, height: 600, pattern: "photo", format: "png" });
    const port = await makeImage(page, { width: 600, height: 800, pattern: "photo", format: "png" });
    const small = await makeImage(page, { width: 100, height: 80, pattern: "photo", format: "png" });
    await upload(page, [fixture("land.png", land), fixture("port.png", port), fixture("small.png", small)]);
    const panel = await settings(page);
    await panel.getByRole("radio", { name: /حد أقصى|Max size/ }).click();
    await panel.getByLabel(/أقصى عرض|Max width/).fill("300");
    await panel.getByLabel(/أقصى ارتفاع|Max height/).fill("300");
    await run(page, ACTION);
    const out = await downloadResult(page, true);
    const zip = await JSZip.loadAsync(out.buffer);
    const sizes: Record<string, number[]> = {};
    for (const name of Object.keys(zip.files)) {
      const info = await decode(page, Buffer.from(await zip.files[name].async("uint8array")));
      sizes[name] = [info.width, info.height];
    }
    expect(sizes).toEqual({ "land-300x225.png": [300, 225], "port-225x300.png": [225, 300], "small-100x80.png": [100, 80] });
  });
});
