"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BrandMark, BrandWordmark } from "@/components/brand";
import { GoldSilk } from "@/components/gold-silk";
import { Container } from "@/components/page-shell";
import { useT, type Localized } from "@/lib/i18n";

type FooterLink = { href: string; label: Localized; external?: boolean };

const COLUMNS: { title: Localized; links: FooterLink[] }[] = [
  {
    title: { ar: "الأدوات", en: "Tools" },
    links: [
      { href: "/pdf/", label: { ar: "أدوات PDF", en: "PDF tools" } },
      { href: "/image/", label: { ar: "أدوات الصور", en: "Image tools" } },
      { href: "/studio/", label: { ar: "الاستوديو", en: "Studio" } },
      { href: "/workflows/", label: { ar: "سير العمل", en: "Workflows" } },
    ],
  },
  {
    title: { ar: "المنصة", en: "Platform" },
    links: [
      { href: "/about/", label: { ar: "عن المنصة", en: "About" } },
      { href: "/help/", label: { ar: "المساعدة", en: "Help" } },
      { href: "https://github.com/visions4hub", label: { ar: "GitHub", en: "GitHub" }, external: true },
    ],
  },
  {
    title: { ar: "قانوني", en: "Legal" },
    links: [
      { href: "/privacy/", label: { ar: "الخصوصية", en: "Privacy" } },
      { href: "/terms/", label: { ar: "شروط الاستخدام", en: "Terms" } },
      { href: "/third-party-notices.txt", label: { ar: "تراخيص المكتبات المفتوحة", en: "Open-source licenses" } },
    ],
  },
];

export function SiteFooter() {
  const t = useT();

  return (
    <footer className="relative mt-24 overflow-hidden border-t border-gold/15 bg-[#080706]">
      <GoldSilk corners="bottom" className="opacity-60" />
      <Container className="relative grid gap-12 pt-16 pb-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="max-w-sm">
          {/* The full lockup, as in the brand artwork: knot above the wordmark. */}
          <Link href="/" dir="ltr" className="inline-flex flex-col items-center gap-3" aria-label="All To All — By Visions">
            <BrandMark className="h-20" />
            <BrandWordmark className="h-8" />
          </Link>
          <p className="mt-5 text-sm leading-7 text-muted-foreground">
            {t({ ar: "كل ملفاتك. كل أدواتك. بمكان واحد.", en: "Every File. Every Tool. One Place." })}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/25 bg-brand-soft px-3 py-1.5 text-xs font-medium text-gold">
            <ShieldCheck className="size-4" aria-hidden />
            {t({ ar: "ملفاتك لا تغادر جهازك", en: "Your files never leave your device" })}
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-8 sm:grid-cols-3" aria-label={t({ ar: "روابط الموقع", en: "Site links" })}>
          {COLUMNS.map((col) => (
            <div key={col.title.en}>
              <h2 className="font-sans text-sm font-semibold">{t(col.title)}</h2>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-gold">
                        {t(l.label)}
                      </a>
                    ) : (
                      <Link href={l.href} className="transition-colors hover:text-gold">
                        {t(l.label)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
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
