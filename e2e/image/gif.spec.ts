import { GifReader } from "omggif";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { expect, test, closeSettings, dragBy, fixture, makeImage, near, openTool, run, settings, upload, useEnglish } from "./helpers";

const ACTION = /^(إنشاء GIF|Make GIF)$/;
const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];
const WHITE = [255, 255, 255, 255];

/**
 * The shared results panel is currently wider than a 375px screen (its result card has no min-w-0),
 * so on the 375px project the layout viewport is zoomed out and Playwright's click lands on the
 * sticky header/action bar. Until that shared fix lands, dispatch the click on the button itself.
 */
async function downloadResult(page: Page) {
  const button = page.getByRole("button", { name: /^(تنزيل|Download)$/ }).first();
  const [file] = await Promise.all([page.waitForEvent("download"), button.dispatchEvent("click")]);
  return { name: file.suggestedFilename(), buffer: await readFile(await file.path()) };
}

function readGif(buf: Buffer) {
  expect(buf.toString("latin1", 0, 6)).toBe("GIF89a");
  const reader = new GifReader(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  const frames = Array.from({ length: reader.numFrames() }, (_, i) => {
    const px = new Uint8Array(reader.width * reader.height * 4);
    reader.decodeAndBlitFrameRGBA(i, px);
    const at = (x: number, y: number) => Array.from(px.subarray((y * reader.width + x) * 4, (y * reader.width + x) * 4 + 4));
    return { info: reader.frameInfo(i), at };
  });
  return { reader, frames };
}

async function threeFrames(page: Parameters<typeof makeImage>[0], size = { width: 120, height: 80 }) {
  const colours = ["#ff0000", "#00ff00", "#0000ff"];
  return Promise.all(colours.map((color) => makeImage(page, { ...size, pattern: "solid", color, format: "png" })));
}

test.describe("GIF Maker", () => {
  test("3 images → animated GIF with per-frame delays and a loop count (Arabic names)", async ({ page }) => {
    await openTool(page, "gif-maker");
    const [r, g, b] = await threeFrames(page);
    await upload(page, [fixture("إطار أحمر.png", r), fixture("إطار أخضر.png", g), fixture("إطار أزرق.png", b)]);
    await expect(page.getByTestId("gif-frame")).toHaveCount(3);
    await expect(page.getByTestId("gif-frame-counter")).toHaveText(/\/ 3$/);

    const panel = await settings(page);
    await panel.getByRole("radio", { name: "لكل إطار", exact: true }).click();
    await panel.getByRole("radio", { name: "عدد مرات", exact: true }).click();
    await panel.getByLabel("عدد مرات التشغيل").fill("2");
    await expect(panel.getByTestId("gif-size")).toContainText("120×80");
    await closeSettings(page);

    const durations = page.getByTestId("gif-frame-duration");
    await durations.nth(0).fill("200");
    await durations.nth(1).fill("300");
    await durations.nth(2).fill("1250");
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.name).toBe("إطار أحمر-animated.gif");
    // Encoded in the bundled Web Worker, not the main-thread fallback.
    await expect(page.locator("html")).toHaveAttribute("data-image-worker", "ready");
    const { reader, frames } = readGif(out.buffer);
    expect([reader.width, reader.height]).toEqual([120, 80]);
    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f.info.delay)).toEqual([20, 30, 125]);
    expect(reader.loopCount()).toBe(1); // plays twice = one repeat
    expect(frames[0].at(60, 40)).toEqual(RED);
    expect(frames[1].at(0, 0)).toEqual(GREEN);
    expect(frames[2].at(119, 79)).toEqual(BLUE);
  });

  test("reorder by button and by dragging, global duration, loop forever, fit with background (English)", async ({ page }) => {
    await useEnglish(page);
    await openTool(page, "gif-maker");
    const [r, g] = await threeFrames(page);
    const tall = await makeImage(page, { width: 40, height: 80, pattern: "solid", color: "#0000ff", format: "png" });
    await upload(page, [fixture("a.png", r), fixture("b.png", g), fixture("c.png", tall)]);
    await expect(page.getByTestId("gif-frame")).toHaveCount(3);

    // Keyboard/touch-friendly buttons: move frame 3 (blue) to the start.
    await page.getByRole("button", { name: "Move frame 3 earlier" }).click();
    await page.getByRole("button", { name: "Move frame 2 earlier" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("gif-frame").first()).toContainText("c.png");
    // Drag frame 3 (green) onto frame 2 (red) → order c, b, a.
    const handles = page.getByTestId("gif-frame-handle");
    const from = (await handles.nth(2).boundingBox())!;
    const to = (await handles.nth(1).boundingBox())!;
    await dragBy(page, handles.nth(2), to.x - from.x, to.y - from.y);
    await expect(page.getByTestId("gif-frame").nth(1)).toContainText("b.png");
    await expect(page.getByTestId("gif-frame").nth(2)).toContainText("a.png");

    const panel = await settings(page);
    await panel.getByLabel("Frame duration").fill("150");
    await panel.getByLabel("Background colour").fill("#ffffff");
    await expect(panel.getByTestId("gif-total")).toContainText("0.45 s");
    await closeSettings(page);
    await run(page, ACTION);
    const out = await downloadResult(page);
    expect(out.name).toBe("c-animated.gif");
    const { reader, frames } = readGif(out.buffer);
    // Output size follows the first frame (40×80); the others are fitted inside it on white.
    expect([reader.width, reader.height]).toEqual([40, 80]);
    expect(reader.loopCount()).toBe(0);
    expect(frames.map((f) => f.info.delay)).toEqual([15, 15, 15]);
    expect(frames[0].at(20, 40)).toEqual(BLUE);
    expect(frames[1].at(20, 40)).toEqual(GREEN);
    expect(frames[1].at(20, 2)).toEqual(WHITE); // letterbox above the 40×27 green frame
    expect(frames[2].at(20, 40)).toEqual(RED);
  });

  test("custom size with fill (crop), transparent background, fewer colours, one palette", async ({ page }) => {
    await useEnglish(page);
    await openTool(page, "gif-maker");
    const photo = await makeImage(page, { width: 300, height: 200, pattern: "photo", format: "jpeg" });
    const square = await makeImage(page, { width: 100, height: 100, pattern: "transparent-square", format: "png" });
    await upload(page, [fixture("photo.jpg", photo, "image/jpeg"), fixture("square.png", square)]);
    const panel = await settings(page);
    await panel.getByRole("radio", { name: "Custom", exact: true }).click();
    await panel.getByLabel("Width").fill("100");
    await panel.getByLabel("Height").fill("100");
    await panel.getByRole("radio", { name: "Fill", exact: true }).click();
    await panel.getByRole("switch", { name: "Transparent background" }).click();
    await panel.getByLabel("Max colours").selectOption("32");
    await panel.getByRole("radio", { name: "One for all", exact: true }).click();
    await closeSettings(page);
    await run(page, ACTION);
    const { reader, frames } = readGif((await downloadResult(page)).buffer);
    expect([reader.width, reader.height]).toEqual([100, 100]);
    expect(frames).toHaveLength(2);
    expect(frames[0].info.palette_offset).toBe(frames[1].info.palette_offset); // one global palette
    expect(frames[1].info.transparent_index).not.toBeNull();
    expect(frames[1].at(5, 5)[3]).toBe(0);
    expect(near(frames[1].at(50, 50), RED, 40)).toBe(true); // one shared 32-colour palette with a photo
    const colours = new Set<string>();
    for (let y = 0; y < 100; y += 3) for (let x = 0; x < 100; x += 3) colours.add(frames[0].at(x, y).join());
    expect(colours.size).toBeLessThanOrEqual(32);
  });

  test("the live preview animates", async ({ page }) => {
    await openTool(page, "gif-maker");
    const [r, g, b] = await threeFrames(page);
    await upload(page, [fixture("1.png", r), fixture("2.png", g), fixture("3.png", b)]);
    const preview = page.getByTestId("gif-preview");
    await expect(preview).toBeVisible();
    const seen = new Set<string>();
    for (let i = 0; i < 30 && seen.size < 3; i++) {
      seen.add((await preview.getAttribute("data-frame")) ?? "");
      await page.waitForTimeout(150);
    }
    expect(seen.size).toBe(3);
    // Pausing stops it.
    await page.getByTestId("gif-play").click();
    const frame = await preview.getAttribute("data-frame");
    await page.waitForTimeout(1200);
    await expect(preview).toHaveAttribute("data-frame", frame!);
  });
});
