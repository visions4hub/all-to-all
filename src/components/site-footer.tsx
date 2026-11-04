"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BrandMark, BrandWordmark } from "@/components/brand";
import { GoldSilk } from "@/components/gold-silk";
import { Container } from "@/components/page-shell";
import { useT, type Localized } from "@/lib/i18n";
import { toolsInCategory } from "@/lib/tools/registry";

const SITE_LINKS: { href: string; label: Localized }[] = [
  { href: "/about/", label: { ar: "عن المنصة", en: "About" } },
  { href: "/help/", label: { ar: "المساعدة", en: "Help" } },
  { href: "/privacy/", label: { ar: "الخصوصية", en: "Privacy" } },
  { href: "/terms/", label: { ar: "شروط الاستخدام", en: "Terms" } },
  { href: "/third-party-notices.txt", label: { ar: "تراخيص المكتبات المفتوحة", en: "Open-source licenses" } },
];

export function SiteFooter() {
  const t = useT();
  const pdf = toolsInCategory("pdf").slice(0, 6);
  const image = toolsInCategory("image").slice(0, 6);

  return (
    <footer className="relative mt-20 overflow-hidden border-t border-gold/15 bg-[#080706]">
      <GoldSilk corners="bottom" className="opacity-60" />
      <Container className="relative grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          {/* The full lockup, as in the brand artwork: knot above the wordmark. */}
          <Link href="/" dir="ltr" className="inline-flex flex-col items-center gap-3" aria-label="All To All — By Visions">
            <BrandMark className="h-20" />
            <BrandWordmark className="h-8" />
          </Link>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            {t({ ar: "كل ملفاتك. كل أدواتك. بمكان واحد.", en: "Every File. Every Tool. One Place." })}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/25 bg-brand-soft px-3 py-1.5 text-xs font-medium text-gold">
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
      <div className="relative border-t border-gold/10">
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
