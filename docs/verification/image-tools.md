# Image tools — verification report (Milestone 2)

Branch `milestone-2-image-tools`. Last run: 4 November 2026.

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 problems) |
| `npm test` (Vitest) | 184 passing — 63 new for image tools (`src/tools/image/lib/*.test.ts`) |
| `npm run build` | pass, 41 static pages |
| `npm run test:e2e` (Playwright, Chromium) | 121 passing, 1 skipped (pinch test is phone-only), run twice with no flakes |

E2E runs against the static build (`out/`, served by `e2e/serve.mjs`), in two projects: **desktop** 1366×900 and **mobile** 375×812 with touch. Every spec runs in both. Fixtures are drawn in the browser at test time (photo-like noise, colour quadrants, solid, transparent). Filenames include Arabic (`صورة تجربة.png`, `شعار.svg`) and Unicode (`ملف ✓ 🎨.png`). Every downloaded file is decoded and checked: format by magic bytes, pixel size, and pixel values in known places. Any uncaught page error fails the test.

## Status per tool

All nine tools are **Operational** (status `"operational"` in `src/lib/tools/image-tools.ts`).

| Tool | What the tests check |
|---|---|
| **Compress Image** | JPG photo: output smaller than 70% of input, same size, savings shown. PNG lossless: every pixel identical (max diff 0), and the PNG encoder ran in the Web Worker. PNG "fewer colours": < 60% of input, mean diff < 12. Max side 600 + WebP: 600×400 WebP. Batch of JPG+WebP+PNG+broken file: ZIP with 3 valid images, the broken file shows "Couldn't read this image". English LTR run. |
| **Resize Image** | Width 400 with lock → height field fills 300, preview "800×600 → 400×300", output 400×300 with correct corner colours. Unlocked → exact 500×120. Percent 25% → 160×120 (English). Max 300×300 batch: 300×225, 225×300, and a 100×80 image is not enlarged (ZIP). |
| **Crop Image** | 1:1 + X=0 → 300×300 with the four quadrant colours in place. Dragging the corner handle shrinks the box (mouse on desktop, **real touch events** on mobile), dragging the box moves it, output size matches. 16:9 + resize after crop → 320×180 WebP. Custom ratio 2:1 → 500×250. |
| **Rotate & Flip** | 90° clockwise: 100×200 with blue/red/green/yellow at the expected corners. Flip H, then H+V: correct colours. **EXIF**: a JPG with Orientation=6 comes out 100×200, upright, and with no EXIF block. Free 45°: 283×283 with transparent corners. |
| **Convert Image** | Transparent PNG → JPG: corners white, centre red. PNG/JPG → WebP: transparency kept (ZIP). SVG (viewBox only) → PNG at width 512: 512×256, exact colours, transparent background, and a `<script>` inside the SVG did not run. SVG with fill → JPG 80×40. |
| **Watermark Image** | Arabic text bottom-right: that area changes, top-left area untouched (max diff 0). Tiled: all four quarters change. Logo top-left at 100% opacity: logo colour at (40,40), rest untouched. Batch of two → ZIP of two, sizes kept (English). Live preview visible. |
| **Meme Generator** | Arabic top/bottom captions change top and bottom bands, middle untouched. Top caption bar: 500×512 output (400 + 28%), white bar with dark text. Caption dragged from top to middle; image layer dragged to bottom-left (green pixel there). Emoji sticker (English). |
| **Blur & Pixelate** | Action disabled with a message until an area is drawn. Pixelate: inside area changes, outside max diff 0. Solid cover + ellipse: centre exactly black, bounding-box corner still white. Undo/redo via buttons and Ctrl+Z / Ctrl+Shift+Z; select + delete an area. Blur on two images via "Use these areas on all images" → ZIP of two. |
| **Photo Editor** | Rotate right + flip H: 300×400 with expected corners; undo and redo change the output accordingly. Brush draws the brush colour; eraser removes it again (diff to original ≤ 3) without touching the photo. Arabic text, rectangle (outline colour on its edge, inside untouched), arrow. Dragging a text item moves it (old spot back to original). Grayscale: r = g = b. Crop 1:1 → resize 150 → border frame → JPG 162×162. Image overlay + star sticker, before/after toggle, zoom buttons. **Pinch zoom with real two-finger touch** (mobile). Polaroid frame + WebP 316×236 (English). |

Layout (`e2e/image/layout.spec.ts`): every tool page with a file loaded, Arabic and English, desktop and 375px: correct `dir` and **no horizontal scroll**. This test found and fixed an overflow (see below).

### Unit tests (`src/tools/image/lib/`)

- `geometry.test.ts` — resize maths (ratio lock, fit-inside for mixed batches, percent, max, never enlarge), step-down plan, rotated bounds, crop presets, centred / clamped / moved / resized crop rectangles with and without ratio, minimum size.
- `pixels.test.ts` — tone LUT, brightness/exposure/contrast, grayscale, saturation, sepia, Gaussian box sizes, blur (flat stays flat, edge smooths, no dark halo next to transparency), sharpen, pixelate.
- `png.test.ts` — CRC32 check value; our PNG encoder round-trips exactly (decoded in the test with Node zlib) for 1-bit and 2-bit palettes with tRNS, greyscale, grey+alpha, RGB, RGBA; colour reduction stays within N colours and close to the original, transparent pixels stay transparent.
- `layout.test.ts` — 9 watermark anchors with margins, tiling covers the image at 0/30/−45/90°, text direction, word wrap, blur regions (normalise, move, pixels, strength scaling, undo/redo), SVG sizes and units, format detection.
- `editor-model.test.ts` — point mapping for rotate/flip/crop/resize (four turns = identity), objects and strokes follow the picture, frames, hit-testing, move/scale, arrow head, blur strength, history.

## How it works (short)

- One module per tool in `src/tools/image/*.tsx`, shared code in `src/tools/image/lib/`. All tools use the shared workspace; tools with an editing surface (crop, rotate, watermark, meme, blur, photo editor) provide a `Preview`.
- Decoding uses `createImageBitmap(file, { imageOrientation: "from-image" })`, so camera orientation is applied to the pixels.
- Heavy pixel work (blur, pixelate, filters, PNG encoding, colour reduction) runs in a Web Worker; if a worker can't start, the same code runs on the main thread.
- PNG output uses our own encoder (`lib/png.ts`): it picks the smallest exact form (1/2/4/8-bit palette, greyscale, RGB without alpha, or RGBA) and a filter per row, deflated with the standard `CompressionStream`. That is what makes "lossless" real.
- Canvases are created through `createCanvas`, which checks the browser can really use that size, and released after use.

## Known limitations

- **Metadata**: saving through the canvas removes EXIF (camera, GPS) and colour profiles. Every tool says so. Wide-gamut photos may look slightly different after saving.
- **PNG lossless** is exact for the pixels the browser decodes. Semi-transparent pixels can shift by about 1 level because canvases store premultiplied alpha; gamma/ICC chunks are dropped. Deflate uses the browser's default level (no zopfli), so savings on already-optimised PNGs are small — the "Keep original if not smaller" switch (on by default) then returns the original file unchanged and says so.
- **Compression can make a file larger** (e.g. re-encoding an already small JPG at high quality). With the switch on, the original is kept when format and size are unchanged; otherwise the results panel shows the "+%" honestly.
- **WebP saving** depends on the browser (some Safari versions can't encode WebP). This is detected from the output bytes and shown as a clear error.
- **Very large images** are limited by the browser's canvas size (about 16.7 MP on iPhones). This is detected and shown as a clear error instead of a blank result.
- **SVG** is drawn as an image: scripts don't run and external files don't load (so SVGs that link external images/fonts render without them). SVGs with embedded HTML (`foreignObject`) may be refused by the browser; that is reported. An SVG with no size and no viewBox is drawn at 300×150 unless a width is set.
- **Fonts**: IBM Plex Sans Arabic and Readex Pro are self-hosted. "Impact", "Tahoma", "Times" and "Naskh" are system fonts and fall back if missing. Emoji stickers use the device's emoji font, so they look different per OS.
- **Photo editor**: crop/rotate/flip/resize change the picture (undoable, up to 40 steps); texts, shapes and images stay editable and move with the picture. Freehand drawing sits above the photo and below texts/shapes; the eraser removes drawing only. Free-angle rotation is in the Rotate tool, not the editor. One image at a time. On very large photos the undo history holds full-size canvases, which uses memory.
- **Blur**: not secure redaction (said in the tool). Areas are drawn per image; "Use these areas on all images" copies them by position.
- **Browsers**: automated tests run in Chromium (desktop and mobile emulation with touch). Firefox and Safari were not tested automatically.
- Animated GIF, BMP, HEIC/AVIF input are not accepted by these tools (registry `accepts` unchanged).

## New dependencies (devDependencies only — nothing added to the shipped bundle)

| Package | License | Why |
|---|---|---|
| `@playwright/test` | Apache-2.0 | Browser tests of real output |
| `rolldown` | MIT | Bundles the image Web Worker at build time (was already installed through Vitest; now explicit) |

## Changes to shared files

- `package.json` / `package-lock.json`: `predev` and `prebuild` now also run `node scripts/build-image-worker.mjs`; new script `test:e2e`; the two devDependencies above.
- `eslint.config.mjs`: ignore `public/vendor/**` (generated PDF.js and image workers), `test-results/**`, `playwright-report/**`.
- `.gitignore`: `/test-results/`, `/playwright-report/`.
- New: `playwright.config.ts` (generic, `testDir: "e2e"`, so PDF specs can live in `e2e/pdf/`; port from `E2E_PORT`, default 4173), `e2e/serve.mjs` (tiny static server for `out/`, no download needed), `scripts/build-image-worker.mjs`.
- `src/lib/tools/image-tools.ts`: the nine Milestone 2 tools set to `"operational"`.
- No changes to `src/components/workspace/*`, `src/components/files/*` or `src/lib/engine/*` — the shared workspace worked as designed for all nine tools.

### Problems found and fixed during this milestone

- **Turbopack + static export does not bundle `new Worker(new URL("./x.ts", import.meta.url))`**: it copies the `.ts` file as a raw asset and the worker silently fails. Fixed by bundling the worker into `public/vendor/image-worker.js` at build time. A test now checks the worker really answers (`data-image-worker="ready"`), not just that one was created.
- Live previews released a canvas that was still in use when the file's size was filled in, which crashed the page on some runs. Fixed in `lib/preview.tsx`; e2e now fails on any uncaught page error.
- A `<fieldset>` (settings section) grew wider than the 320px settings column on desktop because fieldsets default to `min-width: min-content`. Fixed with `min-w-0`.

## Not done / open

- `docs/VERIFICATION.md` not edited (left for the parent session to merge). The Milestone 1 row "Universal workspace … Implemented, not fully verified" can now be marked Operational: all nine image tools exercise files, preview, settings sidebar and mobile sheet, process, results, download, ZIP and before/after end to end (renaming an output before download was not tested).
- README not edited; it may want a line for `npm run test:e2e` (needs `npm run build` first, and `npx playwright install chromium` once).
