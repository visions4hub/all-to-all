"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { GoldSilk } from "@/components/gold-silk";
import { Container } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export function NotFoundContent() {
  const t = useT();
  return (
    <section className="relative overflow-hidden">
      <GoldSilk />
      <Container className="relative flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
        <BrandMark className="h-28 sm:h-32" />
        <p dir="ltr" className="mt-8 font-heading text-6xl font-bold tracking-tight text-gold sm:text-7xl">
          404
        </p>
        <span className="mx-auto mt-5 block h-px w-16 bg-gold" aria-hidden />
        <h1 className="mt-6 text-2xl font-bold sm:text-3xl">{t({ ar: "هذه الصفحة غير موجودة", en: "This page doesn't exist" })}</h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          {t({
            ar: "ربما تغيّر الرابط أو كُتب بشكل خاطئ. كل الأدوات ما زالت في مكانها.",
            en: "The link may have changed or been mistyped. All the tools are still here.",
          })}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild className="h-11 rounded-xl px-6">
            <Link href="/">{t({ ar: "الصفحة الرئيسية", en: "Home" })}</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-xl border-gold/30 px-6">
            <Link href="/tools/">{t({ ar: "كل الأدوات", en: "All tools" })}</Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}
