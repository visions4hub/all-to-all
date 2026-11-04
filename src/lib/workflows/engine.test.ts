import { describe, expect, it, vi } from "vitest";
import { UserFacingError, type ProcessInput, type ProcessOutput } from "@/lib/engine/types";
import type { FileKind } from "@/lib/files/detect";
import { getToolBySlug } from "@/lib/tools/registry";
import type { ToolDefinition } from "@/lib/tools/types";
import type { ToolModule } from "@/tools/types";
import { checkChain, runChain, type ChainStep, type StepState } from "./engine";
import { predictOutputKinds } from "./kinds";

// ---- helpers ------------------------------------------------------------------

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngBlob = (text: string) => new Blob([new Uint8Array(PNG), text], { type: "image/png" });
const pdfBlob = (text: string) => new Blob([`%PDF-1.7\n${text}`], { type: "application/pdf" });
/** The text after the fake PNG / PDF header. */
async function body(b: Blob) {
  const bytes = new Uint8Array(await b.arrayBuffer());
  const skip = bytes[0] === 0x89 ? PNG.length : bytes[0] === 0x25 ? "%PDF-1.7\n".length : 0;
  return new TextDecoder().decode(bytes.subarray(skip));
}

function tool(slug: string, accepts: FileKind[], outputs: string[], extra: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: slug,
    slug,
    category: "image",
    icon: "merge",
    name: { ar: `أداة ${slug}`, en: `Tool ${slug}` },
    description: { ar: "", en: "" },
    keywords: { ar: [], en: [] },
    accepts,
    outputs,
    minFiles: 1,
    maxFiles: null,
    status: "operational",
    milestone: 4,
    ...extra,
  };
}

/** Per-file tool: appends `>tag` to each file's content, keeps PNG. */
function tagModule(tag: string, spy?: (inputs: ProcessInput[]) => void): ToolModule<{ tag: string }> {
  return {
    mode: "per-file",
    defaultSettings: { tag },
    actionLabel: { ar: tag, en: tag },
    process: async (inputs, s) => {
      spy?.(inputs);
      const out: ProcessOutput[] = [];
      for (const f of inputs) out.push({ name: `${f.name}-${s.tag}`, blob: pngBlob(`${await body(f.file)}>${s.tag}`), sourceIds: [f.id] });
      return out;
    },
  };
}

const step = (t: ToolDefinition, m: ToolModule<never> | ToolModule<{ tag: string }>, settings?: unknown): ChainStep => ({
  tool: t,
  module: m as ChainStep["module"],
  settings: settings ?? m.defaultSettings,
});

const input = (id: string, text: string, kind: FileKind = "png"): ProcessInput => ({
  id,
  name: `${id}.${kind}`,
  kind,
  file: new File([kind === "pdf" ? pdfBlob(text) : pngBlob(text)], `${id}.${kind}`),
});

const IMG = tool("t-img", ["png", "jpeg"], ["PNG"]);

// ---- compatibility --------------------------------------------------------------

describe("checkChain", () => {
  const real = (slug: string, settings: unknown = {}) => ({ tool: getToolBySlug(slug)!, settings });

  it.each([
    [["resize-image", "compress-image", "watermark-image"], ["jpeg", "png"]],
    [["merge-pdf", "add-page-numbers", "watermark-pdf"], ["pdf"]],
    [["image-to-pdf", "rotate-pdf"], ["jpeg"]],
    [["image-to-pdf", "add-page-numbers"], ["png", "webp"]],
    [["crop-image", "convert-image"], ["png"]],
    [["pdf-to-image", "resize-image", "image-to-pdf"], ["pdf"]],
  ] as [string[], FileKind[]][])("accepts %j", (slugs, kinds) => {
    expect(checkChain(slugs.map((s) => real(s)), kinds)).toEqual([]);
  });

  it("rejects a step that can't open the previous step's output, naming both steps", () => {
    const issues = checkChain([real("pdf-to-text"), real("rotate-pdf")], ["pdf"]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ step: 1, level: "error" });
    expect(issues[0].message.en).toContain("Step 2 (Rotate PDF)");
    expect(issues[0].message.en).toContain("TXT");
    expect(issues[0].message.en).toContain("Step 1 (Extract PDF Text)");
  });

  it("rejects images into a PDF tool and PDFs into an image tool", () => {
    expect(checkChain([real("resize-image"), real("merge-pdf")], ["png"])[0]).toMatchObject({ step: 1, level: "error" });
    expect(checkChain([real("resize-image")], ["pdf"])[0]).toMatchObject({ step: 0, level: "error" });
  });

  it("follows the format setting: a WebP-only output can't go to a JPG/PNG-only step", () => {
    const pngOnly = tool("t-png-only", ["png"], ["PNG"]);
    const issues = checkChain([real("convert-image", { format: "webp" }), { tool: pngOnly, settings: {} }], ["png"]);
    expect(issues[0]).toMatchObject({ step: 1, level: "error" });
    expect(checkChain([real("convert-image", { format: "png" }), { tool: pngOnly, settings: {} }], ["jpeg"])).toEqual([]);
  });

  it("warns when only some incoming kinds fit", () => {
    const issues = checkChain([real("convert-image", { format: "keep" }), real("image-to-pdf")], ["png", "svg"]);
    expect(issues).toEqual([]); // keep turns SVG into PNG
    const w = checkChain([real("resize-image")], ["png", "svg"]);
    expect(w[0]).toMatchObject({ step: 0, level: "warning" });
  });

  it("flags interactive tools", () => {
    for (const slug of ["photo-editor", "edit-pdf", "sign-pdf", "organize-pdf", "fill-pdf-forms", "blur-image", "meme-generator"]) {
      expect(checkChain([real(slug)], null)[0], slug).toMatchObject({ level: "error" });
    }
  });

  it("predicts output kinds from the format setting", () => {
    expect(predictOutputKinds(getToolBySlug("compress-image")!, { format: "keep" }, ["jpeg"])).toEqual(["jpeg"]);
    expect(predictOutputKinds(getToolBySlug("convert-image")!, { format: "webp" }, ["png"])).toEqual(["webp"]);
    expect(predictOutputKinds(getToolBySlug("pdf-to-image")!, { format: "png" }, ["pdf"])).toEqual(["png"]);
    expect(predictOutputKinds(getToolBySlug("add-page-numbers")!, { format: "n" }, ["pdf"])).toEqual(["pdf"]);
    expect(predictOutputKinds(getToolBySlug("pdf-to-text")!, {}, ["pdf"])).toEqual(["txt"]);
  });
});

// ---- running ----------------------------------------------------------------------

describe("runChain", () => {
  it("feeds each step's outputs into the next, in memory and in order", async () => {
    const seen: string[][] = [];
    const steps = [
      step(IMG, tagModule("A", (i) => seen.push(i.map((f) => f.name)))),
      step({ ...IMG, slug: "t-img-2" }, tagModule("B", (i) => seen.push(i.map((f) => f.name)))),
      step({ ...IMG, slug: "t-img-3" }, tagModule("C")),
    ];
    const updates: StepState[][] = [];
    const res = await runChain(steps, [input("x", "x"), input("y", "y")], { signal: new AbortController().signal, onUpdate: (s) => updates.push(s) });

    expect(res.status).toBe("done");
    expect(res.steps.map((s) => s.status)).toEqual(["done", "done", "done"]);
    expect(res.result.outputs.map((o) => o.name)).toEqual(["x.png-A-B-C", "y.png-A-B-C"]);
    expect(await Promise.all(res.result.outputs.map((o) => body(o.blob)))).toEqual(["x>A>B>C", "y>A>B>C"]);
    // Final outputs point back at the user's files.
    expect(res.result.outputs.map((o) => o.sourceIds)).toEqual([["x"], ["y"]]);
    // Step 2 received step 1's outputs (not the originals), one at a time per file.
    expect(seen.slice(2)).toEqual([["x.png-A"], ["y.png-A"]]);
    // Each step was reported running before done.
    const s1 = updates.map((u) => u[1].status);
    expect(s1.indexOf("running")).toBeLessThan(s1.indexOf("done"));
  });

  it("batch steps merge several files and keep every origin", async () => {
    const merge: ToolModule<object> = {
      mode: "batch",
      defaultSettings: {},
      actionLabel: { ar: "", en: "" },
      process: async (inputs) => [
        { name: "merged.pdf", blob: pdfBlob((await Promise.all(inputs.map((f) => body(f.file)))).join("+")), sourceIds: inputs.map((f) => f.id) },
      ],
    };
    const toPdf = tool("t-merge", ["png"], ["PDF"], { minFiles: 2 });
    const pdfTool = tool("t-pdf", ["pdf"], ["PDF"]);
    const stamp: ToolModule<object> = {
      mode: "per-file",
      defaultSettings: {},
      actionLabel: { ar: "", en: "" },
      process: async ([f]) => [{ name: "stamped.pdf", blob: pdfBlob(`${await body(f.file)}#`), sourceIds: [f.id] }],
    };
    const res = await runChain([step(toPdf, merge as never), step(pdfTool, stamp as never)], [input("a", "a"), input("b", "b")], {
      signal: new AbortController().signal,
    });
    expect(res.status).toBe("done");
    expect(await body(res.result.outputs[0].blob)).toBe("a+b#");
    expect(res.result.outputs[0].sourceIds).toEqual(["a", "b"]);
  });

  it("an error in step 2 stops the chain and names the step and file", async () => {
    const third = vi.fn();
    const failing: ToolModule<object> = {
      mode: "per-file",
      defaultSettings: {},
      actionLabel: { ar: "", en: "" },
      process: async ([f]) => {
        if (f.name.startsWith("y")) throw new UserFacingError("This image is damaged");
        return [{ name: f.name, blob: f.file, sourceIds: [f.id] }];
      },
    };
    const res = await runChain(
      [step(IMG, tagModule("A")), step(tool("t-fail", ["png"], ["PNG"]), failing as never), step({ ...IMG, slug: "t-3" }, tagModule("C", third))],
      [input("x", "x"), input("y", "y")],
      { signal: new AbortController().signal },
    );
    expect(res.status).toBe("error");
    expect(res.stoppedAt).toBe(1);
    expect(res.steps.map((s) => s.status)).toEqual(["done", "error", "skipped"]);
    expect(res.error!.en).toBe("Step 2 (Tool t-fail): “y.png-A”: This image is damaged");
    expect(res.error!.ar).toContain("الخطوة 2");
    expect(third).not.toHaveBeenCalled();
    expect(res.result.outputs).toEqual([]);
  });

  it("cancelling during step 2 stops it and skips the rest", async () => {
    const controller = new AbortController();
    const third = vi.fn();
    const slow: ToolModule<object> = {
      mode: "batch",
      defaultSettings: {},
      actionLabel: { ar: "", en: "" },
      process: (_inputs, _s, ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          setTimeout(() => controller.abort(), 5);
        }),
    };
    const res = await runChain(
      [step(IMG, tagModule("A")), step({ ...IMG, slug: "t-slow" }, slow as never), step({ ...IMG, slug: "t-3" }, tagModule("C", third))],
      [input("x", "x")],
      { signal: controller.signal },
    );
    expect(res.status).toBe("cancelled");
    expect(res.stoppedAt).toBe(1);
    expect(res.steps.map((s) => s.status)).toEqual(["done", "cancelled", "skipped"]);
    expect(res.error).toBeNull();
    expect(third).not.toHaveBeenCalled();
  });

  it("an already-aborted signal runs nothing", async () => {
    const first = vi.fn();
    const c = new AbortController();
    c.abort();
    const res = await runChain([step(IMG, tagModule("A", first))], [input("x", "x")], { signal: c.signal });
    expect(res.status).toBe("cancelled");
    expect(first).not.toHaveBeenCalled();
  });

  it("checks the real bytes of each output against the next step", async () => {
    const toText: ToolModule<object> = {
      mode: "per-file",
      defaultSettings: {},
      actionLabel: { ar: "", en: "" },
      process: async ([f]) => [{ name: "out.txt", blob: new Blob(["hello"], { type: "text/plain" }), sourceIds: [f.id] }],
    };
    const res = await runChain([step(IMG, toText as never), step({ ...IMG, slug: "t-2" }, tagModule("B"))], [input("x", "x")], {
      signal: new AbortController().signal,
    });
    expect(res.status).toBe("error");
    expect(res.stoppedAt).toBe(1);
    expect(res.error!.en).toContain("Step 2");
    expect(res.error!.en).toContain("“out.txt”");
  });

  it("stops when a step gets too few or too many files", async () => {
    const needsTwo = tool("t-two", ["png"], ["PNG"], { minFiles: 2 });
    const res = await runChain([step(needsTwo, tagModule("A"))], [input("x", "x")], { signal: new AbortController().signal });
    expect(res.error!.en).toBe("Step 1 (Tool t-two): needs at least 2 files, but received 1.");

    const one = tool("t-one", ["png"], ["PNG"], { maxFiles: 1 });
    const res2 = await runChain([step(IMG, tagModule("A")), step(one, tagModule("B"))], [input("x", "x"), input("y", "y")], {
      signal: new AbortController().signal,
    });
    expect(res2.stoppedAt).toBe(1);
    expect(res2.error!.en).toContain("at most 1 file(s), but received 2");
  });

  it("stops on the tool's own validation message", async () => {
    const m = { ...tagModule("A"), validate: () => ({ ar: "اكتب النص", en: "Type the text" }) };
    const res = await runChain([step(IMG, m)], [input("x", "x")], { signal: new AbortController().signal });
    expect(res.error).toEqual({ ar: "الخطوة 1 (أداة t-img): اكتب النص", en: "Step 1 (Tool t-img): Type the text" });
  });

  it("stops when a step produces nothing, or the tool is interactive", async () => {
    const empty: ToolModule<object> = { mode: "batch", defaultSettings: {}, actionLabel: { ar: "", en: "" }, process: async () => [] };
    const res = await runChain([step(IMG, empty as never)], [input("x", "x")], { signal: new AbortController().signal });
    expect(res.error!.en).toContain("produced no files");

    const editor = tool("photo-editor", ["png"], ["PNG"]);
    const res2 = await runChain([step(editor, tagModule("A"))], [input("x", "x")], { signal: new AbortController().signal });
    expect(res2.error!.en).toContain("can't be used in a workflow");

    const withWorkspace = { ...tagModule("A"), Workspace: () => null };
    const res3 = await runChain([step(IMG, withWorkspace)], [input("x", "x")], { signal: new AbortController().signal });
    expect(res3.status).toBe("error");
  });

  it("reports the browser running out of memory clearly", async () => {
    const oom: ToolModule<object> = {
      mode: "per-file",
      defaultSettings: {},
      actionLabel: { ar: "", en: "" },
      process: async () => {
        throw new RangeError("Array buffer allocation failed");
      },
    };
    const res = await runChain([step(IMG, oom as never)], [input("x", "x")], { signal: new AbortController().signal });
    expect(res.error!.en).toContain("ran out of memory");
  });
});
