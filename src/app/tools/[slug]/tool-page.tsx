"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Construction, Info, Loader2, ShieldCheck } from "lucide-react";
import { Container } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { ToolGrid } from "@/components/tool-card";
import { ToolIcon } from "@/components/tool-icon";
import { Button } from "@/components/ui/button";
import { KIND_INFO } from "@/lib/files/detect";
import { useT } from "@/lib/i18n";
import { getToolBySlug, isUsable, toolsInCategory } from "@/lib/tools/registry";
import { useRecentTools } from "@/stores/recent-tools";
import { getToolLoader } from "@/tools/load";
import type { ToolModule } from "@/tools/types";

type Workspace = typeof import("@/components/workspace/tool-workspace").ToolWorkspace;

export function ToolPage({ slug }: { slug: string }) {
  const t = useT();
  const tool = getToolBySlug(slug)!;
  const usable = isUsable(tool);
  const markUsed = useRecentTools((s) => s.markUsed);
  const [loaded, setLoaded] = useState<{ mod: ToolModule<unknown>; Workspace: Workspace } | null>(null);
  const [failed, setFailed] = useState(false);
  const loader = usable ? getToolLoader(tool.slug) : undefined;
  // A usable tool without a module is a registry mistake; show the error state rather than spin forever.
  const loadError = failed || (usable && !loader);

  useEffect(() => {
    if (!usable || !loader) return;
    markUsed(tool.slug);
    let alive = true;
    // The shared workspace (file list, results, ZIP…) loads with the tool's own
    // code, so it stays out of the page's first bundle.
    Promise.all([loader(), import("@/components/workspace/tool-workspace")])
      .then(([m, w]) => alive && setLoaded({ mod: m.default, Workspace: w.ToolWorkspace }))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [tool.slug, usable, loader, markUsed]);

  const formats = [...new Set(tool.accepts.map((k) => KIND_INFO[k].label))].join(" · ");
  const related = toolsInCategory(tool.category).filter((x) => x.id !== tool.id && isUsable(x)).slice(0, 4);

  return (
    <>
      <section className="border-b bg-[#0d0c09]">
        <Container className="py-8 sm:py-10">
          <nav className="mb-6 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground" aria-label={t({ ar: "مسار التنقل", en: "Breadcrumb" })}>
            <Link href="/tools/" className="hover:text-foreground">
              {t({ ar: "الأدوات", en: "Tools" })}
            </Link>
            <span aria-hidden>/</span>
            <Link href={tool.category === "pdf" ? "/pdf/" : "/image/"} className="hover:text-foreground">
              {tool.category === "pdf" ? "PDF" : t({ ar: "الصور", en: "Images" })}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-foreground/85" aria-current="page">
              {t(tool.name)}
            </span>
          </nav>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
            <ToolIcon name={tool.icon} category={tool.category} size="lg" className="size-15 [&_svg]:size-7" />
            <div className="min-w-0 flex-[1_1_18rem]">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold sm:text-4xl">{t(tool.name)}</h1>
                {tool.status !== "operational" && <StatusBadge status={tool.status} />}
              </div>
              <p className="mt-1 max-w-2xl text-muted-foreground">{t(tool.description)}</p>
            </div>
            <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <li className="rounded-full border px-3 py-1.5">
                {t({ ar: "الصيغ المقبولة:", en: "Accepts:" })} <span dir="ltr">{formats}</span>
              </li>
              <li className="rounded-full border px-3 py-1.5">
                {t({ ar: "الناتج:", en: "Output:" })} <span dir="ltr">{tool.outputs.join(" · ")}</span>
              </li>
              <li className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 px-3 py-1.5 text-gold">
                <ShieldCheck className="size-3.5" />
                {t({ ar: "بدون رفع ملفات", en: "No uploads" })}
              </li>
            </ul>
          </div>
          {tool.note && (
            <p className="mt-5 flex max-w-3xl items-start gap-2 rounded-xl border border-warning/30 bg-warning/8 p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-warning" />
              {t(tool.note)}
            </p>
          )}
        </Container>
      </section>

      <Container className="py-8">
        {!usable ? (
          <div className="mx-auto max-w-xl rounded-2xl border bg-card p-8 text-center shadow-soft">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Construction className="size-7" />
            </span>
            <h2 className="mt-5 text-xl font-semibold">{t({ ar: "هذه الأداة قيد البناء", en: "This tool is being built" })}</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {t({
                ar: `ستُفعّل في المرحلة ${tool.milestone} من الإصدار الأول، بعد بنائها والتحقق من أن ملفاتها الناتجة صحيحة. لا نعرض أدوات وهمية.`,
                en: `It will be switched on in milestone ${tool.milestone} of the first release, once it is built and its output is verified. We don't show fake tools.`,
              })}
            </p>
            <Button asChild variant="outline" className="mt-6 rounded-xl">
              <Link href="/tools/">{t({ ar: "تصفح الأدوات الأخرى", en: "Browse other tools" })}</Link>
            </Button>
          </div>
        ) : loadError ? (
          <div className="mx-auto flex max-w-xl items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
            <AlertTriangle className="size-5 shrink-0 text-destructive" />
            {t({
              ar: "تعذّر تحميل هذه الأداة. تحقق من اتصالك ثم أعد تحميل الصفحة.",
              en: "This tool failed to load. Check your connection and reload the page.",
            })}
          </div>
        ) : !loaded ? (
          // Same height as the drop zone that replaces it, so nothing below jumps (CLS).
          <div className="flex min-h-[268px] items-center justify-center sm:min-h-[300px]">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <loaded.Workspace tool={tool} module={loaded.mod} />
        )}

        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="mb-4 text-lg font-semibold">{t({ ar: "أدوات قريبة", en: "Related tools" })}</h2>
            <ToolGrid tools={related} compact />
          </section>
        )}
      </Container>
    </>
  );
}
