import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { decode, downloadResult, fixture, makeImage, openTool, run, settings, sniff, upload, useEnglish } from "./helpers";

const ACTION = /^(تحويل|Convert)$/;

test.describe("Convert Image", () => {
  test("transparent PNG → JPG uses the background colour", async ({ page }) => {
    await openTool(page, "convert-image");
    const input = await makeImage(page, { width: 200, height: 200, pattern: "transparent-square", format: "png" });
    await upload(page, [fixture("صورة تجربة.png", input)]);
    const panel = await settings(page);
    await panel.getByRole("radio", { name: "JPG" }).click();
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.name).toBe("صورة تجربة-converted.jpg");
    expect(sniff(out.buffer)).toBe("jpeg");
    const info = await decode(page, out.buffer, [[5, 5], [100, 100]]);
    expect(info.pixels[0].slice(0, 3).every((v) => v > 245)).toBe(true);
    expect(info.pixels[1][0]).toBeGreaterThan(230);
    expect(info.pixels[1][1]).toBeLessThan(30);
  });

  test("PNG → WebP keeps transparency; JPG → PNG", async ({ page }) => {
    await openTool(page, "convert-image");
    const png = await makeImage(page, { width: 120, height: 120, pattern: "transparent-square", format: "png" });
    const jpg = await makeImage(page, { width: 90, height: 60, pattern: "photo", format: "jpeg" });
    await upload(page, [fixture("t.png", png), fixture("j.jpg", jpg, "image/jpeg")]);
    const panel = await settings(page);
    await panel.getByRole("radio", { name: "WebP" }).click();
    await run(page, ACTION);
    const out = await downloadResult(page, true);
    const zip = await JSZip.loadAsync(out.buffer);
    expect(Object.keys(zip.files).sort()).toEqual(["j-converted.webp", "t-converted.webp"]);
    const t = Buffer.from(await zip.files["t-converted.webp"].async("uint8array"));
    expect(sniff(t)).toBe("webp");
    const info = await decode(page, t, [[3, 3], [60, 60]]);
    expect(info.pixels[0][3]).toBe(0);
    expect(info.pixels[1][3]).toBe(255);
  });

  test("SVG → PNG at a chosen width, scripts in the SVG never run", async ({ page }) => {
    await useEnglish(page);
    await openTool(page, "convert-image");
    const svg = Buffer.from(
      `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">` +
        `<script>document.title="pwned"</script>` +
        `<rect x="0" y="0" width="50" height="50" fill="#0000ff"/><circle cx="75" cy="25" r="20" fill="#ff0000"/></svg>`,
    );
    await upload(page, [fixture("شعار.svg", svg, "image/svg+xml")]);
    const panel = await settings(page);
    await panel.getByLabel("Output width (optional)").fill("512");
    await expect(panel.getByText(/no scripts inside it run/)).toBeVisible();
    await run(page, /^Convert$/);
    const out = await downloadResult(page);
    expect(out.name).toBe("شعار-converted.png");
    expect(sniff(out.buffer)).toBe("png");
    const info = await decode(page, out.buffer, [[100, 128], [384, 128], [500, 10]]);
    expect([info.width, info.height]).toEqual([512, 256]);
    expect(info.pixels[0].slice(0, 4)).toEqual([0, 0, 255, 255]);
    expect(info.pixels[1].slice(0, 3)).toEqual([255, 0, 0]);
    expect(info.pixels[2][3]).toBe(0); // transparent background kept
    expect(await page.title()).not.toBe("pwned");
  });

  test("SVG with fill colour → JPG", async ({ page }) => {
    await openTool(page, "convert-image");
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="40" height="40" fill="#00ff00"/></svg>`);
    await upload(page, [fixture("g.svg", svg, "image/svg+xml")]);
    const panel = await settings(page);
    await panel.getByRole("radio", { name: "JPG" }).click();
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("jpeg");
    const info = await decode(page, out.buffer, [[20, 20], [70, 20]]);
    expect([info.width, info.height]).toEqual([80, 40]);
    expect(info.pixels[0][1]).toBeGreaterThan(230);
    expect(info.pixels[1].slice(0, 3).every((v) => v > 240)).toBe(true);
  });
});
