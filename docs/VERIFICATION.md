# Implementation & verification report

Statuses: **Operational** (built, output verified by tests) · **Implemented, not fully verified** · **Unsupported in Phase 1** · **Deferred to Phase 2** · **Not started**.

Last update: 4 November 2026 — Milestone 1.

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
| Universal workspace (files, preview, settings, process, cancel, results, rename, ZIP, share, before/after) | Implemented, not fully verified | Needs a real tool module to exercise end to end — first image tool in Milestone 2 |
| Studio, tool directory, workflows page, about/help/privacy/terms | Operational | Browser check |
| Static export | Operational | `npm run build` → 41 static pages |

Unit tests: 121 passing.

### Known issues

- Next.js 16.4 static export: the client requests segment prefetch files as `/<route>/__next.<route>.__PAGE__.txt`, but the export writes them as `/<route>/__next.<route>/__PAGE__.txt`. The browser console shows 404s for these prefetches. Navigation is unaffected (verified: client-side navigation works and keeps in-memory files). Re-check after the next Next.js update.
- First paint is Arabic; visitors who chose English see the text switch to English right after load (direction and theme are applied before paint).

## Tools

| Tool | Milestone | Status |
|---|---|---|
| Merge PDF | 3 | Not started |
| Split PDF | 3 | Not started |
| Remove Pages | 3 | Not started |
| Extract Pages | 3 | Not started |
| Organize PDF | 3 | Not started |
| Rotate PDF | 3 | Not started |
| Add Page Numbers | 3 | Not started |
| Watermark PDF | 3 | Not started |
| Crop PDF | 3 | Not started |
| Edit PDF (annotate) | 3 | Not started |
| Image to PDF | 3 | Not started |
| PDF to Image | 3 | Not started |
| Extract PDF Text | 3 | Not started |
| Fill PDF Forms | 3 | Not started |
| Sign PDF (visual) | 3 | Not started |
| Compress PDF | 4 | Not started |
| Compare PDF | 4 | Not started |
| Compress Image | 2 | Not started |
| Resize Image | 2 | Not started |
| Crop Image | 2 | Not started |
| Rotate & Flip Image | 2 | Not started |
| Convert Image | 2 | Not started |
| Photo Editor | 2 | Not started |
| Watermark Image | 2 | Not started |
| Meme Generator | 2 | Not started |
| Blur & Pixelate | 2 | Not started |
| Image Metadata | 4 | Not started |
| GIF Maker | 4 | Not started |
| Workflow builder | 4 | Not started |

## Unsupported in Phase 1

HEIC/HEIF, AVIF input, TIFF, PSD, RAW — detected and named, but no tool accepts them until a fully local, freely licensed decoder is added and tested.

## Deferred to Phase 2

All 50 items in `src/lib/tools/future-registry.ts` (AI features, OCR, Office conversions, cryptographic signatures, redaction, cloud features). Not shown in the UI.
