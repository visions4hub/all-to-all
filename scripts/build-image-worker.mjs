// Bundles the image tools' Web Worker into public/vendor/ so it is served from
// our own origin as one plain script. (Turbopack copies `new URL("./x.ts")`
// worker files as raw assets in static export, so we bundle it ourselves.)
import { build } from "rolldown";
import { join } from "node:path";

const root = process.cwd();
await build({
  input: join(root, "src/tools/image/lib/image.worker.ts"),
  platform: "browser",
  output: { file: join(root, "public/vendor/image-worker.js"), format: "iife", minify: true },
  logLevel: "warn",
});
console.log("Built image worker → public/vendor/image-worker.js");
