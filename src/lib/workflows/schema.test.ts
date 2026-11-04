import { describe, expect, it } from "vitest";
import { ALL_TOOLS, isUsable } from "@/lib/tools/registry";
import { WORKFLOW_PRESETS } from "@/lib/tools/workflow-presets";
import { getToolLoader } from "@/tools/load";
import { chainableTools, isChainable, notChainableTools } from "./chainable";
import { cleanName, FILE_FORMAT, FILE_VERSION, LIMITS, parseWorkflowFile, serializeWorkflows } from "./schema";
import { decodeSettings, encodeSettings, sanitizeSettings } from "./settings";

const doc = (workflows: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, workflows, ...extra });
const wf = (steps: unknown, name = "Test") => doc([{ name, steps }]);

function errorOf(text: string) {
  const r = parseWorkflowFile(text);
  if (r.ok) throw new Error("expected a parse error");
  return r.error;
}

describe("chainable tools", () => {
  it("are usable tools with a module, minus the interactive editors", () => {
    const slugs = chainableTools().map((t) => t.slug);
    expect(slugs).toEqual(expect.arrayContaining(["resize-image", "compress-image", "watermark-image", "merge-pdf", "image-to-pdf", "rotate-pdf"]));
    for (const slug of ["photo-editor", "edit-pdf", "sign-pdf", "organize-pdf", "fill-pdf-forms", "blur-image", "meme-generator"]) {
      expect(slugs).not.toContain(slug);
    }
    for (const t of ALL_TOOLS) if (!isUsable(t) || !getToolLoader(t.slug)) expect(isChainable(t), t.slug).toBe(false);
    expect(notChainableTools().every((n) => n.reason.ar && n.reason.en)).toBe(true);
  });

  it("every preset uses chainable tools only", () => {
    for (const p of WORKFLOW_PRESETS) for (const s of p.steps) expect(isChainable(ALL_TOOLS.find((t) => t.slug === s.slug)!), `${p.id}/${s.slug}`).toBe(true);
  });
});

describe("export / import JSON", () => {
  it("round-trips names, steps and settings, including binary values", async () => {
    const logo = new File([new Uint8Array([1, 2, 3, 250])], "شعار.png", { type: "image/png" });
    const text = await serializeWorkflows([
      { name: "صور الموقع", steps: [{ slug: "resize-image", settings: { mode: "max", maxWidth: 800 } }, { slug: "watermark-image", settings: { logo, text: "©" } }] },
      { name: "PDF", steps: [{ slug: "watermark-pdf", settings: { image: { bytes: new Uint8Array([9, 8, 7]), type: "png", name: "x", width: 1, height: 1 } } }] },
    ]);
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe(FILE_FORMAT);
    expect(parsed.workflows[0].steps[0].tool).toBe("resize-image");

    const r = parseWorkflowFile(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.workflows.map((w) => w.name)).toEqual(["صور الموقع", "PDF"]);
    expect(r.workflows[0].steps[0]).toEqual({ slug: "resize-image", settings: { mode: "max", maxWidth: 800 } });
    const back = (r.workflows[0].steps[1].settings as { logo: File }).logo;
    expect(back).toBeInstanceOf(File);
    expect(back.name).toBe("شعار.png");
    expect(back.type).toBe("image/png");
    expect([...new Uint8Array(await back.arrayBuffer())]).toEqual([1, 2, 3, 250]);
    const img = (r.workflows[1].steps[0].settings as { image: { bytes: Uint8Array } }).image;
    expect([...img.bytes]).toEqual([9, 8, 7]);
  });

  it("missing settings mean the tool's defaults", () => {
    const r = parseWorkflowFile(wf([{ tool: "merge-pdf" }]));
    expect(r.ok && r.workflows[0].steps[0]).toEqual({ slug: "merge-pdf", settings: {} });
  });

  it.each([
    ["not JSON", "{oops", "valid JSON"],
    ["empty", "", "valid JSON"],
    ["array at the top", "[]", "isn't an All To All workflow"],
    ["another format", JSON.stringify({ format: "other", version: 1, workflows: [] }), "isn't an All To All workflow"],
    ["a newer version", doc([], { version: 99 }), "Unsupported file version (99)"],
    ["no workflows", doc([]), "contains no workflows"],
    ["workflows not an array", doc({ a: 1 }), "contains no workflows"],
    ["a workflow that is a string", doc(["x"]), "Workflow 1 is invalid"],
    ["no name", doc([{ steps: [{ tool: "merge-pdf" }] }]), "has no name"],
    ["a name of only control characters", doc([{ name: "‮\u0000 ", steps: [{ tool: "merge-pdf" }] }]), "has no name"],
    ["no steps", wf([]), "has no steps"],
    ["a step without a tool", wf([{ settings: {} }]), "Step 1 in “Test” is invalid"],
    ["an unknown tool", wf([{ tool: "rm-rf" }]), "unknown or non-chainable tool: “rm-rf”"],
    ["an interactive tool", wf([{ tool: "resize-image" }, { tool: "photo-editor" }]), "Step 2 in “Test” uses an unknown or non-chainable tool: “photo-editor”"],
    ["a tool that isn't built yet", wf([{ tool: "gif-maker" }]), "non-chainable tool"],
    ["a tool slug with odd characters", wf([{ tool: "../resize-image" }]), "unknown or non-chainable"],
    ["settings that are an array", wf([{ tool: "merge-pdf", settings: [1] }]), "settings of step 1"],
    ["settings with __proto__", wf([{ tool: "resize-image", settings: JSON.parse('{"__proto__": {"polluted": true}}') }]), "settings of step 1"],
    ["nested constructor key", wf([{ tool: "resize-image", settings: { a: { constructor: { prototype: {} } } } }]), "settings of step 1"],
    ["bad base64 bytes", wf([{ tool: "watermark-pdf", settings: { image: { bytes: { $bytes: "@@@" } } } }]), "settings of step 1"],
    ["a file marker with a bad type", wf([{ tool: "watermark-image", settings: { logo: { $file: { name: "x", type: "<script>", data: "" } } } }]), "settings of step 1"],
  ])("rejects %s", (_label, text, message) => {
    expect(errorOf(text).en).toContain(message);
    expect(errorOf(text).ar.length).toBeGreaterThan(0);
  });

  it("raw __proto__ text in the file pollutes nothing", () => {
    const text = `{"format":"${FILE_FORMAT}","version":1,"workflows":[{"name":"x","steps":[{"tool":"resize-image","settings":{"__proto__":{"polluted":1}}}]}],"__proto__":{"polluted":1}}`;
    expect(parseWorkflowFile(text).ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects oversized input and too many steps or workflows", () => {
    expect(errorOf("x".repeat(LIMITS.bytes + 1)).en).toContain("too large");
    expect(errorOf(wf(Array.from({ length: LIMITS.steps + 1 }, () => ({ tool: "rotate-pdf" })))).en).toContain(`more than ${LIMITS.steps} steps`);
    expect(errorOf(doc(Array.from({ length: LIMITS.workflows + 1 }, () => ({ name: "a", steps: [{ tool: "rotate-pdf" }] })))).en).toContain("more than");
  });

  it("rejects deeply nested settings", () => {
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 50; i++) deep = deep.a = {};
    expect(errorOf(wf([{ tool: "resize-image", settings: root }])).en).toContain("settings of step 1");
  });

  it("cleans names: control and bidi-override characters removed, length capped", () => {
    expect(cleanName("  a‮\u0007b \n c ")).toBe("ab c");
    expect(cleanName("x".repeat(500))).toHaveLength(LIMITS.name);
    const r = parseWorkflowFile(doc([{ name: "‮evil<b>", steps: [{ tool: "rotate-pdf" }] }]));
    expect(r.ok && r.workflows[0].name).toBe("evil<b>"); // shown as text by React, never as HTML
  });
});

describe("sanitizeSettings", () => {
  const defaults = {
    mode: "pixels",
    width: null as number | null,
    keepRatio: true,
    quality: 90,
    custom: { w: 3, h: 2 },
    selection: { scope: "all", ranges: "" },
    logo: null as File | null,
    tags: ["a"],
  };

  it("applies valid values and keeps defaults for the rest", () => {
    expect(sanitizeSettings(defaults, { mode: "max", width: 800, custom: { w: 16 } })).toEqual({ ...defaults, mode: "max", width: 800, custom: { w: 16, h: 2 } });
  });

  it("resets wrong types, drops unknown keys and reports what was reset", () => {
    const report = { reset: [] as string[] };
    const out = sanitizeSettings(defaults, { quality: "high", keepRatio: 1, custom: "x", extra: 1, tags: [5, "b"], selection: { scope: 3 } }, report);
    expect(out).toEqual({ ...defaults, tags: ["a", "b"] });
    expect(report.reset).toEqual(["keepRatio", "quality", "custom", "selection.scope", "tags[0]"]);
    expect("extra" in out).toBe(false);
  });

  it("a null default accepts files, numbers and clean objects, never functions", () => {
    const logo = new File(["x"], "l.png");
    expect(sanitizeSettings(defaults, { logo }).logo).toBe(logo);
    expect(sanitizeSettings(defaults, { width: 5 }).width).toBe(5);
    expect(sanitizeSettings(defaults, { logo: () => 1 }).logo).toBeNull();
    expect(sanitizeSettings(defaults, { width: Number.NaN }).width).toBeNull();
  });

  it("encode → decode keeps settings equal", async () => {
    const s = { ...defaults, logo: new File([new Uint8Array([7])], "a.png", { type: "image/png" }) };
    const back = decodeSettings(JSON.parse(JSON.stringify(await encodeSettings(s)))) as typeof s;
    expect({ ...back, logo: null }).toEqual({ ...s, logo: null });
    expect(back.logo!.name).toBe("a.png");
  });
});
