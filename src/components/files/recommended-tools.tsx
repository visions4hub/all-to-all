"use client";

import Link from "next/link";
import { ToolIcon } from "@/components/tool-icon";
import { StatusBadge } from "@/components/status-badge";
import type { FileKind } from "@/lib/files/detect";
import { useT } from "@/lib/i18n";
import { isUsable, toolsForKind } from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/** Tools that can take this kind of file. Opening one keeps the files in memory. */
export function RecommendedTools({ kind, limit = 6, className }: { kind: FileKind; limit?: number; className?: string }) {
  const t = useT();
  const tools = toolsForKind(kind).slice(0, limit);

  if (tools.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {kind === "heic" || kind === "tiff" || kind === "avif"
          ? t({
              ar: "هذه الصيغة غير مدعومة في الإصدار الحالي لأن المتصفحات لا تفتحها بشكل موثوق.",
              en: "This format isn't supported in this release because browsers can't open it reliably.",
            })
          : t({ ar: "لا توجد أداة لهذا النوع من الملفات بعد.", en: "No tool handles this file type yet." })}
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {tools.map((tool) => {
        const usable = isUsable(tool);
        const inner = (
          <>
            <ToolIcon name={tool.icon} category={tool.category} size="sm" className="size-7 rounded-lg [&_svg]:size-3.5" />
            <span className="text-sm font-medium">{t(tool.name)}</span>
            {!usable && <StatusBadge status={tool.status} />}
          </>
        );
        return (
          <li key={tool.id}>
            {usable ? (
              <Link
                href={`/tools/${tool.slug}/`}
                className="inline-flex items-center gap-2 rounded-xl border bg-card py-1.5 ps-1.5 pe-3 transition-colors hover:border-primary/50 hover:bg-accent"
              >
                {inner}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-xl border border-dashed bg-card/60 py-1.5 ps-1.5 pe-2 opacity-80">
                {inner}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
