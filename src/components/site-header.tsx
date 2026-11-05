"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { ToolSearchButton } from "@/components/tool-search";
import { Container } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePrefs, useT, type Localized } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const NAV_LINKS: { href: string; label: Localized }[] = [
  { href: "/tools/", label: { ar: "كل الأدوات", en: "All tools" } },
  { href: "/pdf/", label: { ar: "أدوات PDF", en: "PDF tools" } },
  { href: "/image/", label: { ar: "أدوات الصور", en: "Image tools" } },
  { href: "/studio/", label: { ar: "الاستوديو", en: "Studio" } },
  { href: "/workflows/", label: { ar: "سير العمل", en: "Workflows" } },
  { href: "/help/", label: { ar: "المساعدة", en: "Help" } },
];

function isActive(pathname: string, href: string) {
  const clean = (p: string) => p.replace(/\/+$/, "") || "/";
  return clean(pathname) === clean(href);
}

export function LanguageToggle({ className }: { className?: string }) {
  const locale = usePrefs((s) => s.locale);
  const setLocale = usePrefs((s) => s.setLocale);
  const next = locale === "ar" ? "en" : "ar";
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("h-9 rounded-xl px-3 font-semibold", className)}
      onClick={() => setLocale(next)}
      aria-label={next === "en" ? "Switch to English" : "التبديل إلى العربية"}
      lang={next}
    >
      {next === "en" ? "EN" : "عربي"}
    </Button>
  );
}

export function SiteHeader() {
  const t = useT();
  const pathname = usePathname();
  const locale = usePrefs((s) => s.locale);
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <Container className="flex h-[72px] items-center gap-3">
        <BrandLogo />
        <nav className="ms-6 hidden items-center gap-1 lg:flex" aria-label={t({ ar: "التنقل الرئيسي", en: "Main" })}>
          {NAV_LINKS.slice(0, 5).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-2 text-[15px] font-medium text-foreground/70 transition-colors hover:text-foreground",
                isActive(pathname, link.href) && "text-gold hover:text-gold",
              )}
            >
              {t(link.label)}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1.5">
          <ToolSearchButton />
          <LanguageToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 rounded-xl lg:hidden" aria-label={t({ ar: "القائمة", en: "Menu" })}>
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={locale === "ar" ? "right" : "left"} className="w-[82%] max-w-xs p-0">
              <SheetTitle className="sr-only">{t({ ar: "القائمة", en: "Menu" })}</SheetTitle>
              <div className="border-b p-5">
                <BrandLogo />
              </div>
              <nav className="flex flex-col p-3">
                {[{ href: "/", label: { ar: "الرئيسية", en: "Home" } }, ...NAV_LINKS].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "rounded-xl px-4 py-3 text-[15px] font-medium",
                      isActive(pathname, link.href) ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                  >
                    {t(link.label)}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </Container>
    </header>
  );
}
