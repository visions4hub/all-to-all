# Implementation & verification report

Statuses: **Operational** (built, output verified by tests) · **Implemented, not fully verified** · **Unsupported in Phase 1** · **Deferred to Phase 2** · **Not started**.

Last update: 4 November 2026 — **Phase 1 complete.** Milestones 1–5 merged into `main`. All 28 Phase 1 tools and the workflow builder are operational, verified in Chromium, Firefox and WebKit (Safari engine).

Detailed evidence: [image tools](verification/image-tools.md) · [PDF tools](verification/pdf-tools.md) · [workflows](verification/workflows.md) · [browsers](verification/browsers.md) · [performance](verification/performance.md) · [deploying](DEPLOY.md).

## Final check on `main` (Phase 1 release candidate)

| Check | Result |
|---|---|
| `npm run typecheck` | Clean |
| `npm run lint` | Clean |
| `npm test` (Vitest) | 409 passed, 31 files |
| `npm run build` | 41 static pages, static export |
| `npm run test:e2e:all` (Playwright: Chromium desktop + phone, Firefox, WebKit desktop, WebKit iPhone) | **697 passed, 0 failed** (re-run after the editor drag fix below), 8 skipped (each for a stated device limit, listed in [browsers.md](verification/browsers.md)) |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Security headers / CSP | Every test runs under the real policy; `e2e/security.spec.ts` proves the page can't send data to another server or load outside scripts |

### Milestone 5 summary

- **Browsers:** Firefox, desktop Safari and iPhone Safari (WebKit) added to the suite. Product fixes: clear messages when a browser can't encode WebP or recompress PDF images; iPhone safe-area padding for bottom bars and sheets; Image to PDF reads image size directly.
- **Performance:** first-load JS on every tool page 274.5 → 201.2 KB gzip (−27%), Studio −22%, workflows −21%; layout shift on tool pages and saved-English visits is now 0; previews of large photos use small thumbnails (much lower memory); fewer main-thread freezes on big files. Details and before/after numbers in [performance.md](verification/performance.md).
- **Security:** CSP `<meta>` in every page plus generated `_headers` (frame-ancestors, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP/CORP, caching) from one source (`src/lib/security/headers.json`); `connect-src 'self'`; JSZip no longer ships a Node polyfill that probed `eval`; build-only `shadcn` moved to devDependencies.
- **Release:** generated third-party license notices (linked in the footer), CI workflow, `.nvmrc`, deploy guide.

### Fixed after release check

- Photo editor and Edit / Sign PDF: a quick drag could be dropped in Safari (WebKit) because the gesture was read from React state on release. The gesture is now mirrored in a ref. The WebKit drag test went from about 1 failure in 5 runs to 30/30.

### Not verified (needs a person or real devices)

- Real Safari on a Mac and a real iPhone/Android phone — tests use the WebKit engine and device emulation, not physical devices.
- Screen-reader walk-through (automated checks and Lighthouse accessibility 92–98 only).
- Deployment itself: nothing is pushed or published yet.

### Earlier merge notes

Fixed while merging Milestone 4 (found by new tests):

- On phones, the page became wider than the screen **after processing** in every tool (result card min-width). Fixed in `results-panel.tsx`; regression test added.
- On phones, a long filename that can't wrap made tool pages and the Studio wider than the screen **before processing** (single-column grid sized to content). Fixed by capping the column (`minmax(0,1fr)`) in `tool-workspace.tsx` and `studio-content.tsx`; covered by tests.

Milestones 2–3 merge: one Photo Editor test failed once under load and passed in every later run; no failures in the final 697-test run.

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

- Browser tests run in Chromium, Firefox, desktop Safari and iPhone Safari (Playwright WebKit) — see [verification/browsers.md](verification/browsers.md). Real Safari / a real iPhone have not been tested (Windows machine).
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
| Compress PDF | 4 | Operational |
| Compare PDF | 4 | Operational |
| Compress Image | 2 | Operational |
| Resize Image | 2 | Operational |
| Crop Image | 2 | Operational |
| Rotate & Flip Image | 2 | Operational |
| Convert Image | 2 | Operational |
| Photo Editor | 2 | Operational |
| Watermark Image | 2 | Operational |
| Meme Generator | 2 | Operational |
| Blur & Pixelate | 2 | Operational |
| Image Metadata | 4 | Operational |
| GIF Maker | 4 | Operational |
| Workflow builder | 4 | Operational |

## Unsupported in Phase 1

HEIC/HEIF, AVIF input, TIFF, PSD, RAW — detected and named, but no tool accepts them until a fully local, freely licensed decoder is added and tested.

## Deferred to Phase 2

All 50 items in `src/lib/tools/future-registry.ts` (AI features, OCR, Office conversions, cryptographic signatures, redaction, cloud features). Not shown in the UI.
