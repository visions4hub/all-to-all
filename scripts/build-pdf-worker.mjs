// Bundles the PDF tools' Web Workers into public/vendor/ and copies qpdf's
// WebAssembly next to it, so everything is served from our own origin (no CDN).
// Turbopack doesn't bundle `new Worker(new URL(...))` in static export, so we do it here.
import { build } from "rolldown";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const root = process.cwd();
const require = createRequire(import.meta.url);
const qpdfDir = dirname(require.resolve("@neslinesli93/qpdf-wasm"));
const vendor = join(root, "public", "vendor");

mkdirSync(join(vendor, "qpdf"), { recursive: true });
copyFileSync(join(qpdfDir, "qpdf.wasm"), join(vendor, "qpdf", "qpdf.wasm"));

// Compress worker (qpdf + pdf-lib) and compare worker (pixel and word diffs).
const workers = [
  ["src/tools/pdf/lib/compress.worker.ts", "pdf-compress-worker.js"],
  ["src/tools/pdf/lib/compare.worker.ts", "pdf-compare-worker.js"],
];
for (const [input, file] of workers) {
  await build({
    input: join(root, input),
    platform: "browser",
    resolve: { alias: { "@": join(root, "src") } },
    // qpdf's Emscripten glue only touches these in Node; never in the worker.
    external: ["fs", "path"],
    output: { file: join(vendor, file), format: "iife", minify: true },
    logLevel: "warn",
  });
}
console.log("Built PDF workers → public/vendor/pdf-compress-worker.js, pdf-compare-worker.js (+ qpdf/qpdf.wasm)");
