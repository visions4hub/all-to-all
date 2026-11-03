import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { KIND_INFO } from "@/lib/files/detect";
import { ALL_TOOLS, getToolBySlug } from "./registry";
import type { ToolStatus } from "./types";

const SRC = fileURLToPath(new URL("../..", import.meta.url));

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** Keys of the ICONS map in src/components/tool-icon.tsx. */
function iconKeys(): Set<string> {
  const text = readFileSync(join(SRC, "components", "tool-icon.tsx"), "utf8");
  const block = /const ICONS[^{]*\{([\s\S]*?)\n\};/.exec(text);
  if (!block) throw new Error("ICONS map not found in tool-icon.tsx");
  return new Set([...block[1].matchAll(/^\s*"?([a-z0-9-]+)"?\s*:/gm)].map((m) => m[1]));
}

const ALLOWED_STATUS: ToolStatus[] = ["operational", "beta", "building", "unsupported"];

describe("tool registry", () => {
  it("is not empty", () => {
    expect(ALL_TOOLS.length).toBeGreaterThan(0);
  });

  it("has unique ids and slugs", () => {
    const ids = ALL_TOOLS.map((t) => t.id);
    const slugs = ALL_TOOLS.map((t) => t.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses lowercase kebab-case slugs", () => {
    for (const t of ALL_TOOLS) expect(t.slug, t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("finds every tool by its slug", () => {
    for (const t of ALL_TOOLS) expect(getToolBySlug(t.slug)).toBe(t);
    expect(getToolBySlug("does-not-exist")).toBeUndefined();
  });

  it("has non-empty Arabic and English names and descriptions", () => {
    for (const t of ALL_TOOLS) {
      expect(t.name.ar.trim(), t.id).not.toBe("");
      expect(t.name.en.trim(), t.id).not.toBe("");
      expect(t.description.ar.trim(), t.id).not.toBe("");
      expect(t.description.en.trim(), t.id).not.toBe("");
    }
  });

  it("uses only icons handled by tool-icon.tsx", () => {
    const keys = iconKeys();
    expect(keys.size).toBeGreaterThan(0);
    for (const t of ALL_TOOLS) expect(keys.has(t.icon), `${t.id}: ${t.icon}`).toBe(true);
  });

  it("accepts at least one known file kind", () => {
    for (const t of ALL_TOOLS) {
      expect(t.accepts.length, t.id).toBeGreaterThan(0);
      for (const kind of t.accepts) expect(Object.keys(KIND_INFO), t.id).toContain(kind);
      expect(t.accepts, t.id).not.toContain("unknown");
    }
  });

  it("has consistent file count limits", () => {
    for (const t of ALL_TOOLS) {
      expect(Number.isInteger(t.minFiles) && t.minFiles >= 1, t.id).toBe(true);
      if (t.maxFiles !== null) expect(t.maxFiles, t.id).toBeGreaterThanOrEqual(t.minFiles);
    }
  });

  it("uses only allowed statuses and categories", () => {
    for (const t of ALL_TOOLS) {
      expect(ALLOWED_STATUS, t.id).toContain(t.status);
      expect(["pdf", "image"], t.id).toContain(t.category);
    }
  });
});

describe("Phase 2 features stay hidden", () => {
  it("no file under src/app or src/components imports future-registry", () => {
    const files = [...listFiles(join(SRC, "app")), ...listFiles(join(SRC, "components"))].filter((f) =>
      /\.(ts|tsx|js|jsx|mjs)$/.test(f),
    );
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => /future-registry/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
