// Compare PDF: the full comparison behind the main button, producing the HTML report.

import { throwIfCancelled, UserFacingError, type ProcessContext, type ProcessInput, type ProcessOutput } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import { comparePixels, compareText } from "./compare-client";
import { buildReportHtml, pageStatus, SENSITIVITY, summarize, VISUAL_CHANGE_MIN, type PageResult, type Sensitivity } from "./compare-core";
import { pageText, renderPair, toDataUrl, type RenderableDoc } from "./compare-render";
import { currentLocale, userError } from "./errors";
import { openForText, type PdfOpener, type TextSourceDoc } from "./text-extract";

export type CompareSettings = {
  /** Render pages and compare pixels (and put difference pictures in the report). */
  visual: boolean;
  sensitivity: Sensitivity;
};

export const DEFAULT_COMPARE: CompareSettings = { visual: true, sensitivity: "normal" };

/** Pixel width pages are rendered at for the report's visual comparison. */
export const REPORT_RENDER_WIDTH = 1000;

async function openNamed(input: ProcessInput, open: PdfOpener): Promise<TextSourceDoc> {
  try {
    return await openForText(input, open);
  } catch (error) {
    throw new UserFacingError(`${input.name}: ${(error as Error).message}`);
  }
}

export async function comparePdfs(inputs: ProcessInput[], settings: CompareSettings, ctx: ProcessContext, open: PdfOpener): Promise<ProcessOutput[]> {
  if (inputs.length !== 2) throw userError({ ar: "أضف ملفَّي PDF اثنين بالضبط للمقارنة.", en: "Add exactly two PDF files to compare." });
  const [inA, inB] = inputs;
  const docA = await openNamed(inA, open);
  let docB: TextSourceDoc | null = null;
  try {
    docB = await openNamed(inB, open);
    const pages = Math.max(docA.numPages, docB.numPages);
    const results: PageResult[] = [];
    const images = new Map<number, string>();
    for (let n = 1; n <= pages; n++) {
      throwIfCancelled(ctx.signal);
      ctx.onProgress({ done: n - 1, total: pages });
      const result = await compareText(n, await pageText(docA, n, ctx.signal), await pageText(docB, n, ctx.signal), ctx.signal);
      if (settings.visual) {
        const pair = await renderPair(docA as unknown as RenderableDoc, docB as unknown as RenderableDoc, n, REPORT_RENDER_WIDTH);
        const diff = await comparePixels(pair.a, pair.b, pair.width, pair.height, SENSITIVITY[settings.sensitivity], ctx.signal);
        result.visual = diff.changed / diff.total;
        result.sizeDiffers = pair.sizeDiffers;
        if (pageStatus(result) !== "same" && result.visual > VISUAL_CHANGE_MIN) images.set(n, toDataUrl(diff.image, pair.width, pair.height));
      }
      results.push(result);
    }
    ctx.onProgress({ done: pages, total: pages });

    const locale = currentLocale();
    const html = buildReportHtml(
      { nameA: inA.name, nameB: inB.name, pagesA: docA.numPages, pagesB: docB.numPages, pages: results, images, visualIncluded: settings.visual, generatedAt: new Date() },
      locale,
    );
    const s = summarize(results);
    return [
      {
        name: buildOutputName(inA.name, { suffix: "comparison", ext: "html" }),
        blob: new Blob([html], { type: "text/html;charset=utf-8" }),
        sourceIds: [inA.id, inB.id],
        meta: [
          { label: { ar: "الصفحات المقارنة", en: "Pages compared" }, value: pages },
          { label: { ar: "صفحات فيها فروقات", en: "Pages with differences" }, value: s.changed.length + s.onlyA.length + s.onlyB.length },
          { label: { ar: "كلمات مضافة", en: "Words added" }, value: s.added },
          { label: { ar: "كلمات محذوفة", en: "Words removed" }, value: s.removed },
        ],
      },
    ];
  } finally {
    await docA.loadingTask.destroy();
    await docB?.loadingTask.destroy();
  }
}
