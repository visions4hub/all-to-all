"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ToolIcon } from "@/components/tool-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";
import type { ToolDefinition } from "@/lib/tools/types";
import { chainableTools } from "@/lib/workflows/chainable";
import { kindLabel, type ChainKind } from "@/lib/workflows/kinds";

/**
 * Picks a tool to add as the next step. Tools that can open what the chain
 * currently produces (`incoming`) come first; the others stay available
 * (they may fit after reordering) under their own heading.
 */
export function AddStepDialog({ incoming, onAdd, disabled }: { incoming: ChainKind[] | null; onAdd: (tool: ToolDefinition) => void; disabled: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const tools = useMemo(() => chainableTools(), []);
  const fits = (tool: ToolDefinition) => !incoming || incoming.some((k) => (tool.accepts as ChainKind[]).includes(k));
  const groups = [
    { key: "fit", title: incoming ? { ar: "تناسب ناتج الخطوة الأخيرة", en: "Fit the last step's output" } : { ar: "الأدوات", en: "Tools" }, tools: tools.filter(fits) },
    { key: "other", title: { ar: "أدوات أخرى (لا تقبل الناتج الحالي)", en: "Other tools (can't open the current output)" }, tools: tools.filter((x) => !fits(x)) },
  ].filter((g) => g.tools.length);

  const pick = (tool: ToolDefinition) => {
    onAdd(tool);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" className="h-12 w-full rounded-xl border-dashed text-base" onClick={() => setOpen(true)} disabled={disabled}>
        <Plus />
        {t({ ar: "إضافة خطوة", en: "Add step" })}
      </Button>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t({ ar: "إضافة خطوة", en: "Add step" })}</DialogTitle>
          <DialogDescription>
            {incoming
              ? t({ ar: `الناتج الحالي: ${incoming.map(kindLabel).join("، ")}`, en: `Current output: ${incoming.map(kindLabel).join(", ")}` })
              : t({ ar: "اختر الأداة التي تبدأ بها السلسلة.", en: "Choose the tool the chain starts with." })}
          </DialogDescription>
        </DialogHeader>
        {groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{t(g.title)}</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.tools.map((tool) => (
                <li key={tool.slug}>
                  <button
                    type="button"
                    onClick={() => pick(tool)}
                    className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-start transition hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    data-tool={tool.slug}
                  >
                    <ToolIcon name={tool.icon} category={tool.category} size="sm" className="size-9 shrink-0 rounded-lg" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{t(tool.name)}</span>
                      <span className="block text-xs text-muted-foreground" dir="ltr">
                        {tool.accepts.map(kindLabel).join(", ")} → {tool.outputs.filter((o) => o !== "ZIP").join(", ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
