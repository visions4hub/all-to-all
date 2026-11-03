import { expect, test, decode, downloadResult, fixture, makeImage, near, openTool, run, settings, sniff, upload } from "./helpers";

const ACTION = /^(تدوير وحفظ|Rotate & save)$/;
const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];
const YELLOW = [255, 255, 0];

/** Adds an EXIF APP1 segment with the given Orientation tag right after the JPEG SOI marker. */
function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // little-endian TIFF header, IFD at 8
    0x01, 0x00, // 1 entry
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, // Orientation (SHORT)
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const len = payload.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, len >> 8, len & 0xff]), payload]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

test.describe("Rotate & Flip Image", () => {
  test("rotates 90° clockwise: known pixels move to the right corners", async ({ page }) => {
    await openTool(page, "rotate-image");
    const input = await makeImage(page, { width: 200, height: 100, pattern: "quadrants", format: "png" });
    await upload(page, [fixture("صورة تجربة.png", input)]);
    const panel = await settings(page);
    await expect(panel.getByTestId("rotate-total")).toHaveText("90°");
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.name).toBe("صورة تجربة-rotated-90.png");
    const info = await decode(page, out.buffer, [[25, 50], [75, 50], [75, 150], [25, 150]]);
    expect([info.width, info.height]).toEqual([100, 200]);
    expect(info.pixels.map((p) => p.slice(0, 3))).toEqual([BLUE, RED, GREEN, YELLOW]);
  });

  test("horizontal + vertical flip without rotation", async ({ page }) => {
    await openTool(page, "rotate-image");
    const input = await makeImage(page, { width: 200, height: 100, pattern: "quadrants", format: "png" });
    await upload(page, [fixture("q.png", input)]);
    const panel = await settings(page);
    await panel.getByRole("button", { name: /عكس عقارب الساعة|Left 90°/ }).click();
    await panel.getByRole("button", { name: /^(أفقي|Horizontal)$/ }).click();
    await expect(panel.getByTestId("rotate-total")).toHaveText("0°");
    let { buffer } = await (async () => {
      await run(page, ACTION);
      return downloadResult(page);
    })();
    let info = await decode(page, buffer, [[50, 25], [150, 25]]);
    expect([info.width, info.height]).toEqual([200, 100]);
    expect(info.pixels.map((p) => p.slice(0, 3))).toEqual([GREEN, RED]);

    // Now flip vertically too: top-left shows the original bottom-right.
    await page.getByRole("button", { name: /معالجة جديدة|Start over/ }).click();
    const panel2 = await settings(page);
    await panel2.getByRole("button", { name: /^(عمودي|Vertical)$/ }).click();
    await run(page, ACTION);
    ({ buffer } = await downloadResult(page));
    info = await decode(page, buffer, [[50, 25]]);
    expect(info.pixels[0].slice(0, 3)).toEqual(YELLOW);
  });

  test("camera EXIF orientation is applied to the pixels (JPG)", async ({ page }) => {
    await openTool(page, "rotate-image");
    const raw = await makeImage(page, { width: 200, height: 100, pattern: "quadrants", format: "jpeg", quality: 0.95 });
    const input = withExifOrientation(raw, 6); // 6 = display rotated 90° clockwise
    await upload(page, [fixture("camera.jpg", input, "image/jpeg")]);
    const panel = await settings(page);
    await panel.getByRole("button", { name: /عكس عقارب الساعة|Left 90°/ }).click();
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(sniff(out.buffer)).toBe("jpeg");
    expect(out.name).toBe("camera-upright.jpg");
    const info = await decode(page, out.buffer, [[25, 50], [75, 50], [75, 150], [25, 150]]);
    expect([info.width, info.height]).toEqual([100, 200]);
    const expected = [BLUE, RED, GREEN, YELLOW];
    info.pixels.forEach((p, i) => expect(near(p.slice(0, 3), expected[i], 40)).toBe(true));
    // The output has no EXIF orientation left (APP1 removed), so it stays upright everywhere.
    expect(out.buffer.includes(Buffer.from("Exif\0\0", "latin1"))).toBe(false);
  });

  test("free rotation enlarges the canvas with transparent corners", async ({ page }) => {
    await openTool(page, "rotate-image");
    const input = await makeImage(page, { width: 200, height: 200, pattern: "solid", color: "#ff0000", format: "png" });
    await upload(page, [fixture("r.png", input)]);
    const panel = await settings(page);
    await panel.getByRole("button", { name: /عكس عقارب الساعة|Left 90°/ }).click();
    const slider = panel.getByLabel(/تدوير دقيق|Fine rotation/).getByRole("slider");
    await slider.focus();
    // Radix slider: each ArrowUp adds one step (0.5°); PageUp adds 10 steps.
    for (let i = 0; i < 9; i++) await page.keyboard.press("PageUp");
    await expect(panel.getByTestId("rotate-total")).toHaveText("45°");
    await run(page, ACTION);
    const out = await downloadResult(page);
    const info = await decode(page, out.buffer, [[2, 2], [141, 141]]);
    expect(info.width).toBe(283);
    expect(info.height).toBe(283);
    expect(info.pixels[0][3]).toBe(0);
    expect(info.pixels[1].slice(0, 4)).toEqual([255, 0, 0, 255]);
  });
});
