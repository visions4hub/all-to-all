"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Container } from "@/components/page-shell";
import { useT, type Localized } from "@/lib/i18n";
import { toolsInCategory } from "@/lib/tools/registry";

const SITE_LINKS: { href: string; label: Localized }[] = [
  { href: "/about/", label: { ar: "عن المنصة", en: "About" } },
  { href: "/help/", label: { ar: "المساعدة", en: "Help" } },
  { href: "/privacy/", label: { ar: "الخصوصية", en: "Privacy" } },
  { href: "/terms/", label: { ar: "شروط الاستخدام", en: "Terms" } },
];

export function SiteFooter() {
  const t = useT();
  const pdf = toolsInCategory("pdf").slice(0, 6);
  const image = toolsInCategory("image").slice(0, 6);

  return (
    <footer className="mt-20 border-t bg-card/50">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <BrandLogo />
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            {t({ ar: "كل ملفاتك. كل أدواتك. بمكان واحد.", en: "Every File. Every Tool. One Place." })}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-teal-soft px-3 py-1.5 text-xs font-medium text-teal">
            <ShieldCheck className="size-4" aria-hidden />
            {t({ ar: "ملفاتك لا تغادر جهازك", en: "Your files never leave your device" })}
          </p>
        </div>
        <FooterColumn
          title={{ ar: "أدوات PDF", en: "PDF tools" }}
          links={pdf.map((x) => ({ href: "/pdf/", label: x.name }))}
          more={{ href: "/pdf/", label: { ar: "كل أدوات PDF", en: "All PDF tools" } }}
        />
        <FooterColumn
          title={{ ar: "أدوات الصور", en: "Image tools" }}
          links={image.map((x) => ({ href: "/image/", label: x.name }))}
          more={{ href: "/image/", label: { ar: "كل أدوات الصور", en: "All image tools" } }}
        />
        <FooterColumn title={{ ar: "المنصة", en: "Platform" }} links={SITE_LINKS} />
      </Container>
      <div className="border-t">
        <Container className="flex flex-col items-center justify-between gap-2 py-5 text-xs text-muted-foreground sm:flex-row">
          <p>
            © <span dir="ltr">2026</span> All To All · By Visions
          </p>
          <p>{t({ ar: "مجاني. بدون تسجيل. بدون إعلانات.", en: "Free. No sign-up. No ads." })}</p>
        </Container>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
  more,
}: {
  title: Localized;
  links: { href: string; label: Localized }[];
  more?: { href: string; label: Localized };
}) {
  const t = useT();
  return (
    <div>
      <h2 className="text-sm font-semibold">{t(title)}</h2>
      <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
        {links.map((l, i) => (
          <li key={`${l.href}-${i}`}>
            <Link href={l.href} className="transition-colors hover:text-foreground">
              {t(l.label)}
            </Link>
          </li>
        ))}
        {more && (
          <li>
            <Link href={more.href} className="font-medium text-primary hover:underline">
              {t(more.label)}
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}
