"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, Settings2, ShieldCheck, Square } from "lucide-react";
import { FileDropzone } from "@/components/files/file-dropzone";
import { FileFacts, FileList, FileListToolbar } from "@/components/files/file-list";
import { FileThumb } from "@/components/files/file-thumb";
import { ResultsPanel } from "@/components/workspace/results-panel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { runProcessor } from "@/lib/engine/run";
import type { Progress as ProgressInfo, RunResult } from "@/lib/engine/types";
import { buildOutputName } from "@/lib/files/filename";
import { formatNumber } from "@/lib/files/format";
import { useT } from "@/lib/i18n";
import { acceptAttribute } from "@/lib/tools/registry";
import type { ToolDefinition } from "@/lib/tools/types";
import { useWorkspace } from "@/stores/workspace";
import type { ToolModule } from "@/tools/types";
import { cn } from "@/lib/utils";

/**
 * The shared workspace every tool uses: files panel, preview, settings,
 * process / cancel, progress, per-file results, downloads and ZIP.
 */
export function ToolWorkspace<S>({ tool, module }: { tool: ToolDefinition; module: ToolModule<S> }) {
  const t = useT();
  const allFiles = useWorkspace((s) => s.files);
  const addFiles = useWorkspace((s) => s.addFiles);

  const accepted = useMemo(() => allFiles.filter((f) => tool.accepts.includes(f.kind)), [allFiles, tool.accepts]);
  const rejected = useMemo(() => new Set(allFiles.filter((f) => !tool.accepts.includes(f.kind)).map((f) => f.id)), [allFiles, tool.accepts]);

  const [settings, setSettings] = useState<S>(module.defaultSettings);
  const [selectedId, setSelectedId] = useState<string>();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const active = accepted.find((f) => f.id === selectedId) ?? accepted[0];
  const filesToUse = tool.maxFiles ? accepted.slice(0, tool.maxFiles) : accepted;

  // Cancel any running job when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  const problem = (() => {
    if (accepted.length < tool.minFiles) {
      return tool.minFiles > 1
        ? t({ ar: `أضف ${formatNumber(tool.minFiles)} ملفات على الأقل`, en: `Add at least ${formatNumber(tool.minFiles)} files` })
        : t({ ar: "أضف ملفاً للبدء", en: "Add a file to start" });
    }
    const msg = module.validate?.(filesToUse, settings);
    return msg ? t(msg) : null;
  })();

  const start = async () => {
    if (problem || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: module.mode === "batch" ? 1 : filesToUse.length });
    setSheetOpen(false);
    try {
      const res = await runProcessor(module.process, filesToUse, settings, module.mode, {
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });
      setResult(res);
    } finally {
      setRunning(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const settingsPanel = module.Settings ? (
    <module.Settings settings={settings} onChange={setSettings} files={filesToUse} activeFile={active} disabled={running} />
  ) : null;

  const actionButton = (
    <div className="space-y-2">
      {running ? (
        <Button variant="outline" className="h-12 w-full rounded-xl text-base" onClick={() => abortRef.current?.abort()}>
          <Square className="size-4" />
          {t({ ar: "إلغاء", en: "Cancel" })}
        </Button>
      ) : (
        <Button className="h-12 w-full rounded-xl text-base shadow-lift" disabled={!!problem} onClick={start}>
          <Play className="size-4" />
          {t(module.actionLabel)}
        </Button>
      )}
      {!running && problem && accepted.length > 0 && <p className="text-center text-xs text-muted-foreground">{problem}</p>}
    </div>
  );

  if (module.Workspace) return <module.Workspace tool={tool} />;

  if (allFiles.length === 0) {
    return (
      <FileDropzone
        size="hero"
        accept={acceptAttribute(tool.accepts)}
        multiple={tool.maxFiles !== 1}
        enableCamera={tool.category === "image"}
        onFiles={(f) => void addFiles(f)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px] lg:items-start">
        {/* Files */}
        <aside className="order-2 space-y-3 rounded-2xl border bg-card p-3 lg:order-1 lg:sticky lg:top-20">
          <FileListToolbar count={allFiles.length} totalSize={allFiles.reduce((n, f) => n + f.size, 0)} />
          <FileList
            files={allFiles}
            selectedId={active?.id}
            onSelect={setSelectedId}
            invalidIds={rejected}
            className="max-h-[50vh] overflow-y-auto lg:max-h-[calc(100vh-18rem)]"
          />
          {tool.maxFiles !== null && accepted.length > tool.maxFiles && (
            <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">
              {t({
                ar: `هذه الأداة تعالج ${formatNumber(tool.maxFiles)} ملف في كل مرة؛ سيُستخدم أول ملف في القائمة.`,
                en: `This tool handles ${formatNumber(tool.maxFiles)} file at a time; the first one in the list is used.`,
              })}
            </p>
          )}
          <FileDropzone
            size="compact"
            accept={acceptAttribute(tool.accepts)}
            multiple={tool.maxFiles !== 1}
            enableCamera={tool.category === "image"}
            onFiles={(f) => void addFiles(f)}
          />
        </aside>

        {/* Preview */}
        <section className="order-1 min-w-0 rounded-2xl border bg-card p-3 lg:order-2" aria-label={t({ ar: "المعاينة", en: "Preview" })}>
          {active ? (
            module.Preview ? (
              <module.Preview settings={settings} onChange={setSettings} file={active} files={filesToUse} />
            ) : (
              <div>
                <FileThumb file={active} fit="contain" className="aspect-[4/3] w-full rounded-xl" />
                <div className="mt-3 px-1">
                  <p dir="auto" className="truncate font-medium">
                    {active.name}
                  </p>
                  <FileFacts file={active} />
                </div>
              </div>
            )
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
              {t({ ar: "لا توجد ملفات مناسبة لهذه الأداة بعد.", en: "No files this tool can use yet." })}
            </div>
          )}
        </section>

        {/* Settings (desktop) */}
        <aside className="order-3 hidden space-y-4 rounded-2xl border bg-card p-4 lg:sticky lg:top-20 lg:block">
          <h2 className="flex items-center gap-2 font-semibold">
            <Settings2 className="size-4 text-primary" />
            {t({ ar: "الإعدادات", en: "Settings" })}
          </h2>
          {settingsPanel}
          {actionButton}
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-teal" />
            {t({ ar: "تتم المعالجة على جهازك", en: "Processed on your device" })}
          </p>
        </aside>
      </div>

      {running && progress && (
        <div className="rounded-2xl border bg-card p-4" role="status">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span className="me-auto">
              {t({ ar: "جارٍ المعالجة…", en: "Processing…" })}
              {progress.label && (
                <span dir="auto" className="ms-2 text-muted-foreground">
                  {progress.label}
                </span>
              )}
            </span>
            <span dir="ltr" className="text-muted-foreground">
              {formatNumber(progress.done)} / {formatNumber(progress.total)}
            </span>
          </div>
          <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
        </div>
      )}

      {result && (
        <ResultsPanel
          result={result}
          sources={accepted}
          zipName={buildOutputName(accepted[0]?.name ?? "all-to-all", { suffix: tool.slug, ext: "zip" })}
          onReset={() => setResult(null)}
        />
      )}

      {/* Mobile: sticky action bar + settings bottom sheet */}
      <div className="sticky bottom-0 z-30 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex gap-2">
          {settingsPanel && (
            <Button variant="outline" className="h-12 rounded-xl" onClick={() => setSheetOpen(true)} disabled={running}>
              <Settings2 />
              {t({ ar: "الإعدادات", en: "Settings" })}
            </Button>
          )}
          <div className={cn("flex-1")}>{actionButton}</div>
        </div>
      </div>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl p-5 pb-8">
          <SheetTitle>{t({ ar: "الإعدادات", en: "Settings" })}</SheetTitle>
          {settingsPanel}
          {actionButton}
        </SheetContent>
      </Sheet>
    </div>
  );
}
