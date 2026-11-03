// Copies the PDF.js worker and the data it loads at runtime into public/vendor,
// so everything is served from our own origin (no CDN):
// - standard_fonts: the 14 standard PDF fonts, for files that don't embed them
// - cmaps: character maps for CJK and other non-embedded encodings
// - wasm: JPEG 2000 / JBIG2 image decoders and colour management
// - iccs: colour profile used for CMYK images
import { copyFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve("pdfjs-dist/package.json"));
const vendor = join(process.cwd(), "public", "vendor");
const out = join(vendor, "pdfjs");

mkdirSync(vendor, { recursive: true });
copyFileSync(join(pkg, "build", "pdf.worker.min.mjs"), join(vendor, "pdf.worker.min.mjs"));

rmSync(out, { recursive: true, force: true });
for (const dir of ["standard_fonts", "cmaps", "iccs"]) cpSync(join(pkg, dir), join(out, dir), { recursive: true });
// The QuickJS files only serve PDF form scripting, which we never enable.
cpSync(join(pkg, "wasm"), join(out, "wasm"), { recursive: true, filter: (src) => !/quickjs/i.test(src) });

console.log("Copied PDF.js worker and data →", vendor);
