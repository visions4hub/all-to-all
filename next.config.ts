import type { NextConfig } from "next";

// Static export: the whole site builds to plain files in `out/` and runs on
// any static host. Nothing here may require a running server.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    // A stray package-lock.json in the user folder confuses root detection.
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
