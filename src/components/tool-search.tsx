"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ToolIcon } from "@/components/tool-icon";
import { StatusBadge } from "@/components/status-badge";
import { useT } from "@/lib/i18n";
import { ALL_TOOLS, isUsable } from "@/lib/tools/registry";
import { searchTools } from "@/lib/tools/search";
import { cn } from "@/lib/utils";

/** Header search: a button that opens a dialog (also on Ctrl/⌘+K). */
export function ToolSearchButton({ className }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-9 items-center gap-2 rounded-xl border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground",
          className,
        )}
        aria-label={t({ ar: "ابحث عن أداة", en: "Search tools" })}
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden lg:inline">{t({ ar: "ابحث عن أداة…", en: "Search tools…" })}</span>
        <kbd dir="ltr" className="ms-2 hidden rounded-md border bg-muted px-1.5 font-sans text-[10px] lg:inline">
          Ctrl K
        </kbd>
      </button>
      <ToolSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function ToolSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const results = useMemo(() => searchTools(ALL_TOOLS, query), [query]);

  const go = (index: number) => {
    const tool = results[index];
    if (!tool || !isUsable(tool)) return;
    onOpenChange(false);
    router.push(`/tools/${tool.slug}/`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <DialogContent className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">{t({ ar: "البحث في الأدوات", en: "Search tools" })}</DialogTitle>
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="size-5 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(active);
              }
            }}
            placeholder={t({ ar: "مثلاً: دمج، ضغط الصور، Resize…", en: "e.g. merge, compress, تقسيم…" })}
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded
            aria-controls="tool-search-results"
          />
        </div>
        <ul id="tool-search-results" ref={listRef} role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-10 text-center text-sm text-muted-foreground">
              {t({ ar: "لا توجد أداة بهذا الاسم.", en: "No tool matches that." })}
            </li>
          )}
          {results.map((tool, i) => {
            const usable = isUsable(tool);
            return (
              <li key={tool.id} role="option" aria-selected={i === active} aria-disabled={!usable}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(i)}
                  disabled={!usable}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start",
                    i === active && "bg-accent",
                    !usable && "cursor-default opacity-70",
                  )}
                >
                  <ToolIcon name={tool.icon} category={tool.category} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t(tool.name)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t(tool.description)}</span>
                  </span>
                  {!usable && <StatusBadge status={tool.status} />}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
