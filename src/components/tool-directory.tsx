"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { ToolIcon } from "@/components/tool-icon";
import { StatusBadge } from "@/components/status-badge";
import { formatNumber } from "@/lib/files/format";
import { useLocale, useT, type Localized } from "@/lib/i18n";
import { ALL_TOOLS, isUsable } from "@/lib/tools/registry";
import { searchTools } from "@/lib/tools/search";
import type { ToolCategory, ToolDefinition } from "@/lib/tools/types";
import { cn } from "@/lib/utils";

type Filter = "all" | ToolCategory;

/** Tools grouped by what people want to do. Every tool belongs to exactly one group. */
export const TOOL_GROUPS: { id: string; title: Localized; slugs: string[] }[] = [
  {
    id: "organize",
    title: { ar: "تنظيم PDF", en: "Organize PDF" },
    slugs: ["merge-pdf", "split-pdf", "remove-pages", "extract-pages", "organize-pdf", "rotate-pdf", "add-page-numbers"],
  },
  {
    id: "edit-sign",
    title: { ar: "تعديل وتوقيع", en: "Edit & sign" },
    slugs: ["edit-pdf", "sign-pdf", "fill-pdf-forms", "watermark-pdf", "crop-pdf", "compare-pdf"],
  },
  {
    id: "convert",
    title: { ar: "تحويل", en: "Convert" },
    slugs: ["image-to-pdf", "pdf-to-image", "pdf-to-text", "convert-image", "gif-maker"],
  },
  {
    id: "optimize",
    title: { ar: "ضغط وتحجيم", en: "Compress & resize" },
    slugs: ["compress-pdf", "compress-image", "resize-image", "crop-image", "rotate-image"],
  },
  {
    id: "images",
    title: { ar: "تعديل الصور", en: "Edit images" },
    slugs: ["photo-editor", "watermark-image", "meme-generator", "blur-image", "image-metadata"],
  },
];

function ToolRow({ tool }: { tool: ToolDefinition }) {
  const t = useT();
  const Arrow = useLocale() === "ar" ? ArrowLeft : ArrowRight;
  const usable = isUsable(tool);
  const body = (
    <>
      <ToolIcon name={tool.icon} category={tool.category} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-foreground">{t(tool.name)}</span>
        <span className="text-[13px] leading-6 text-muted-foreground">{t(tool.description)}</span>
      </span>
      {usable ? (
        <Arrow className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-gold" aria-hidden />
      ) : (
        <StatusBadge status={tool.status} />
      )}
    </>
  );
  const base = "group flex h-full items-center gap-3.5 rounded-2xl border bg-card p-4 text-start";
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
      className={cn(base, "shadow-soft transition-colors hover:border-gold/45 hover:bg-[#15120d] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none")}
    >
      {body}
    </Link>
  );
}

function RowGrid({ tools }: { tools: ToolDefinition[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => (
        <ToolRow key={tool.id} tool={tool} />
      ))}
    </div>
  );
}

/** Searchable, filterable list of tools, grouped by task when not searching. */
export function ToolDirectory({ category, showFilter = true }: { category?: ToolCategory; showFilter?: boolean }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(category ?? "all");
  const searching = query.trim().length > 0;

  const pool = useMemo(() => (filter === "all" ? ALL_TOOLS : ALL_TOOLS.filter((x) => x.category === filter)), [filter]);
  const found = useMemo(() => searchTools(pool, query), [pool, query]);

  const groups = useMemo(
    () =>
      TOOL_GROUPS.map((g) => ({ ...g, tools: g.slugs.map((s) => pool.find((x) => x.slug === s)).filter((x) => x !== undefined) })).filter(
        (g) => g.tools.length > 0,
      ),
    [pool],
  );

  const filters: { value: Filter; label: Localized; count: number }[] = [
    { value: "all", label: { ar: "الكل", en: "All" }, count: ALL_TOOLS.length },
    { value: "pdf", label: { ar: "PDF", en: "PDF" }, count: ALL_TOOLS.filter((x) => x.category === "pdf").length },
    { value: "image", label: { ar: "الصور", en: "Images" }, count: ALL_TOOLS.filter((x) => x.category === "image").length },
  ];

  return (
    <div>
      {/* Search and filter stay in reach while scrolling, just under the site header. */}
      <div className="sticky top-[72px] z-20 -mx-4 mb-8 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">{t({ ar: "ابحث في الأدوات", en: "Search tools" })}</span>
            <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t({ ar: "ابحث: دمج، ضغط، تدوير…", en: "Search: merge, compress, rotate…" })}
              className="h-11 w-full rounded-xl border bg-card ps-10 pe-4 text-[15px] outline-none focus:ring-3 focus:ring-ring/30"
            />
          </label>
          {showFilter && !category && (
            <div className="flex gap-2" role="tablist">
              {filters.map((f) => (
                <button
                  key={f.value}
                  role="tab"
                  aria-selected={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "h-10 flex-1 rounded-full border px-4 text-sm font-semibold transition-colors sm:flex-none",
                    filter === f.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-foreground/75 hover:border-gold/40 hover:text-foreground",
                  )}
                >
                  {t(f.label)}{" "}
                  <span dir="ltr" className="opacity-70">
                    {formatNumber(f.count)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {searching ? (
        found.length ? (
          <RowGrid tools={found} />
        ) : (
          <p className="rounded-2xl border bg-card py-16 text-center text-muted-foreground">{t({ ar: "لا توجد أداة مطابقة.", en: "No matching tool." })}</p>
        )
      ) : (
        <div className="space-y-12">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`group-${g.id}`}>
              <div className="mb-4 flex items-baseline gap-3 border-b pb-3">
                <h2 id={`group-${g.id}`} className="text-2xl font-bold sm:text-[1.75rem]">
                  {t(g.title)}
                </h2>
                <span dir="ltr" className="text-sm text-muted-foreground">
                  {formatNumber(g.tools.length)}
                </span>
              </div>
              <RowGrid tools={g.tools} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
