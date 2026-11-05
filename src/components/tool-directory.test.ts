import { describe, expect, it } from "vitest";
import { TOOL_GROUPS } from "@/components/tool-directory";
import { ALL_TOOLS } from "@/lib/tools/registry";

describe("tool directory groups", () => {
  it("place every tool in exactly one group, with no unknown slugs", () => {
    const grouped = TOOL_GROUPS.flatMap((g) => g.slugs);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(ALL_TOOLS.map((t) => t.slug).sort());
  });
});
