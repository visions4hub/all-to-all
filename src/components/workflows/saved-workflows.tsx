"use client";

import { useRef, useState } from "react";
import { Download, FileUp, FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatNumber } from "@/lib/files/format";
import { useT } from "@/lib/i18n";
import { getToolBySlug } from "@/lib/tools/registry";
import type { WorkflowDef } from "@/lib/workflows/schema";

/** Workflows saved in this browser: open, export, delete; import from / export to JSON; clear all. */
export function SavedWorkflows({
  workflows,
  activeId,
  busy,
  onOpen,
  onDelete,
  onExport,
  onExportAll,
  onImport,
  onClear,
}: {
  workflows: WorkflowDef[] | null;
  activeId: string | null;
  busy: boolean;
  onOpen: (w: WorkflowDef) => void;
  onDelete: (w: WorkflowDef) => void;
  onExport: (w: WorkflowDef) => void;
  onExportAll: () => void;
  onImport: (file: File) => void;
  onClear: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const list = workflows ?? [];

  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="saved-workflows-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="saved-workflows-title" className="me-auto text-lg font-semibold">
          {t({ ar: "سير العمل المحفوظ", en: "Saved workflows" })}
        </h2>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="workflow-import-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onImport(f);
          }}
        />
        <Button variant="outline" className="h-9 rounded-lg" disabled={busy} onClick={() => inputRef.current?.click()}>
          <FileUp />
          {t({ ar: "استيراد JSON", en: "Import JSON" })}
        </Button>
        <Button variant="outline" className="h-9 rounded-lg" disabled={busy || !list.length} onClick={onExportAll}>
          <Download />
          {t({ ar: "تصدير الكل", en: "Export all" })}
        </Button>
        <Button variant="ghost" className="h-9 rounded-lg text-destructive hover:text-destructive" disabled={busy || !list.length} onClick={() => setConfirmClear(true)}>
          <Trash2 />
          {t({ ar: "مسح الكل", en: "Clear all" })}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t({ ar: "تُحفظ في هذا المتصفح فقط (IndexedDB)، ولا تُرفع إلى أي مكان.", en: "Stored only in this browser (IndexedDB), never uploaded." })}
      </p>

      {workflows === null ? null : list.length === 0 ? (
        <p className="mt-4 rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
          {t({ ar: "لا يوجد سير عمل محفوظ بعد.", en: "No saved workflows yet." })}
        </p>
      ) : (
        <ul className="mt-4 space-y-2" data-testid="saved-workflows">
          {list.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-background/60 p-3" data-testid="saved-workflow" aria-current={w.id === activeId || undefined}>
              <div className="min-w-0 flex-1">
                <p dir="auto" className="truncate font-medium">
                  {w.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t({ ar: `${formatNumber(w.steps.length)} خطوات`, en: `${formatNumber(w.steps.length)} steps` })}
                  {" · "}
                  {w.steps.map((s) => (getToolBySlug(s.slug) ? t(getToolBySlug(s.slug)!.name) : s.slug)).join(t({ ar: " ← ", en: " → " }))}
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" className="rounded-lg" disabled={busy} onClick={() => onOpen(w)}>
                  <FolderOpen />
                  {t({ ar: "فتح", en: "Open" })}
                </Button>
                <Button size="icon" variant="ghost" className="size-8 rounded-lg" disabled={busy} onClick={() => onExport(w)} aria-label={t({ ar: `تصدير «${w.name}»`, en: `Export “${w.name}”` })}>
                  <Download />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() => onDelete(w)}
                  aria-label={t({ ar: `حذف «${w.name}»`, en: `Delete “${w.name}”` })}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t({ ar: "مسح كل سير العمل المحفوظ؟", en: "Clear all saved workflows?" })}</DialogTitle>
            <DialogDescription>
              {t({
                ar: `سيُحذف ${formatNumber(list.length)} سير عمل من هذا المتصفح. صدّرها أولاً إن أردت الاحتفاظ بنسخة.`,
                en: `${formatNumber(list.length)} workflow(s) will be removed from this browser. Export them first if you want a copy.`,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>
              {t({ ar: "تراجع", en: "Keep them" })}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmClear(false);
                onClear();
              }}
            >
              {t({ ar: "مسح الكل", en: "Clear all" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
