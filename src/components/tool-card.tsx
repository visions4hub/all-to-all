"use client";

import Link from "next/link";
import { ArrowUpLeft, ArrowUpRight } from "lucide-react";
import { ToolIcon } from "@/components/tool-icon";
import { StatusBadge } from "@/components/status-badge";
import { useLocale, useT } from "@/lib/i18n";
import { isUsable } from "@/lib/tools/registry";
import type { ToolDefinition } from "@/lib/tools/types";
import { cn } from "@/lib/utils";

/** A tool tile. Tools that aren't built yet are shown but not clickable. */
export function ToolCard({ tool, compact = false }: { tool: ToolDefinition; compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const usable = isUsable(tool);
  const Arrow = locale === "ar" ? ArrowUpLeft : ArrowUpRight;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <ToolIcon
          name={tool.icon}
          category={tool.category}
          size={compact ? "sm" : "md"}
        />
        {usable ? (
          <Arrow className="size-4 text-gold opacity-0 group-hover:opacity-100" aria-hidden />
        ) : (
          <StatusBadge status={tool.status} />
        )}
      </div>
      <h3 className={cn("mt-4 font-semibold text-foreground", compact ? "text-sm" : "text-base")}>{t(tool.name)}</h3>
      {!compact && <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t(tool.description)}</p>}
    </>
  );

  const base = cn(
    "group relative flex h-full flex-col rounded-2xl border bg-card text-start",
    compact ? "p-4" : "p-5",
  );

  if (!usable) {
    return (
      <div className={cn(base, "opacity-80")} aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <Link
      href={`/tools/${tool.slug}/`}
      className={cn(base, "shadow-soft hover:border-gold/50 hover:shadow-lift focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none")}
    >
      {body}
    </Link>
  );
}

export function ToolGrid({ tools, compact }: { tools: ToolDefinition[]; compact?: boolean }) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:gap-4",
        compact ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      )}
    >
      {tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} compact={compact} />
      ))}
    </div>
  );
}
