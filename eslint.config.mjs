import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local tool settings and extra git worktrees; not part of this checkout.
    ".claude/**",
    // Generated at build time (PDF.js worker copy, bundled image worker) and test output.
    "public/vendor/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
