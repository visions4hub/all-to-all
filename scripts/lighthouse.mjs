// Dev-time Lighthouse run over the key pages (mobile + desktop), median of N runs.
// Needs a server (scripts/perf-serve.mjs) and a Chrome; Playwright's Chromium works:
//   CHROME_PATH=<chrome.exe> node scripts/lighthouse.mjs http://localhost:4300 [runs] [out.json]
// Several builds can be compared fairly by passing comma-separated base URLs:
// their runs are interleaved, so background load on the machine hits them alike.
// FORM=mobile or FORM=desktop limits the form factors; PAGES=/,/tools/ the pages.
// Lighthouse itself is fetched by npx (never a site dependency).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bases = (process.argv[2] || "http://localhost:4300").split(",");
const runs = Number(process.argv[3] || 3);
const outFile = process.argv[4];
const PAGES = process.env.PAGES ? process.env.PAGES.split(",") : ["/", "/tools/", "/tools/merge-pdf/", "/tools/compress-image/", "/workflows/"];
const FORMS = process.env.FORM ? [process.env.FORM] : ["mobile", "desktop"];
const LH = process.env.LIGHTHOUSE_BIN ? [process.env.LIGHTHOUSE_BIN] : ["npx", "--yes", "lighthouse@12.8.2"];
const dir = mkdtempSync(join(tmpdir(), "ata-lh-"));

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const results = [];
for (const formFactor of FORMS) {
  for (const page of PAGES) {
    const samplesBy = new Map(bases.map((b) => [b, []]));
    for (let i = 0; i < runs; i++) for (const base of bases) {
      const samples = samplesBy.get(base);
      const file = join(dir, `r.json`);
      const args = [
        ...LH.slice(1),
        base + page,
        "--quiet",
        "--output=json",
        `--output-path=${file}`,
        "--only-categories=performance,accessibility,best-practices,seo",
        "--chrome-flags=--headless=new --no-sandbox",
        ...(formFactor === "desktop" ? ["--preset=desktop"] : []),
      ];
      execFileSync(LH[0], args, { stdio: "ignore", shell: process.platform === "win32" });
      const r = JSON.parse(readFileSync(file, "utf8"));
      const a = r.audits;
      samples.push({
        perf: Math.round(r.categories.performance.score * 100),
        a11y: Math.round(r.categories.accessibility.score * 100),
        bp: Math.round(r.categories["best-practices"].score * 100),
        seo: Math.round(r.categories.seo.score * 100),
        fcp: a["first-contentful-paint"].numericValue,
        lcp: a["largest-contentful-paint"].numericValue,
        tbt: a["total-blocking-time"].numericValue,
        cls: a["cumulative-layout-shift"].numericValue,
        si: a["speed-index"].numericValue,
        bytes: a["total-byte-weight"].numericValue,
      });
    }
    for (const [base, samples] of samplesBy) {
    const row = { base, formFactor, page };
    for (const k of Object.keys(samples[0])) row[k] = median(samples.map((s) => s[k]));
    results.push(row);
    console.log(
      `${bases.length > 1 ? base.padEnd(24) + " " : ""}${formFactor.padEnd(8)} ${page.padEnd(24)} perf ${row.perf} a11y ${row.a11y} bp ${row.bp} seo ${row.seo} | FCP ${Math.round(row.fcp)} LCP ${Math.round(row.lcp)} TBT ${Math.round(row.tbt)} CLS ${row.cls.toFixed(3)} SI ${Math.round(row.si)} | ${(row.bytes / 1024).toFixed(0)} KB`,
    );
    }
  }
}
if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 2));
