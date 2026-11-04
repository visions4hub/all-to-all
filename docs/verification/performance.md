# Performance — measurements and changes (Milestone 5)

Branch `m5-performance` (from `main` at `affb1ad`). Measured 4 November 2026 on the
development PC (Windows 11, Playwright's Chromium 1248). "Before" is a build of
`affb1ad`; "after" is this branch. Both were served the same way, side by side.

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass (0 problems) |
| `npm test` (Vitest) | 408 passing — 15 new (`memory`, `image-info`, `jobs`, `limit`) |
| `npm run build` | pass |
| `E2E_PORT=4297 npx playwright test` (Chromium, desktop 1366 px + mobile 375 px) | 261 passing, 3 skipped (device-specific, as on `main`) |
| `PDF_E2E_PORT=4291 npx playwright test -c playwright.pdf.config.ts` | 82 passing, 2 skipped (as on `main`) |

New dependencies: **none**. Lighthouse is fetched by `npx` for measuring only.

## How it was measured

All tools are dev-time scripts in `scripts/`; none of them ship with the site.

- **Bundle size per route** — `node scripts/measure-bundles.mjs out`: reads every
  exported page's HTML and sums the JS and CSS files it references (what a first
  visit downloads before any lazily loaded tool code), raw and gzip -9. `noModule`
  polyfill scripts are skipped (modern browsers never download them).
- **Serving** — `node scripts/perf-serve.mjs <dir> <port>`: a static server with
  gzip and the cache headers a real static host sends (hashed `/_next/static/*`
  immutable for a year, the rest revalidated).
- **Lighthouse** — `CHROME_PATH=<playwright chromium> node scripts/lighthouse.mjs
  <base[,base…]> <runs>`: Lighthouse 12.8.2, default simulated throttling (mobile:
  slow 4G + 4× CPU; desktop preset), median of 3 runs per page. When given two
  builds it **interleaves their runs**, so other work on the machine affects both
  alike — other agents were building and testing on the same PC, which made
  separate runs drift by ±10 points.
- **Layout shift with saved preferences** — `node scripts/perf/cls.mjs <base>`:
  375 px phone viewport, 4× CPU slowdown, Arabic and saved-English visits.
- **Runtime** — `node scripts/perf/runtime.mjs <base> <fixturesDir>`: generates
  large inputs once (a 150-page PDF with text, vector shapes and a photo every
  3rd page; 30 × 4000×3000 JPEGs ≈ 4.8 MB each; 60 × 1280×960 frames), drives the
  real UI and records per scenario: wall time, main-thread long tasks (> 50 ms)
  and freezes (> 200 ms, plus animation-frame gaps), JS heap, the browser's
  whole process-tree memory (Windows private bytes, sampled every 0.5 s — this
  includes decoded images and canvases, which the JS heap doesn't), object URLs
  and Web Workers still alive after navigating away. Each scenario runs in a fresh
  browser.

## Load performance

### First-load JS per route (gzip, from the exported HTML)

| Route | Before | After | Change |
|---|---:|---:|---:|
| `/` | 215.9 KB | 212.2 KB | −2% |
| `/tools/`, `/pdf/`, `/image/` | 202.6 KB | 199.1 KB | −2% |
| `/about/`, `/help/`, `/privacy/`, `/terms/` | 203.9–207.5 KB | 196.4–199.9 KB | −4% |
| every tool page `/tools/<slug>/` (28) | **274.5 KB** | **201.2 KB** | **−27%** |
| `/studio/` | 266.5 KB | 206.7 KB | −22% |
| `/workflows/` | 286.4 KB | 226.4 KB | −21% |

CSS: 16.9 → 17.0 KB gzip on every page (two files, both render-blocking; the new utility classes).
Raw JS for a tool page went from 889 KB to 656 KB (less to parse on a phone).
All `/_next/static` files are content-hashed and served immutable.

What was in the first load that didn't need to be:

- **JSZip + its zlib (~50 KB gzip)** on every tool page, the studio and workflows,
  only needed when someone clicks "Download all (ZIP)". Now imported on that
  click (`src/lib/files/download.ts`).
- **The shared workspace** (file list, results panel, compare slider, drop zone
  — ~20 KB gzip) on every tool page, although it is only shown after the tool's
  own module has loaded. It now loads in parallel with the tool module
  (`src/app/tools/[slug]/tool-page.tsx`).
- **The header search dialog** (tool registry, search, result list) on every page,
  always mounted and running a search on hydration. It now loads on first open,
  with the download started on hover/focus of the search button
  (`src/components/tool-search.tsx`, `tool-search-dialog.tsx`).

Checked and already fine: pdf-lib, PDF.js (and its worker), qpdf (WASM, worker),
gifenc, the editors and every tool module load only when a tool needs them
(`src/tools/*/index.ts` loaders, `loadPdfJs()`); lucide icons are tree-shaken
per icon. The remaining ~200 KB is React DOM (~72 KB), the Next.js runtime
(~46 KB), Radix primitives used by the header (dropdown, sheet, tooltip,
direction) and the page's own content.

### Fonts

Checked, **left as they were** — they were already right: self-hosted by
`next/font` (no third-party request), `font-display: swap`, size-adjusted
fallbacks, subset by `unicode-range`, and Readex Pro already arrives as one
variable file per script. Every page preloads 10 files (245 KB): IBM Plex Sans
Arabic 400/500/600/700 and Readex Pro, Arabic + Latin.

Tried and rejected: preloading only the Arabic files. Every page has Latin text
above the fold (brand, "EN", "PDF"), so the Latin files were then requested only
after the CSS was parsed — one more round trip before first paint.
Interleaved Lighthouse mobile on `/tools/` (median of 3):

| Preloaded | FCP | LCP |
|---|---:|---:|
| Arabic + Latin (kept) | 1053 ms | 4324–4662 ms |
| Arabic + Readex Latin | 1204 ms | 4157 ms |
| Arabic only | 1504 ms | 4149 ms |

### Lighthouse (mobile, simulated slow 4G + 4× CPU; median of 3 interleaved runs)

| Page | Perf | FCP | LCP | TBT | CLS | Bytes |
|---|---|---|---|---|---|---|
| `/` | 82 → 76 | 1204 → 1206 ms | 4565 → 4477 ms | 170 → 342 ms | 0.000 → 0.000 | 506 → 502 KB |
| `/tools/` | 81 → 79 | 1054 → 1055 ms | 4665 → 4382 ms | 176 → 233 ms | 0.000 → 0.000 | 508 → 508 KB |
| `/tools/merge-pdf/` | 77 → 79 | 1054 → 1054 ms | 4856 → 4689 ms | 277 → 244 ms | 0.032 → 0.000 | 589 → 536 KB |
| `/tools/compress-image/` | 73 → 76 | 1055 → 1055 ms | 5066 → 4875 ms | 357 → 296 ms | 0.029 → 0.000 | 603 → 549 KB |
| `/workflows/` | 79 → 83 | 1056 → 1055 ms | 4704 → 4433 ms | 237 → 131 ms | 0.000 → 0.000 | 589 → 531 KB |

Tool pages and `/workflows/` improve on every metric: fewer bytes, no layout
shift, lower LCP and TBT. `/` and `/tools/` hardly changed (−2% JS); their
differences are inside the noise of simulated runs on a shared machine — across
all runs of the original build's home page, mobile TBT ranged from 151 ms to 720 ms
and the perf score from 64 to 82. "Bytes" is everything loaded until the page is
idle, including the tool's own module.

Desktop (separate runs, median of 3, on an intermediate build with the same JS):
every page scored 96–99 before and after (LCP 0.9–1.2 s, TBT ≤ 140 ms). Accessibility 92–98, Best practices 96–100 and
SEO 100 are unchanged.

### Layout shift (CLS) when preferences apply

`scripts/perf/cls.mjs`, phone viewport, 4× CPU (worst of 2–3 runs):

| Page | Arabic before → after | Saved English before → after |
|---|---|---|
| `/` | 0 → 0 | 0.024 → 0 |
| `/tools/` | 0 → 0 | 0.010 → 0 |
| tool pages | **0.031 → 0** | **0.033 → 0** |
| `/workflows/` | 0 → 0 | 0.020 → 0 |
| `/help/` | 0 → 0 | 0.047 → 0 |

- Tool pages: the loading spinner was 184 px tall and the drop zone that
  replaces it 268 px (phone) / 300 px — everything below it (related tools)
  jumped when the tool loaded. The placeholder now has the drop zone's height
  (`src/app/tools/[slug]/tool-page.tsx`).
- Saved English: the inline prefs script already sets `lang`, `dir` and the
  theme before first paint, so there is no direction or colour flash. The HTML
  is pre-rendered in Arabic and re-renders in English after hydration; the
  English shifts measured before came from that re-render landing in the same
  frames as the loading tool / page content. With the tool-page fix they are 0 in
  every run. (Part of the "before" English shifts was run-to-run noise: the home
  page measured 0–0.024 with no change in between.)

## Runtime (large inputs)

Desktop window 1366×900, real UI, `scripts/perf/runtime.mjs`. The "add photos"
rows are from the final build (both builds measured back to back, twice); the
other rows from the build just before the last change (photo previews three at
a time instead of one), which doesn't touch them.

| Scenario | Metric | Before | After |
|---|---|---:|---:|
| **Workflow** rotate → convert (PNG) → compress, 20 × 12 MP photos | total time | **272 s** | **89 s** |
| | main-thread freezes > 200 ms | **20** (longest 659 ms) | **0** (longest task 182 ms) |
| | peak browser memory | 917 MB | 791 MB |
| **Add 30 × 12 MP photos** (compress tool) | peak browser memory while thumbnails appear | **272–717 MB** | **129–135 MB** |
| | long tasks while adding | 1–2 (up to 168 ms) | 0 |
| | time until the ~8 visible rows show their picture | 0.06 s | 0.43 s |
| **Compress 30 × 12 MP photos** | time | 7.2 s | 7.7 s |
| | peak browser memory | 443 MB | 290 MB |
| | long tasks | 1 (102 ms) | 0 |
| **PDF → images**, 150 pages at 150 DPI | time | 5.5 s | 5.5 s |
| | result images decoded at once | **150** (all 1239×1754) | **6** (on screen) |
| | peak browser memory | 341 MB | 272 MB |
| | memory after leaving the tool | 249 MB | 139 MB |
| **GIF**, 60 frames 1280×960 | peak memory while adding frames | 452 MB | 315 MB |
| | encode time / long tasks | 6.7 s / 0 | 6.6 s / 0 |
| **Merge** 3 × 150-page PDFs | time / long tasks | 0.4 s / 0 | 0.4 s / 0 |
| **Organize** 150-page PDF | first / all 150 thumbnails, freezes | 0.7 s / 11 s, 0 | 0.7 s / 11 s, 0 |

Leaks checked after navigating away from each tool (client-side, files cleared):
object URLs all revoked (the 1–3 left are the files' own previews, which stay
while the files stay in the workspace across pages — by design); PDF.js
documents and workers destroyed; the JS heap returns to 6–9 MB. The only
long-lived thing was the image worker (see below).

### What changed and why

1. **PNG pixels are read in the worker, not on the page**
   (`src/tools/image/lib/canvas.ts` `pixelSource`, `jobs.ts` `readPixelSource`,
   used by `pipeline.ts` and `compress.tsx`). Exporting a PNG called
   `getImageData` on the full canvas on the main thread. The canvas is
   GPU-backed, so reading 12 MP back took 400–700 ms and froze the page — twice
   per photo in a workflow. Now the canvas is snapshotted as an `ImageBitmap`
   (asynchronous, cheap), transferred to the worker, and the worker reads the
   pixels from an `OffscreenCanvas`. Where `OffscreenCanvas` doesn't exist the
   old path is used. Output bytes are unchanged (the lossless-PNG e2e test
   compares every pixel). The read-backs alone account for ~1 s per photo in the
   workflow; the rest of the 272 s → 89 s drop wasn't split out. The likely part
   is that the 20 full-size photos in the file list (change 2) no longer compete
   for memory and GPU with the work — peak memory fell too.
2. **Small previews for large photos** (`src/lib/files/image-info.ts`
   `readImageDetails`, `src/components/files/file-thumb.tsx`). The file list
   showed each original photo in a 48 px box; the browser keeps a decoded copy of
   every shown image (~48 MB per 12 MP photo). The decode the list already did to
   read the pixel size now also draws a 320 px preview (JPEG for photos, PNG
   otherwise); lists and frame grids show it, the big preview area still shows
   the original (`full`). Previews are made three at a time
   (`src/lib/limit.ts`; PDF thumbnails stay one at a time) instead of every
   visible photo at once. Animated GIFs and SVGs keep their original. The
   preview URL is revoked with the file. Trade-off: a list row shows its picture
   ~0.4 s later (it waits for the small preview instead of decoding the 12 MP
   original first).
3. **Results don't decode every image at once** (`results-panel.tsx`,
   `compare-slider.tsx`): `loading="lazy"` + `decoding="async"` on result and
   before/after images, and `content-visibility: auto` on result cards and PDF
   page tiles (`src/tools/pdf/lib/pages.tsx`), so the browser skips layout and
   paint for items far off screen — the CSS form of list virtualisation; it keeps
   keyboard navigation, find-in-page and the existing lazy thumbnail rendering.
4. **The image worker closes after 30 s without jobs**
   (`worker-client.ts`) instead of living for the rest of the visit; the next
   job starts it again from the cached script.
5. **No duplicate copy of PDF bytes** (`src/lib/pdf/pdfjs.ts` `openPdf(…, {
   owned: true })`): PDF.js takes ownership of the buffer, so `openPdf` always
   copied it. Callers that read the file just for that call (thumbnails, page
   previews, PDF → images) now hand over their buffer — one less full copy of
   every PDF opened.
6. **Warning before memory-heavy runs** (`src/lib/engine/memory.ts`, shown in
   `tool-workspace.tsx` under the action button). A rough peak estimate — inputs
   and outputs held, plus the largest decoded image ×3 for per-file tools or every
   file kept decoded/parsed for batch tools; before a photo's pixel size has been
   read, ~10× its file size — is compared with a quarter of the device memory the
   browser reports (4 GB assumed when it doesn't say). Above it, a note says the
   job is large for this device (with the estimate), may be slow or fail, and
   suggests closing tabs or doing fewer files at once. It never blocks the run
   and sets no limits. Checked in the browser: 30 camera photos into one GIF on a
   4 GB device warns ("about 1.81 GB"); 3 photos don't; the same 30 into the GIF
   maker or compressor on an 8 GB device don't.

Also found and **not** a problem: merge (pdf-lib) of 450 pages takes 0.4 s with
no long task; organize renders thumbnails lazily, one at a time, and frees
them when the document closes; PDF compress/compare already run in workers.

## Tests added

- `src/lib/engine/memory.test.ts` — the estimate for per-file vs batch, images
  whose size isn't known yet, PDFs, the budget, and when the warning shows
  (7 tests).
- `src/lib/limit.test.ts` — at most N jobs at once, in order; a failing job
  frees its slot (2 tests).
- `src/lib/files/image-info.test.ts` — preview size: no preview for small
  images, aspect ratio kept, never upscaled (3 tests).
- `src/tools/image/lib/jobs.test.ts` — pixel sources: plain pixels pass through,
  the bitmap is transferred rather than copied, PNG jobs still encode (3 tests).

## What is left

- **Mobile LCP stays ~4.3–4.8 s and TBT 130–400 ms** under Lighthouse's slow-4G
  simulation. The page text is in the static HTML, but every component is a
  client component (texts come from `useT()` and the saved language lives in
  `localStorage`), so React hydrates the whole page: React DOM's work is most of
  the main-thread time. The root fix is rendering the static parts as server
  components with both languages in the HTML (switched by `html[lang]` CSS) —
  a broad change to every page, better done on its own.
- **English visits re-render after hydration** for the same reason (no shift
  measured now, but it is wasted work on every English page view).
- **PNG encoding is the slowest step** in image work (~2 s per 12 MP photo in
  the worker, our own exact encoder). It doesn't block the page, but a faster
  encoder (or `OffscreenCanvas.convertToBlob` when exactness isn't needed) would
  cut workflow time further.
- **GIF keeps every frame decoded** during encoding (530 MB peak for 60 ×
  1280×960); encoding frame by frame would need a two-pass palette.
- Photo editor, blur and GIF frame capture still read pixels on the main thread
  (`getPixels`); the same `pixelSource` path can be used there.
- Page grids use `content-visibility` rather than true windowing; a 1000-page PDF
  still creates 1000 tiles in the DOM (cheap while off-screen, but not free).
