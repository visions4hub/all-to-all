"use client";

import { useT } from "@/lib/i18n";
import type { ToolStatus } from "@/lib/tools/types";
import { cn } from "@/lib/utils";

const LABELS: Record<ToolStatus, { ar: string; en: string }> = {
  operational: { ar: "جاهزة", en: "Ready" },
  beta: { ar: "تجريبية", en: "Beta" },
  building: { ar: "قيد البناء", en: "In progress" },
  unsupported: { ar: "غير مدعومة", en: "Unsupported" },
};

export function StatusBadge({ status, className }: { status: ToolStatus; className?: string }) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        status === "operational" && "bg-teal-soft text-teal",
        status === "beta" && "bg-brand-soft text-primary",
        status === "building" && "bg-muted text-muted-foreground",
        status === "unsupported" && "bg-pdf-soft text-pdf",
        className,
      )}
    >
      {t(LABELS[status])}
    </span>
  );
}
