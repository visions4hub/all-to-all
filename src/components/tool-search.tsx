"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type DialogComponent = typeof import("./tool-search-dialog").ToolSearchDialog;

// The dialog (with the tool registry and search) is loaded on first use, so it
// isn't parsed and hydrated on every page. Hovering or focusing the button
// starts the download early, so it is usually ready by the click.
let dialogPromise: Promise<DialogComponent> | null = null;
function loadDialog() {
  dialogPromise ??= import("./tool-search-dialog").then((m) => m.ToolSearchDialog);
  dialogPromise.catch(() => (dialogPromise = null));
  return dialogPromise;
}

/** Header search: a button that opens a dialog (also on Ctrl/⌘+K). */
export function ToolSearchButton({ className }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [Dialog, setDialog] = useState<DialogComponent | null>(null);

  const show = () => {
    setOpen(true);
    if (!Dialog) loadDialog().then((d) => setDialog(() => d), () => setOpen(false));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        loadDialog().then((d) => setDialog(() => d), () => setOpen(false));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={show}
        onPointerEnter={() => void loadDialog()}
        onFocus={() => void loadDialog()}
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
      {Dialog && <Dialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
