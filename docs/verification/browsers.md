# Cross-browser verification (Milestone 5)

Last update: 4 November 2026, branch `m5-cross-browser`.

All browser tests now run in five Playwright projects:

| Project | Engine | Device |
|---|---|---|
| `desktop` | Chromium | 1366 × 900 |
| `mobile` | Chromium | 375 × 812, touch, `isMobile` |
| `firefox-desktop` | Firefox 157 (Gecko) | 1366 × 900 |
| `webkit-desktop` | WebKit 27.2 (Safari engine) | 1366 × 900 |
| `webkit-iphone` | WebKit 27.2 | iPhone 13 (390 × 664, touch, `isMobile`, Mobile Safari UA) |

```bash
npx playwright install chromium firefox webkit   # once
npm run build
npm run test:e2e        # daily: Chromium desktop + mobile
npm run test:e2e:all    # all five projects
npm run test:e2e:firefox
npm run test:e2e:webkit # desktop Safari + iPhone
npm run test:e2e:pdf:all  # PDF-only config, all five projects
```

## Results matrix (full run, `npm run test:e2e:all`)

Passed / tests in the area. The difference is the skips listed below.

| Area | Chromium desktop | Chromium mobile | Firefox desktop | WebKit desktop | WebKit iPhone |
|---|---|---|---|---|---|
| Image tools (52) | 51 | 52 | 51 | 51 | 51 |
| PDF tools (43) | 43 | 41 | 43 | 43 | 41 |
| Workflows (12) | 12 | 12 | 12 | 12 | 12 |
| Layout / RTL, no horizontal scroll (27) | 27 | 27 | 27 | 27 | 27 |
| **Total (134)** | **133** | **132** | **133** | **133** | **131** |

Full runs of all 670 tests:

| Run | Result |
|---|---|
| 1 | 662 passed, 8 skipped, 0 failed (9.7 min) |
| 2 | 661 passed, 8 skipped, 1 failed — see "Flake" below (11.3 min) |
| 3 | 662 passed, 8 skipped, 0 failed (15.9 min) |
| 4 (after the GIF drag fix, final) | 662 passed, 8 skipped, 0 failed (9.9 min) |
| PDF-only config (`test:e2e:pdf:all`, 215 tests) | 211 passed, 4 skipped, 0 failed |

Other checks on the branch: `npm run typecheck` clean, `npm run lint` clean, `npm test` 394 passed (27 files), `npm run build` OK.

Before this work (Chromium-only tests, first run on the new browsers): 371 passed, 23 failed, 2 skipped out of 396 Firefox/WebKit tests.

## Product fixes

1. **Image to PDF preview stuck on "Reading the image…" on short phone screens** — `src/tools/pdf/image-to-pdf.tsx`.
   Image sizes were read only when a file's thumbnail scrolled near the screen. On a phone shorter than ~800 px (iPhone 13: 664 px) the file list is below the fold, so the page mock-up never appeared until the user scrolled. Not WebKit-specific: Chromium's 812 px emulation simply hid it. The preview now reads the size of the file it shows (and shows "This browser couldn't read this image" if that fails). Regression test: `e2e/pdf/convert.spec.ts` "page preview appears on a short phone screen" (600 px tall in the phone projects).
2. **Compress PDF: misleading result when the browser can't recompress images** — `src/tools/pdf/compress.tsx`, `lib/compress-core.ts`, `lib/compress-result.ts`, `lib/compress-settings.ts`.
   Image recompression needs `OffscreenCanvas` in the worker. Without it (Safari before 16.4, and Playwright's WebKit build) the switch silently did nothing and the result said "already well compressed". Now: a warning under the switch before running, a distinct `imagesSkipped: "browser"` reason, and a result note that is shown even when the original file is returned. Unit test added in `compress.test.ts`.
3. **WebP output warns up front where it can't be saved** — `src/tools/image/lib/ui.tsx` (`OutputFormatFields`, new `useCanEncode`).
   Safari's `canvas.toBlob("image/webp")` silently returns a PNG. The engine already refused with "This browser can't save images as WebP…"; the format picker now also shows that warning as soon as WebP is chosen (the existing, unused `canEncode()` check is now used). Affects every image tool and workflow step that uses the shared format picker.
4. **GIF Maker: dragged frame dropped on the wrong frame** — `src/tools/image/gif.tsx`.
   The drop target came from the last `pointermove`. WebKit can coalesce that last move away before `pointerup`, so a diagonal drag (frames wrap into rows) dropped onto the frame it last passed over — 2 of 15 runs in WebKit desktop, also seen once on the merged tree. The drop index is now taken from the `pointerup` position. After the fix: GIF spec ×10 in all five projects, 200 / 200 passed.
5. **Phone settings bar and sheet** — `src/components/workspace/tool-workspace.tsx`.
   Sticky bottom bar and bottom sheet get `env(safe-area-inset-bottom)` padding; the sheet's height cap is `85dvh` where supported (85vh could run under Safari's bottom toolbar). Note: the site doesn't set `viewport-fit=cover`, so iOS keeps content out of the home-indicator area itself and the inset is 0 today; the padding makes the bars correct if `cover` is ever turned on.

## Browser capability gaps and how they are handled

| Capability | Where it's missing | Handling | Test |
|---|---|---|---|
| WebP encoding via canvas | Safari (macOS/iOS). Playwright's Windows WebKit *can* encode WebP, so it is reproduced by patching `toBlob` | Warning in the format picker + clear error on processing; JPG/PNG work | `e2e/image/convert.spec.ts` "a browser without a WebP encoder (like Safari)…" — runs in all 5 projects |
| `OffscreenCanvas` (PDF image recompression in the worker) | Safari < 16.4; Playwright WebKit | Warning in settings + result note; lossless optimisation still runs | `e2e/pdf/compress.spec.ts` image recompression test asserts the messages where `OffscreenCanvas` is missing, and real downsampling elsewhere |
| ICC profile in canvas JPEGs | Firefox writes none (Chromium/WebKit embed sRGB) | Nothing to fix; Image Metadata reports what's there | `metadata.spec.ts` adapts the fixture |
| Private `deBG` chunk in canvas PNGs | Firefox adds a random 16-char `deBG` chunk to PNGs exported on http(s) pages (not on about:blank) | Image Metadata correctly lists it as "Application data: deBG" and removes it | `metadata.spec.ts` |
| `showSaveFilePicker`, `ImageDecoder`, `navigator.canShare` | Absent in all three Playwright desktop builds | Not used for core flows (downloads use `<a download>`; Share button only appears when `canShare` exists on a phone UA) | All download tests pass |
| Module workers, `createImageBitmap` options, `CompressionStream`, HTML5 drag and drop | Supported in all three engines | — | Workflow drag reorder passes in Firefox and WebKit desktop |

## Test-only fixes (not product changes)

- **Touch drags**: Playwright can send touch moves only in Chromium (DevTools `Input.dispatchTouchEvent`). `e2e/image/helpers.ts` `canTouchDrag()` uses real touch in Chromium mobile and the mouse elsewhere (same pointer-event handlers in the app). Real touch drags remain covered by the Chromium mobile project.
- **Arabic PDF fixture**: `page.pdf()` exists only in Chromium. `e2e/pdf/compare.spec.ts` prints the fixture with a separate headless Chromium in other projects; the Compare tool itself runs in the project's browser.
- **Image Metadata fixtures** (`e2e/image/metadata.spec.ts`): no longer assume the browser's own encoder output has no metadata (Firefox `deBG`) or always has an ICC profile (Firefox JPEG).
- **Phone-only skips** used `project.name === "mobile"`; they now use `project.use.isMobile`, so they also apply to `webkit-iphone`.

## Skips (8 per full run)

| Test | Projects | Reason |
|---|---|---|
| Photo Editor › pinch to zoom on a touch screen | Chromium desktop, Firefox desktop, WebKit desktop | Touch-only test on desktop projects (pre-existing) |
| Photo Editor › pinch to zoom on a touch screen | WebKit iPhone | Playwright can only send multi-touch in Chromium (DevTools `Input.dispatchTouchEvent`); WebKit and Firefox have no multi-touch input API. Covered by Chromium mobile |
| Edit PDF › delete with keyboard | Chromium mobile, WebKit iPhone | Keyboard Delete is a desktop shortcut; touch uses the delete button (pre-existing) |
| Crop PDF › dragging the box | Chromium mobile, WebKit iPhone | Drag is covered on desktop; phones use the same pointer events (pre-existing) |

## Manual / screenshot check (WebKit iPhone 13 and Firefox 1366 px, Arabic)

Homepage, Compress Image with an Arabic filename (`صورة الرحلة إلى بغداد 2024 النهائية.png`), its settings bottom sheet, Photo Editor and Workflow builder: correct `dir="rtl"`, IBM Plex Sans Arabic loaded, no horizontal scroll, sticky action bar and bottom sheet placed correctly, filename and `.png` extension shown in the right order, no page errors.

## Merge check with `main` (4223939: security headers + CSP)

`git merge-tree` shows no conflicts. The merged tree (a detached trial commit, not on any branch) was built and run in all five projects with `main`'s CSP-enforcing `e2e/serve.mjs` and `security.spec.ts`: 696 passed, 8 skipped, 1 failed — the GIF drag above, fixed afterwards. No CSP problems in Firefox or WebKit.

## Flake

Run 2: `[webkit-desktop] PDF to image: pages to JPG at 150 DPI` — the "Convert to images" click waited 90 s for the button to become stable (Playwright's stability check needs animation frames, so the WebKit page had stopped painting under full parallel load, with other sessions running on the same machine). It passed in run 1 and in 20 / 20 targeted repeats. Kept under watch.

## Open

- Real Safari on macOS/iOS and real iPhone touch (scrolling vs. dragging, pinch) are not available on this Windows machine; Playwright's WebKit is the closest available engine. A check on a real iPhone is recommended before launch, especially WebP and touch gestures.
- Playwright's WebKit lacks `OffscreenCanvas`, so PDF image recompression is verified in Chromium and Firefox only.
