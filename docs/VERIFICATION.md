# Implementation & verification report

Statuses: **Operational** (built, output verified by tests) · **Implemented, not fully verified** · **Unsupported in Phase 1** · **Deferred to Phase 2** · **Not started**.

Last update: 4 November 2026 — Milestones 1–3 merged into `main`.

Detailed per-tool evidence: [verification/image-tools.md](verification/image-tools.md) and [verification/pdf-tools.md](verification/pdf-tools.md).

## Combined check on `main` after merging

| Check | Result |
|---|---|
| `npm run typecheck` | Clean |
| `npm run lint` | Clean |
| `npm test` (Vitest) | 262 passed, 20 files |
| `npm run build` | 41 static pages |
| `npx playwright test` (desktop 1366 px + mobile 375 px, Chromium) | 183 passed, 3 skipped (touch-only / desktop-only cases) |
| Manual browser check | Merge PDF with an Arabic filename (2 + 3 pages → 5), Photo Editor at 375 px |

One test (Photo Editor, English WebP export) failed once in the first full run and then passed in 3 later full runs and 15 targeted repeats; treated as a timing flake under load, kept under watch.

## Milestone 1 — Foundation

| Area | Status | Evidence |
|---|---|---|
| Branding, design system, light/dark | Operational | Checked in browser (light, dark) |
| Arabic RTL / English LTR, saved in browser | Operational | 12 pages × 2 languages at 375 px: correct `dir`, no horizontal scroll |
| Homepage (all 10 sections) | Operational | Browser check |
| Smart upload (real type detection, preview, suggestions, files kept when opening a tool) | Operational | Browser check with PNG, PDF, TXT; client navigation keeps files |
| File type detection (magic bytes) | Operational | `detect.test.ts` |
| Filenames (Arabic/Unicode, sanitising, dedupe) | Operational | `filename.test.ts` |
| Page-range parsing | Operational | `page-ranges.test.ts` |
| Tool registry + Arabic/English search | Operational | `registry.test.ts`, `search.test.ts` (all spec queries) |
| Processing engine (sequential, per-file status, cancel, memory errors) | Operational | `run.test.ts` |
| Universal workspace (files, preview, settings, process, cancel, results, rename, ZIP, share, before/after) | Operational | Exercised end to end by all 24 tool browser tests |
| Studio, tool directory, workflows page, about/help/privacy/terms | Operational | Browser check |
| Static export | Operational | `npm run build` → 41 static pages |


### Known issues

- Browser tests run in Chromium only; Firefox and Safari have not been tested automatically.
- Next.js 16.4 static export: the client requests segment prefetch files as `/<route>/__next.<route>.__PAGE__.txt`, but the export writes them as `/<route>/__next.<route>/__PAGE__.txt`. The browser console shows 404s for these prefetches. Navigation is unaffected (verified: client-side navigation works and keeps in-memory files). Re-check after the next Next.js update.
- First paint is Arabic; visitors who chose English see the text switch to English right after load (direction and theme are applied before paint).

## Tools

| Tool | Milestone | Status |
|---|---|---|
| Merge PDF | 3 | Operational |
| Split PDF | 3 | Operational |
| Remove Pages | 3 | Operational |
| Extract Pages | 3 | Operational |
| Organize PDF | 3 | Operational |
| Rotate PDF | 3 | Operational |
| Add Page Numbers | 3 | Operational |
| Watermark PDF | 3 | Operational |
| Crop PDF | 3 | Operational |
| Edit PDF (annotate) | 3 | Operational |
| Image to PDF | 3 | Operational |
| PDF to Image | 3 | Operational |
| Extract PDF Text | 3 | Operational |
| Fill PDF Forms | 3 | Operational |
| Sign PDF (visual) | 3 | Operational |
| Compress PDF | 4 | Not started |
| Compare PDF | 4 | Not started |
| Compress Image | 2 | Operational |
| Resize Image | 2 | Operational |
| Crop Image | 2 | Operational |
| Rotate & Flip Image | 2 | Operational |
| Convert Image | 2 | Operational |
| Photo Editor | 2 | Operational |
| Watermark Image | 2 | Operational |
| Meme Generator | 2 | Operational |
| Blur & Pixelate | 2 | Operational |
| Image Metadata | 4 | Not started |
| GIF Maker | 4 | Not started |
| Workflow builder | 4 | Not started |

## Unsupported in Phase 1

HEIC/HEIF, AVIF input, TIFF, PSD, RAW — detected and named, but no tool accepts them until a fully local, freely licensed decoder is added and tested.

## Deferred to Phase 2

All 50 items in `src/lib/tools/future-registry.ts` (AI features, OCR, Office conversions, cryptographic signatures, redaction, cloud features). Not shown in the UI.
