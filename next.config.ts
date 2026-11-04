import type { NextConfig } from "next";

// Static export: the whole site builds to plain files in `out/` and runs on
// any static host. Nothing here may require a running server.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Don't let `next dev` write an AGENTS.md file into the repository.
  agentRules: false,
  turbopack: {
    // A stray package-lock.json in the user folder confuses root detection.
    root: process.cwd(),
    resolveAlias: {
      // JSZip's browser build asks for Node's "stream" only for generateNodeStream(), which we
      // never use. Without this alias Next ships a stream/util polyfill (~79 KB raw) that also
      // probes eval(), which our Content-Security-Policy blocks. JSZip falls back cleanly.
      stream: { browser: "./src/lib/empty-module.ts" },
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
