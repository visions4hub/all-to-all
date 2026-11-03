"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { ToolIcon } from "@/components/tool-icon";
import { useLocale, useT } from "@/lib/i18n";
import { getToolBySlug } from "@/lib/tools/registry";
import { WORKFLOW_PRESETS, type WorkflowPreset } from "@/lib/tools/workflow-presets";
import { cn } from "@/lib/utils";

/**
 * Ready-made workflow chains. Each card opens the builder pre-filled
 * (/workflows/?preset=<id>), or calls `onSelect` when shown inside the builder.
 */
export function WorkflowPresetList({ onSelect, className }: { onSelect?: (preset: WorkflowPreset) => void; className?: string }) {
  const t = useT();
  const ar = useLocale() === "ar";
  const Sep = ar ? ChevronLeft : ChevronRight;
  const Arrow = ar ? ArrowLeft : ArrowRight;
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {WORKFLOW_PRESETS.map((preset) => {
        const label = t({ ar: `استخدام «${preset.name.ar}»`, en: `Use “${preset.name.en}”` });
        const body = (
          <>
            <h3 className="font-semibold">{t(preset.name)}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t(preset.description)}</p>
            <ol className="mt-4 flex flex-wrap items-center gap-1.5">
              {preset.steps.map((step, i) => {
                const tool = getToolBySlug(step.slug);
                if (!tool) return null;
                return (
                  <li key={i} className="flex items-center gap-1.5">
                    {i > 0 && <Sep className="size-4 text-muted-foreground" aria-hidden />}
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted py-1 ps-1 pe-2 text-xs font-medium">
                      <ToolIcon name={tool.icon} category={tool.category} size="sm" className="size-6 rounded-md [&_svg]:size-3.5" />
                      {t(tool.name)}
                    </span>
                  </li>
                );
              })}
            </ol>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              {t({ ar: "افتح في المنشئ", en: "Open in the builder" })}
              <Arrow className="size-4" />
            </span>
          </>
        );
        const cardClass =
          "block rounded-2xl border bg-card p-5 text-start transition hover:border-primary/40 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
        return onSelect ? (
          <button key={preset.id} type="button" className={cardClass} aria-label={label} onClick={() => onSelect(preset)} data-preset={preset.id}>
            {body}
          </button>
        ) : (
          <Link key={preset.id} href={`/workflows/?preset=${preset.id}`} className={cardClass} aria-label={label} data-preset={preset.id}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}
