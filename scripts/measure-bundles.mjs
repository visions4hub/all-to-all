// Dev-time report: the JS and CSS each exported page references in its HTML
// (what a first visit downloads before any lazy tool code), raw and gzipped.
// Usage: node scripts/measure-bundles.mjs [outDir] [--json file]
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith("--")) ?? "out";
const jsonIdx = args.indexOf("--json");
const jsonFile = jsonIdx >= 0 ? args[jsonIdx + 1] : null;

const sizeCache = new Map();
function assetSize(url) {
  if (sizeCache.has(url)) return sizeCache.get(url);
  const path = join(outDir, decodeURIComponent(url.split("?")[0]));
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const s = { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  sizeCache.set(url, s);
  return s;
}

function pages(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "_next" || name === "vendor") continue;
      found.push(...pages(p));
    } else if (name === "index.html") found.push(p);
  }
  return found;
}

const rows = [];
for (const file of pages(outDir)) {
  const html = readFileSync(file, "utf8");
  const route = "/" + relative(outDir, file).replace(/\\/g, "/").replace(/index\.html$/, "");
  // noModule scripts (legacy polyfills) are never downloaded by modern browsers.
  const js = new Set(
    [...html.matchAll(/<script([^>]*)>/g)]
      .filter((m) => !/nomodule/i.test(m[1]))
      .map((m) => /src="([^"]+\.js)"/.exec(m[1])?.[1])
      .filter(Boolean),
  );
  const css = new Set([...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]));
  const sum = (set) =>
    [...set].reduce((t, u) => {
      const s = assetSize(u);
      return s ? { raw: t.raw + s.raw, gzip: t.gzip + s.gzip } : t;
    }, { raw: 0, gzip: 0 });
  const htmlGz = gzipSync(Buffer.from(html), { level: 9 }).length;
  rows.push({ route, js: sum(js), css: sum(css), jsFiles: js.size, html: { raw: html.length, gzip: htmlGz } });
}
rows.sort((a, b) => a.route.localeCompare(b.route));

const kb = (n) => (n / 1024).toFixed(1);
console.log("route".padEnd(34), "JS raw", "JS gz", "files", "CSS gz", "HTML gz");
for (const r of rows) {
  console.log(r.route.padEnd(34), kb(r.js.raw).padStart(6), kb(r.js.gzip).padStart(6), String(r.jsFiles).padStart(5), kb(r.css.gzip).padStart(6), kb(r.html.gzip).padStart(7));
}
if (jsonFile) writeFileSync(jsonFile, JSON.stringify(rows, null, 2));
