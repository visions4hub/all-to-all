"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ToolGrid } from "@/components/tool-card";
import { useT } from "@/lib/i18n";
import { ALL_TOOLS, isUsable } from "@/lib/tools/registry";
import { searchTools } from "@/lib/tools/search";
import type { ToolCategory } from "@/lib/tools/types";
import { cn } from "@/lib/utils";

type Filter = "all" | ToolCategory;

/** Searchable, filterable list of tools. Ready tools come first. */
export function ToolDirectory({ category, showFilter = true }: { category?: ToolCategory; showFilter?: boolean }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(category ?? "all");

  const tools = useMemo(() => {
    const pool = filter === "all" ? ALL_TOOLS : ALL_TOOLS.filter((x) => x.category === filter);
    const found = searchTools(pool, query);
    return query.trim() ? found : [...found].sort((a, b) => Number(isUsable(b)) - Number(isUsable(a)));
  }, [filter, query]);

  const filters: { value: Filter; label: { ar: string; en: string } }[] = [
    { value: "all", label: { ar: "الكل", en: "All" } },
    { value: "pdf", label: { ar: "PDF", en: "PDF" } },
    { value: "image", label: { ar: "الصور", en: "Images" } },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t({ ar: "ابحث في الأدوات", en: "Search tools" })}</span>
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t({ ar: "ابحث: دمج، ضغط، تدوير…", en: "Search: merge, compress, rotate…" })}
            className="h-11 w-full rounded-xl border bg-card ps-10 pe-4 text-sm outline-none focus:ring-3 focus:ring-ring/30"
          />
        </label>
        {showFilter && !category && (
          <div className="flex gap-1 rounded-xl border bg-card p-1" role="tablist">
            {filters.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "h-9 flex-1 rounded-lg px-4 text-sm font-medium transition-colors sm:flex-none",
                  filter === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(f.label)}
              </button>
            ))}
          </div>
        )}
      </div>
      {tools.length ? (
        <ToolGrid tools={tools} />
      ) : (
        <p className="rounded-2xl border bg-card py-16 text-center text-muted-foreground">
          {t({ ar: "لا توجد أداة مطابقة.", en: "No matching tool." })}
        </p>
      )}
    </div>
  );
}
