"use client";

import { Container, PageHero } from "@/components/page-shell";
import { ToolDirectory } from "@/components/tool-directory";
import type { ToolCategory } from "@/lib/tools/types";

const COPY = {
  all: {
    title: { ar: "كل الأدوات", en: "All tools" },
    description: {
      ar: "أدوات PDF والصور في مكان واحد. كلها تعمل داخل متصفحك، بدون رفع ملفات وبدون تسجيل.",
      en: "PDF and image tools in one place. All run in your browser, with no uploads and no sign-up.",
    },
  },
  pdf: {
    title: { ar: "أدوات PDF", en: "PDF tools" },
    description: {
      ar: "دمج وتقسيم وترتيب وتدوير وتوقيع ملفات PDF، وتحويلها من وإلى الصور.",
      en: "Merge, split, organize, rotate and sign PDFs, and convert to and from images.",
    },
  },
  image: {
    title: { ar: "أدوات الصور", en: "Image tools" },
    description: {
      ar: "ضغط الصور وتغيير حجمها وقصها وتحويل صيغها وتعديلها، دفعة واحدة أو صورة صورة.",
      en: "Compress, resize, crop, convert and edit images, one at a time or in batches.",
    },
  },
} as const;

export function DirectoryPage({ category }: { category?: ToolCategory }) {
  const copy = COPY[category ?? "all"];
  return (
    <>
      <PageHero title={copy.title} description={copy.description} />
      <Container className="py-10">
        <ToolDirectory category={category} />
      </Container>
    </>
  );
}
