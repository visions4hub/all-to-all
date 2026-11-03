"use client";

import { Construction } from "lucide-react";
import { Container, PageHero } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { WorkflowPresetList } from "@/components/workflow-presets";
import { useT } from "@/lib/i18n";

export function WorkflowsContent() {
  const t = useT();
  return (
    <>
      <PageHero
        title={{ ar: "سير العمل", en: "Workflows" }}
        description={{
          ar: "اربط عدة أدوات في سلسلة واحدة، ونفّذها على ملفاتك دون تنزيل وإعادة رفع الملفات بين كل خطوة. السلاسل تُحفظ في متصفحك فقط.",
          en: "Chain several tools and run them on your files without downloading and re-adding files between steps. Chains are saved only in your browser.",
        }}
      >
        <StatusBadge status="building" className="text-xs" />
      </PageHero>
      <Container className="space-y-8 py-10">
        <div className="flex items-start gap-3 rounded-2xl border bg-card p-5">
          <Construction className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-7 text-muted-foreground">
            {t({
              ar: "منشئ سير العمل يُبنى في المرحلة 4، بعد اكتمال أدوات الصور وPDF والتحقق منها، لأنه يعتمد عليها. هذه أمثلة على السلاسل التي ستتمكن من تشغيلها:",
              en: "The workflow builder arrives in milestone 4, after the image and PDF tools are built and verified, since it runs them. These are examples of chains you'll be able to run:",
            })}
          </p>
        </div>
        <WorkflowPresetList />
      </Container>
    </>
  );
}
