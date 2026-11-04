// Dev-time static server for performance measurements: serves an exported
// build with gzip and the cache headers a real static host would send
// (hashed /_next/static files immutable, everything else revalidated).
// Usage: node scripts/perf-serve.mjs <dir> <port>
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve as resolvePath } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolvePath(process.argv[2] || "out");
const port = Number(process.argv[3] || 4300);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".txt", ".svg", ".wasm"]);
const gzCache = new Map();

async function find(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^[\\/]+/, "");
  let file = join(root, clean);
  if (!file.startsWith(root)) return null;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const file = await find(req.url || "/");
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }
  const ext = extname(file);
  const headers = {
    "content-type": TYPES[ext] || "application/octet-stream",
    "cache-control": req.url.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
  };
  let body = await readFile(file);
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
    // Keyed by modification time, so a rebuild under a running server is picked up.
    const key = `${file}:${(await stat(file)).mtimeMs}`;
    if (!gzCache.has(key)) gzCache.set(key, gzipSync(body, { level: 6 }));
    body = gzCache.get(key);
    headers["content-encoding"] = "gzip";
    headers.vary = "accept-encoding";
  }
  res.writeHead(200, headers).end(body);
}).listen(port, () => console.log(`perf-serve ${root} on http://localhost:${port}`));
