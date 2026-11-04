# PDF tools — verification report (Milestone 3)

Branch `milestone-3-pdf-tools`. Last update: 4 November 2026.

All 15 Milestone 3 PDF tools are **operational**: each one's real output is opened and checked by automated tests, in Node (pdf-lib / PDF.js) and in a real browser (Playwright, static build, desktop 1366 px and phone 375 px, Arabic RTL and English LTR). `compress-pdf` and `compare-pdf` are untouched (Milestone 4, still "building").

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` (Vitest) | 199 passing (78 new for PDF tools, 121 from Milestone 1) |
| `npm run build` | pass (static export) |
| `npm run test:e2e:pdf` (Playwright) | 62 passing, 2 skipped by design (desktop-only drag/keyboard cases), stable over repeated runs |

Run the browser tests with `npm run build` then `npm run test:e2e:pdf` (config `playwright.pdf.config.ts`, serves `out/` on port 4174 with `e2e/pdf/static-server.mjs`). `PDF_E2E_URL=http://localhost:3000 npm run test:e2e:pdf` runs them against a dev server.

## Per tool

Node = Vitest integration test that builds fixture PDFs, runs the processor and reopens the output. Browser = Playwright test that uploads, processes, downloads and opens the downloaded file.

| Tool | Status | What the tests check |
|---|---|---|
| Merge PDF | Operational | Node: page count 5, page order and text extracted after merge (`A 1…B 3`), Arabic filename `تقرير الطالب-merged.pdf`, a link annotation survives, a damaged input names the failing file. Browser: AR + EN, desktop + phone; reordering with the file list's up/down buttons changes the result. |
| Split PDF | Operational | Node: group maths for ranges / every page / every N; Arabic-digit ranges (`٣-٤`); each output's pages and text; invalid range → `UserFacingError`. Browser: every page → ZIP of 3 PDFs with correct names and text; custom ranges with live validation message; damaged + encrypted files in one batch each get a clear message. |
| Remove Pages | Operational | Node: removes 2 and 4 of 5, order kept; refuses removing every page. Browser: tap thumbnails, summary "2 to remove · 2 remain", output text `Page 1, Page 3`. |
| Extract Pages | Operational | Node: one file / one per page / one per consecutive range, names and texts. Browser: typed range drives the thumbnail selection; "one per range" ZIP checked. |
| Organize PDF | Operational | Unit: move earlier/later (multi-select), drop-target move, rotate, duplicate (new keys), delete, insert. Node: reorder + rotate + duplicate + pages from a second file. Browser: move later, rotate, duplicate, delete, undo, insert page 2 of another PDF at the end → exact order `A2 A1 A1 A3 B2` and rotations `0 90 90 0 0`. |
| Rotate PDF | Operational | Node: adds to existing /Rotate (90→180), −90 and 180 on all pages. Browser: tapping a page switches to "some pages"; two files → ZIP, rotations checked per page. |
| Add Page Numbers | Operational | Unit: label formats, numbering plan (start, skip first, selection), anchor maths, display-space matrix for rotated pages. Node: "Page X of Y" is real extractable text on the right pages; Arabic label embedded as an image. Browser: live preview renders; AR + EN; Arabic format really rasterized by the browser (image XObject on each page). Visual check: «صفحة 1 من 3» correctly shaped. |
| Watermark PDF | Operational | Unit: tile coverage. Node: Latin text with opacity graphics state on selected pages only; tiled image drawn many times from one image object; Arabic text as image; missing text/image refused. Browser: Latin text on every page; Arabic + tiled → image; PNG logo upload. Visual check: «سري للغاية» shaped, rotated, transparent. |
| Crop PDF | Operational | Unit: margins → CropBox, including /Rotate 90 pages (margins follow what the reader sees). Node: CropBox values exact, other pages untouched, hidden text still in file, oversize margins refused. Browser: numeric margin (25.4 mm = 72 pt) → exact CropBox; dragging the corner handle changes the margins and the CropBox (rotated page). |
| Image to PDF | Operational | Unit: A4/Letter/original/custom sizes, auto orientation, fit/fill/actual-size placement, EXIF orientation reading and the 8 orientation matrices. Node: order, one image per page, separate files, phone photo with EXIF 6 drawn upright with the correct page size, broken image and oversized margins refused. Browser: real PNG + JPG + WebP (encoded by Chrome) → 3 pages with correct sizes; separate files at original size. |
| PDF to Image | Operational | Unit: DPI → pixels, canvas limits and suggested max DPI, padded names. Browser: 2 pages → ZIP of JPGs, decoded size 1239×1754 at 150 DPI; one selected page as PNG at 72 DPI; damaged file message. |
| Extract PDF Text | Operational | Unit: reading order (lines top-down, LTR left-to-right, Arabic lines right-to-left), joins touching items, paragraph gaps, page headings, scanned-page note. Node (PDF.js): real text out, blank page reported as "no text", UTF-8 TXT with BOM, damaged file → error. Browser: preview text, "pages without text: 2", copy button, TXT download. |
| Fill PDF Forms | Operational | Unit: value checks for every field type (length, options, editable dropdown). Node: detects text/multiline/checkbox/radio/dropdown/list fields with tooltip labels and page; values read back; flatten removes fields and keeps the text; Arabic value kept with `NeedAppearances`; Arabic + flatten drawn as an image; PDF without a form explained; invalid option refused. Browser: Latin fill read back; Arabic + flatten → no fields and an image; plain PDF message. |
| Edit PDF | Operational | Unit: box/point geometry, arrowheads. Node: rectangle (fill colour), ellipse, arrow, freehand, highlight (opacity state), Latin text (real text), Arabic text (image), image; original content kept. Browser: draw rectangle, place and type Latin + Arabic text, undo/redo, output has the Latin text as text and the Arabic as an image; freehand + arrow + highlight + Delete key + undo → "Objects added: 3". |
| Sign PDF | Operational | Browser: draw a signature with the pointer, add it, add the date → output has the signature image and the date as text; typed signature → image. Shares the editor and export code tested above. |

## How Arabic is handled

pdf-lib cannot shape Arabic or lay out right-to-left text. Any text the standard PDF fonts can't encode (anything outside WinAnsi, so all Arabic) is drawn by the browser on a transparent canvas at ~288 DPI with the site's own self-hosted **IBM Plex Sans Arabic** (loaded through `next/font`, OFL) and embedded as a PNG. Latin-only text stays real, selectable PDF text in Helvetica / Times / Courier. Every tool that can add Arabic text says so where it matters (page numbers, watermark, edit, forms, sign). Page numbers always use Latin digits.

## Known limitations

- **Merge / split / extract / organize** copy pages into a new document: page content, annotations and web links are kept; bookmarks (outline), form fields (the AcroForm), and links that jump to another page inside the document are not carried over. Rotate, remove pages, crop and the drawing tools change the original document in place, so they keep all of that.
- **Encrypted PDFs** are refused with a clear message (pdf-lib can't decrypt; writing one back would break it). PDF → image / text use PDF.js, which opens PDFs that only have an owner password.
- **Crop** changes the CropBox only; hidden content stays in the file (stated in the tool).
- **PDF → image** renders whole pages; it doesn't extract embedded images (stated). Canvas size is capped at 16.7 MP / 16384 px per side (the iPhone limit); the tool suggests the highest DPI that fits.
- **PDF → text**: native text only, no OCR; multi-column layouts are read line by line across columns.
- **Fill forms**: AcroForm only (no XFA). Arabic values without flattening depend on the viewer redrawing the field (Acrobat and browsers do). Flattened Arabic values are images. Widget appearances on rotated pages are flattened in page space.
- **Live previews** (numbers, watermark, forms) reopen the file with pdf-lib after each change, debounced; very large files make them slower.
- **Image → PDF**: CMYK JPEGs are embedded as they are; some (Adobe-inverted) may look inverted in some viewers.
- **Sign PDF** is a visual signature, not a certificate-based digital signature (stated in the tool). "Remove white background" on uploaded signatures is a simple brightness threshold.

## New dependencies

| Package | Version | License | Why |
|---|---|---|---|
| `pdf-lib` | ^1.17.1 | MIT (deps: `pako` MIT, `tslib` 0BSD, `@pdf-lib/standard-fonts` MIT, `@pdf-lib/upng` MIT) | Create and edit PDFs. Loaded with `import()` on first use inside a tool page. |
| `@playwright/test` (dev) | ^1.64.1 | Apache-2.0 | Browser tests. |

`@pdf-lib/fontkit` was **not** added: it only helps embed custom fonts, and pdf-lib still can't shape Arabic with it, so it would add weight without fixing Arabic. No new font files are bundled; the Arabic renderer uses the fonts the site already self-hosts.

## Changes outside `src/tools/pdf/` (for the merge)

- `src/lib/tools/pdf-tools.ts`: the 15 tools set to `"operational"`.
- `package.json` / lockfile: `pdf-lib`, `@playwright/test`, script `test:e2e:pdf`.
- `eslint.config.mjs`: ignore `public/vendor/**` (the copied PDF.js worker — `npm run lint` failed on it after any `dev`/`build`), `test-results/**`, `playwright-report/**`.
- `.gitignore`: `/test-results`, `/playwright-report`.
- New: `playwright.pdf.config.ts`, `e2e/pdf/*`.

No changes to `src/components/workspace/*`, `src/components/files/*`, `src/lib/engine/*`, image tools, or `docs/VERIFICATION.md`.

## Shared changes I'd like (not made)

1. **Wide preview for editor tools.** Edit PDF, Sign PDF, Organize and Fill Forms work inside the workspace's middle column (~420 px wide at 1366 px). A `ToolModule` flag such as `layout: "wide"` that lets the preview span the files column (files list collapsible) would give the page editor much more room on desktop.
2. **PDF.js cMaps and standard fonts.** `src/lib/pdf/pdfjs.ts` doesn't pass `cMapUrl` / `standardFontDataUrl`. PDFs using non-embedded CJK fonts may render or extract poorly. Copy `pdfjs-dist/cmaps` and `standard_fonts` to `public/vendor/` in `scripts/copy-pdf-worker.mjs` and pass both URLs.
3. **Duplicate validation text.** A tool's `validate` message is shown under the main button; some tools also show the same message in their settings, so it can appear twice in the sidebar. Harmless; the workspace could hide its copy when the module shows its own.
4. **`next dev` writes `AGENTS.md`** into the repo root (Next 16 "agent rules"). Set `agentRules: false` in `next.config.ts` or ignore the file.
5. Error messages from processors are written in the language that was active when processing ran (they are plain strings in `RunResult`); switching language afterwards doesn't translate an error already shown.

---

# Milestone 4 — Compress PDF and Compare PDF

Branch `m4-pdf-compress-compare`. Both tools are **operational**: their real output is opened and checked in Node and in a real browser (static build, desktop 1366 px and phone 375 px, Arabic RTL and English LTR).

| Check | Result |
|---|---|
| `npm run typecheck` / `npm run lint` | pass |
| `npm test` (Vitest) | 300 passing (38 new: compress 18, compare core 16, compare run 4) |
| `npm run build` | pass (static export; workers and qpdf.wasm built into `public/vendor/` by `prebuild`) |
| `npm run test:e2e:pdf` | 82 passing (20 new: compress 12, compare 8), 2 skipped by design (Milestone 3 desktop-only cases); stable over two full runs |

`PDF_E2E_PORT=4191 npm run test:e2e:pdf` serves the build on another port (the default is still 4174).

## Compress PDF — how it works

Everything runs in a dedicated Web Worker (`public/vendor/pdf-compress-worker.js`, one worker per file; **Cancel terminates it immediately**). No page is ever rasterised.

1. **Lossless (always):** [qpdf](https://github.com/qpdf/qpdf) 12.2 compiled to WebAssembly (`@neslinesli93/qpdf-wasm` 0.3.0, served from `public/vendor/qpdf/qpdf.wasm`, loaded only when compressing). Options: `--object-streams=generate --compress-streams=y --decode-level=generalized --recompress-flate --compression-level=9`. qpdf rewrites the file keeping only reachable objects (old revisions and orphaned objects disappear), packs objects into compressed object streams, compresses uncompressed streams, converts LZW/ASCII filters to Flate and recompresses every Flate stream at level 9. Content streams, fonts and image data are not changed. Owner-password encryption is kept as it is.
2. **Images (optional, off by default, labelled lossy):** pdf-lib finds image XObjects used by pages (also inside form XObjects). Eligible: 8-bit DeviceRGB/DeviceGray/ICCBased(1|3)/CalRGB/CalGray, DCT, Flate (incl. PNG predictors) or uncompressed, at least 8 KB. Skipped: masks and soft masks themselves, `/Decode`, colour-key `/Mask`, CMYK/Indexed/Separation, JPX/JBIG2/CCITT, 16-bit, over 80 MP. The browser decodes (EXIF stripped first so pixels can't be rotated), downsizes on an OffscreenCanvas in halving steps, and encodes JPEG at the chosen quality. **An image is replaced only if the new stream is smaller.** Downsampling bound: the image keeps at least *max DPI × the long side (in inches) of the largest page it appears on*; images with a `/Matte` soft mask keep their size.
3. **Check (main thread, PDF.js):** the output must open, have the same page count and give **exactly the same text on every page** as the original. Only a file that is smaller **and** passed is offered. Otherwise the original file is returned under its own name with "No reduction … this is your original" (or "failed the check").
4. The result shows original size, new size, bytes saved with the real %, page count, the method (lossless / + lossy images), images recompressed, and notes (encrypted → images untouched; damaged structure rebuilt; no image got smaller).

### Engine limitation found and handled

This qpdf build can't recover from its own internal errors: for a password-locked file *and* for a damaged file it exits with code 2 (normal qpdf exits 0 for "password needed" and repairs damaged files with exit code 3). So:
- Encryption: qpdf's exit 3 ("encrypted, no password needed") is trusted; otherwise pdf-lib reads the trailer — an `/Encrypt` that qpdf couldn't open means a password is needed → clear message.
- Damaged files: re-parsed with pdf-lib's parser (reads objects in order, no xref needed; finds the catalog by `/Type` if the trailer is lost), re-serialised, then optimised by qpdf. Tested with a broken xref **table** and a broken xref **stream**.
- Every qpdf command gets a fresh WebAssembly instance.

The other qpdf WASM package on npm (`qpdf-wasm` 0.1.0, Apache-2.0) was rejected: it is built with pthreads and needs `SharedArrayBuffer` (COOP/COEP headers), which a plain static host can't guarantee.

### Tests

- Node (`compress.test.ts`, the same WASM build as the browser): a wasteful fixture (3 pages, uncompressed 800×800 image, 300 KB of orphaned objects) shrinks to under 10 %, same text, **image pixels byte-identical** after decoding, object streams present, orphans gone; compressing that result again → no saving → original returned (bytes identical, Arabic name kept); owner-only encrypted file stays encrypted and images are skipped; password-locked and garbage files → clear codes; broken xref table and stream rebuilt; lossy step on a 2400×2400 PNG-predictor image → 842×842 at 72 DPI on A4, corner pixels still exactly red/white, caption still text; a codec that can't shrink leaves the image untouched; unit tests for target size, every PNG predictor type, RGBA expansion, EXIF stripping, exact byte/percent reporting.
- Browser (`e2e/pdf/compress.spec.ts`, desktop + phone): AR + EN lossless run (size under 10 %, same pages and text, shown % equals the real %, the worker really ran); already-optimised file returned byte-identical with "No reduction"; lossy run on a real Chrome-encoded 3000×2000 JPEG + 1600×1200 Flate image → both re-encoded as JPEG ≤ 842 px, no extra images, text unchanged, **average colour within 6 levels of the original**; batch of two → ZIP, the tiny file is never larger; locked + damaged files → clear messages.

## Compare PDF — how it works

- **Text:** each page's text in reading order (the PDF-to-text code, RTL-aware) is split into words and diffed with Myers' O(ND) algorithm (`compare-core.ts`, written here, no dependency). Words are compared after folding presentation forms (Arabic contextual letters and lam-alef ligatures, Latin ligatures) into normal letters, ignoring tatweel and invisible bidi/zero-width marks, and reading Persian yeh/keheh as Arabic yeh/kaf (fonts often share those glyphs; Chromium's PDFs give U+06CC for «جيد»). Alef maksura, diacritics, digits, superscripts and case still count. Beyond 4000 edits on one page it is shown as rewritten (all removed + all added).
- **Visual:** both pages are rendered by PDF.js at one shared scale (same pixel grid, top-left aligned on white). A pixel counts as changed when a channel differs by more than the sensitivity (96 / 48 / 16). Picture: unchanged = faint grey, only in the first file = red, only in the second = green, content in both that differs = amber; % of changed pixels shown.
- **Pages** are paired by number. A count mismatch is stated up front; extra pages are "only in the first/second file". Pages without text are reported as "no text (scanned?)" and compared visually only.
- **Preview:** side by side, overlay (opacity slider), difference picture, word diff; page status chips; works at 375 px.
- **Report:** one self-contained HTML file (inline CSS, difference pictures as JPEG data URLs, no scripts, no external links), in the UI language with `dir` set, Latin digits: files, page counts, summary, per-page table, details with `<del>`/`<ins>` and pictures. "Visual comparison in the report" can be switched off for long files.
- Pixel and word diffs run in a shared Web Worker (`public/vendor/pdf-compare-worker.js`), with a main-thread fallback if a worker can't start. Cancel stops after the current page.

### Tests

- Node: tokenizer, Arabic folding (presentation forms, tatweel, RLM, Persian yeh/keheh; alef maksura and `x²` still differ), diff on English / Arabic / mixed text, **300 random cases checked valid and minimal against an LCS**, fallback beyond the edit limit, 20 000-word page under 2 s, pixel diff colours, page status rules, report HTML (escaping, RTL, mismatch note, scanned note, embedded image, no scripts or links), full run with PDF.js: changed words, extra page, page without text, identical files, damaged file named, cancel.
- Browser (`e2e/pdf/compare.spec.ts`, desktop + phone): AR + EN — mismatch note, both pages rendered, status chip, text view `<del>100</del>` / `<ins>250</ins>`, difference view > 0 %, page-only-in-second chip, report with the expected `<del>`/`<ins>`, mismatch, scanned page and embedded image; **Arabic PDFs printed by Chromium** → exactly «الأول» / «ممتاز» removed and «الثاني» / «جيد جدا» added, in preview and report; identical files → "No differences".

## New dependencies (Milestone 4)

| Package | Version | License | Why |
|---|---|---|---|
| `@neslinesli93/qpdf-wasm` | 0.3.0, exact (0.3.1 was published on 3 Nov 2026 — too new to trust yet) | ISC wrapper; qpdf Apache-2.0; bundled zlib (zlib license) and libjpeg-turbo (IJG / BSD-style) | Lossless PDF optimisation, in a worker |

Nothing else. `DecompressionStream` / `CompressionStream`, `OffscreenCanvas` and `createImageBitmap` come from the platform.

## Changes outside `src/tools/pdf/` (for the merge)

- `src/lib/tools/pdf-tools.ts`: `compress-pdf`, `compare-pdf` → `"operational"` (only these two entries).
- `package.json` / lockfile: `@neslinesli93/qpdf-wasm`; `predev` / `prebuild` also run `node scripts/build-pdf-worker.mjs`.
- New `scripts/build-pdf-worker.mjs` (rolldown, like the image worker): bundles both workers, copies `qpdf.wasm` to `public/vendor/qpdf/`.
- `playwright.pdf.config.ts`: port from `PDF_E2E_PORT` (default unchanged). `e2e/pdf/static-server.mjs`: serves `.wasm` as `application/wasm`.

## Known limitations (Milestone 4)

- Compress: savings depend on the file; a file already written with object streams and level-9 Flate gains about nothing (the tool says so and returns the original). Inline images (`BI … EI`) and images used only in annotations or patterns aren't recompressed. The DPI bound uses the page size, not the exact drawn size: an image drawn small keeps more pixels than needed (safe, less saving); one drawn larger than its page could fall below the chosen DPI in the visible part. Rebuilding a file invalidates digital signatures (stated in the tool). Linearisation ("fast web view") is removed.
- Compare: pages are paired by number — an inserted page shifts every later page (reported as changes, not detected as an insertion). Text order follows PDF.js extraction; multi-column layouts are compared line by line across columns. No OCR. Content that moved by a few points shows as a visual change.

## Shared changes I'd like (not made)

1. **Third-party notices.** The qpdf npm package ships no license files. Before release add a notices page (or `public/vendor/qpdf/LICENSE`) with qpdf's Apache-2.0 text and the zlib and libjpeg-turbo notices.
2. **Merging `package.json`:** the image and workflow sessions may also edit `predev` / `prebuild`; keep all `node scripts/…` steps.
3. The results panel shows `label: value`; long result notes ("No reduction …") would read better as a styled note row (e.g. a `meta` entry with `kind: "note"`).
