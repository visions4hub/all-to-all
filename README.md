# All To All — By Visions

**كل ملفاتك. كل أدواتك. بمكان واحد. · Every File. Every Tool. One Place.**

A free PDF and image toolbox that runs entirely in the browser. No accounts, no uploads, no subscriptions, no ads, no usage quotas. Arabic first (RTL), with English (LTR).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests (Vitest)
npm run typecheck
npm run lint
npm run build      # static site in out/
npm run preview    # serve out/ on http://localhost:4173
```

Node 20 or newer. `predev` / `prebuild` copy the PDF.js worker into `public/vendor/` so it is served from our own origin.

## Deploy (static, free tier)

`npm run build` writes a plain static site to `out/`. Any static host works. Nothing needs a server.

| Host | Notes |
|---|---|
| **Cloudflare Pages** (recommended) | Build command `npm run build`, output `out`. Free plan has unlimited bandwidth and static requests; 500 builds/month. Commercial use allowed. |
| **GitHub Pages** | Push `out/` (e.g. with an Action). 1 GB site size, ~100 GB/month soft bandwidth. If served from `/<repo>/`, set `basePath` in `next.config.ts`. |
| Vercel Hobby | Works, but the Hobby plan is for **non-commercial** use only. |

Limits change; check the provider's current terms before relying on them. A custom domain is optional.

## How it is built

- **Next.js 16** App Router with `output: "export"`, React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Radix), Lucide icons, Zustand.
- **PDF.js** (Apache-2.0) for rendering, **pdf-lib** (MIT, arrives with the PDF tools), **JSZip** (MIT/GPLv3 dual — used under MIT).
- Fonts (IBM Plex Sans Arabic, Readex Pro — OFL) are downloaded at build time and self-hosted.

```
src/
  app/                    routes (each page is static HTML)
  components/
    workspace/            ToolWorkspace — shared layout every tool plugs into
    files/                dropzone, file list, thumbnails, smart upload
  lib/
    tools/                tool registry (pdf-tools.ts, image-tools.ts), search, Phase 2 registry
    engine/               processor contract + runner (sequential, cancellable, per-file status)
    files/                type detection by magic bytes, filenames, ZIP/download
    pdf/                  PDF.js loader, page-range parsing
    i18n/                 language + theme preferences (localStorage)
  tools/
    pdf/  image/          tool modules, loaded only when their page opens
```

### Adding a tool

1. Its definition already exists in `src/lib/tools/pdf-tools.ts` or `image-tools.ts` with `status: "building"`.
2. Create `src/tools/<category>/<name>.tsx` exporting a default `ToolModule` (`src/tools/types.ts`): `mode`, `defaultSettings`, `Settings`, `process`, `actionLabel`, optionally `validate` / `Preview` / `Workspace`.
3. Register its loader in `src/tools/<category>/index.ts`.
4. Add tests that check the **real output** (open the produced file and verify it), then set the status to `"operational"` (or `"beta"` if not fully verified) and update `docs/VERIFICATION.md`.

Text is written in place as `t({ ar: "…", en: "…" })`. Numbers always use Latin digits. Use logical CSS (`ps-`, `me-`, `start-`), never left/right.

## Principles

- Files never leave the device. No analytics, no trackers, no third-party runtime CDNs.
- No fake output: a tool is shown as usable only after its output is verified.
- No artificial limits; real device limits (memory, formats) are reported clearly.
- Phase 2 capabilities live in `src/lib/tools/future-registry.ts` and are never shown in the UI.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for the per-tool status report.
