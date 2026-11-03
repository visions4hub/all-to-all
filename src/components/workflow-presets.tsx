"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { ToolIcon } from "@/components/tool-icon";
import { useLocale, useT } from "@/lib/i18n";
import { getToolBySlug } from "@/lib/tools/registry";
import { WORKFLOW_PRESETS } from "@/lib/tools/workflow-presets";

/** Read-only preview of workflow chains until the builder ships. */
export function WorkflowPresetList() {
  const t = useT();
  const Sep = useLocale() === "ar" ? ChevronLeft : ChevronRight;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {WORKFLOW_PRESETS.map((preset) => (
        <div key={preset.id} className="rounded-2xl border bg-card p-5">
          <h3 className="font-semibold">{t(preset.name)}</h3>
          <ol className="mt-4 flex flex-wrap items-center gap-1.5">
            {preset.steps.map((slug, i) => {
              const tool = getToolBySlug(slug);
              if (!tool) return null;
              return (
                <li key={slug} className="flex items-center gap-1.5">
                  {i > 0 && <Sep className="size-4 text-muted-foreground" aria-hidden />}
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted py-1 ps-1 pe-2 text-xs font-medium">
                    <ToolIcon name={tool.icon} category={tool.category} size="sm" className="size-6 rounded-md [&_svg]:size-3.5" />
                    {t(tool.name)}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
