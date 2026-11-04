"use client";

import { Container, PageHero } from "@/components/page-shell";
import { WorkflowBuilder } from "@/components/workflows/workflow-builder";

export function WorkflowsContent() {
  return (
    <>
      <PageHero
        title={{ ar: "سير العمل", en: "Workflows" }}
        description={{
          ar: "اربط عدة أدوات في سلسلة واحدة وشغّلها على ملفاتك مرة واحدة: ناتج كل خطوة يدخل إلى التالية مباشرة دون تنزيل وإعادة إضافة. كل شيء يعمل على جهازك، والسلاسل تُحفظ في متصفحك فقط.",
          en: "Chain several tools and run them on your files in one go: each step's output goes straight into the next, with no downloading and re-adding. Everything runs on your device, and chains are saved only in your browser.",
        }}
      />
      <Container className="py-8 sm:py-10">
        <WorkflowBuilder />
      </Container>
    </>
  );
}
