# Deploying All To All

The site is a static export: `npm run build` writes plain files to `out/`. No server, database, functions or paid service is needed. Pick any static host.

## Recommended: Cloudflare Pages (free plan)

1. Push the repository to GitHub.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repository.
3. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `out`
   - Environment variable: `NODE_VERSION` = `22` (the repo also has `.nvmrc`)
4. Deploy. Every push to `main` redeploys; pull requests get preview URLs.
5. Optional: add a custom domain under **Custom domains**. Turn on **Always Use HTTPS**.

Cloudflare Pages reads `out/_headers` (generated from `src/lib/security/headers.json` on every build), so the site gets the full Content-Security-Policy (including `frame-ancestors`), `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, cross-origin isolation headers, and long caching for hashed assets.

Free-plan limits as of November 2026 (check the current terms before relying on them): unlimited static requests and bandwidth, 500 builds per month, 20,000 files per site, 25 MiB per file. The largest files this site ships are `qpdf.wasm` and the PDF.js worker (about 1.3 MB each), far under the limit.

## Alternative: GitHub Pages

GitHub Pages can't set HTTP headers. The CSP still applies through the `<meta>` tag in every page (everything except `frame-ancestors`, which browsers ignore in `<meta>`; the site could then be framed by another site). If the site is served from `https://<user>.github.io/<repo>/`, set `basePath: "/<repo>"` in `next.config.ts`, and update the absolute `/vendor/...` paths used for workers (or use a custom domain to keep the root path). Publish `out/` with the official `actions/deploy-pages` workflow.

## Not recommended for this project: Vercel Hobby

Works technically, but the Hobby plan is for non-commercial use only.

## Before each release

```bash
npm ci
npm run typecheck && npm run lint && npm test
npm run build
npx playwright install chromium   # first time only
npm run test:e2e
```

CI (`.github/workflows/ci.yml`) runs the same checks on every push and pull request.
