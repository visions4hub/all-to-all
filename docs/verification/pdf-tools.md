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
