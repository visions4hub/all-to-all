"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, CircleDashed, GripVertical, Loader2, MinusCircle, Trash2, XCircle } from "lucide-react";
import { ToolIcon } from "@/components/tool-icon";
import { Button } from "@/components/ui/button";
import type { WorkspaceFile } from "@/lib/engine/types";
import { formatNumber } from "@/lib/files/format";
import { useT } from "@/lib/i18n";
import type { ToolDefinition } from "@/lib/tools/types";
import type { ChainIssue, StepState } from "@/lib/workflows/engine";
import type { ToolModule } from "@/tools/types";
import { cn } from "@/lib/utils";

export type BuilderStep = {
  key: string;
  tool: ToolDefinition;
  settings: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each step has its own settings type
  module?: ToolModule<any>;
  loadError?: boolean;
};

function StatusLine({ state }: { state?: StepState }) {
  const t = useT();
  if (!state) return null;
  const p = state.progress;
  switch (state.status) {
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <CircleDashed className="size-3.5" />
          {t({ ar: "في الانتظار", en: "Waiting" })}
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-primary">
          <Loader2 className="size-3.5 animate-spin" />
          {t({ ar: "قيد التنفيذ", en: "Running" })}
          {p && p.total > 0 && (
            <span dir="ltr">
              {formatNumber(p.done)}/{formatNumber(p.total)}
            </span>
          )}
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="size-3.5" />
          {t({ ar: `تمت · ${formatNumber(state.outputCount ?? 0)} ملف`, en: `Done · ${formatNumber(state.outputCount ?? 0)} file(s)` })}
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-destructive">
          <XCircle className="size-3.5" />
          {t({ ar: "توقفت هنا", en: "Stopped here" })}
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MinusCircle className="size-3.5" />
          {t({ ar: "أُلغيت", en: "Cancelled" })}
        </span>
      );
    case "skipped":
      return <span className="text-xs text-muted-foreground">{t({ ar: "لم تُنفَّذ", en: "Not run" })}</span>;
  }
}

export function StepCard({
  step,
  index,
  count,
  state,
  issues,
  files,
  disabled,
  dragging,
  onMove,
  onRemove,
  onChange,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  step: BuilderStep;
  index: number;
  count: number;
  state?: StepState;
  issues: ChainIssue[];
  /** Real files for step 1 (so its settings can show page counts, sizes…); none for later steps. */
  files: WorkspaceFile[];
  disabled: boolean;
  dragging: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
  onChange: (settings: unknown) => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { tool, module } = step;
  const name = t(tool.name);
  const Settings = module?.Settings;

  return (
    <li
      className={cn("rounded-2xl border bg-card transition", dragging && "opacity-50 ring-2 ring-primary/40", state?.status === "error" && "border-destructive/50")}
      data-testid="workflow-step"
      data-slug={tool.slug}
      onDragEnter={(e) => {
        e.preventDefault();
        onDragEnter();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDragEnd();
      }}
    >
      <div className="flex items-center gap-2 p-3">
        <span
          draggable={!disabled}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", step.key);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          className={cn("hidden cursor-grab text-muted-foreground sm:block", disabled && "cursor-default opacity-40")}
          aria-hidden
        >
          <GripVertical className="size-4" />
        </span>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" dir="ltr">
          {index + 1}
        </span>
        <ToolIcon name={tool.icon} category={tool.category} size="sm" className="hidden size-8 shrink-0 rounded-lg sm:flex [&_svg]:size-4" />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug font-medium sm:text-base">{name}</p>
          <StatusLine state={state} />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="size-9 rounded-lg"
            disabled={disabled || index === 0}
            onClick={() => onMove(index - 1)}
            aria-label={t({ ar: `نقل «${tool.name.ar}» للأعلى`, en: `Move “${tool.name.en}” up` })}
          >
            <ArrowUp />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-9 rounded-lg"
            disabled={disabled || index === count - 1}
            onClick={() => onMove(index + 1)}
            aria-label={t({ ar: `نقل «${tool.name.ar}» للأسفل`, en: `Move “${tool.name.en}” down` })}
          >
            <ArrowDown />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-9 rounded-lg text-muted-foreground hover:text-destructive"
            disabled={disabled}
            onClick={onRemove}
            aria-label={t({ ar: `حذف «${tool.name.ar}»`, en: `Remove “${tool.name.en}”` })}
          >
            <Trash2 />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-9 rounded-lg"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={t({ ar: `إعدادات «${tool.name.ar}»`, en: `“${tool.name.en}” settings` })}
          >
            <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="space-y-1 px-3 pb-3">
          {issues.map((issue, i) => (
            <li
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-lg p-2 text-xs",
                issue.level === "error" ? "bg-destructive/8 text-destructive" : "bg-warning/10 text-warning",
              )}
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {t(issue.message)}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="border-t p-4" role="group" data-testid="step-settings" aria-label={t({ ar: `إعدادات «${tool.name.ar}»`, en: `“${tool.name.en}” settings` })}>
          {step.loadError ? (
            <p className="text-sm text-destructive">{t({ ar: "تعذّر تحميل هذه الأداة. أعد تحميل الصفحة.", en: "This tool couldn't load. Reload the page." })}</p>
          ) : !module ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t({ ar: "جارٍ التحميل…", en: "Loading…" })}
            </p>
          ) : Settings ? (
            <Settings settings={step.settings} onChange={onChange} files={files} activeFile={files[0]} disabled={disabled} />
          ) : (
            <p className="text-sm text-muted-foreground">{t({ ar: "لا توجد إعدادات لهذه الخطوة.", en: "This step has no settings." })}</p>
          )}
        </div>
      )}
    </li>
  );
}
