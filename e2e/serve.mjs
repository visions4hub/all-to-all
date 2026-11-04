// Minimal static server for the exported site in out/ (used by Playwright).
// Usage: node e2e/serve.mjs <port>
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "out");
const port = Number(process.argv[2] || 4173);
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
  ".woff": "font/woff",
  ".wasm": "application/wasm",
};

async function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^[\/]+/, "");
  let file = join(root, clean);
  if (!file.startsWith(root)) return null;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
    await stat(file);
    return file;
  } catch {
    try {
      await stat(file + ".html");
      return file + ".html";
    } catch {
      return null;
    }
  }
}

// Apply out/_headers (Cloudflare Pages format) so tests run under the real security headers.
function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), headers: {} };
      rules.push(current);
    } else if (current) {
      const i = raw.indexOf(":");
      current.headers[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
    }
  }
  return rules;
}
const headerRules = await readFile(join(root, "_headers"), "utf8").then(parseHeaders, () => []);
function headersFor(urlPath) {
  const out = {};
  for (const rule of headerRules) {
    const prefix = rule.pattern.replace(/\*$/, "");
    if (rule.pattern.endsWith("*") ? urlPath.startsWith(prefix) : urlPath === rule.pattern) Object.assign(out, rule.headers);
  }
  return out;
}

createServer(async (req, res) => {
  const file = await resolve(req.url || "/");
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, {
    ...headersFor((req.url || "/").split("?")[0]),
    "content-type": TYPES[extname(file)] || "application/octet-stream",
  });
  res.end(body);
}).listen(port, () => console.log(`serving out/ on http://localhost:${port}`));
