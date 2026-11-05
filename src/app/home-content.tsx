"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Lock, ShieldCheck } from "lucide-react";
import { GoldSilk } from "@/components/gold-silk";
import { SmartUpload } from "@/components/files/smart-upload";
import { Container } from "@/components/page-shell";
import { ToolGrid } from "@/components/tool-card";
import { WorkflowPresetList } from "@/components/workflow-presets";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/files/format";
import { useLocale, useT, type Localized } from "@/lib/i18n";
import { ALL_TOOLS, getToolBySlug, popularTools, toolsInCategory } from "@/lib/tools/registry";
import { useRecentTools } from "@/stores/recent-tools";

function SectionHeader({
  eyebrow,
  title,
  description,
  href,
  linkLabel,
}: {
  eyebrow?: Localized;
  title: Localized;
  description?: Localized;
  href?: string;
  linkLabel?: Localized;
}) {
  const t = useT();
  const Arrow = useLocale() === "ar" ? ArrowLeft : ArrowRight;
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 text-sm font-semibold text-gold">{t(eyebrow)}</p>}
        <h2 className="text-3xl font-bold sm:text-4xl">{t(title)}</h2>
        {description && <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">{t(description)}</p>}
      </div>
      {href && linkLabel && (
        <Link href={href} className="inline-flex items-center gap-1 text-[15px] font-semibold text-primary hover:underline">
          {t(linkLabel)}
          <Arrow className="size-4" />
        </Link>
      )}
    </div>
  );
}

const FAQ: { q: Localized; a: Localized }[] = [
  {
    q: { ar: "هل المنصة مجانية فعلاً؟", en: "Is it really free?" },
    a: {
      ar: "نعم. لا اشتراكات ولا رصيد ولا حدود يومية لعدد الملفات. الحدود الوحيدة هي إمكانيات جهازك نفسه، مثل الذاكرة وسرعة المعالج.",
      en: "Yes. No subscriptions, credits or daily file limits. The only limits are your own device's, such as memory and processor speed.",
    },
  },
  {
    q: { ar: "هل تُرفع ملفاتي إلى خادم؟", en: "Are my files uploaded to a server?" },
    a: {
      ar: "لا. كل المعالجة تتم داخل متصفحك على جهازك. يمكنك التأكد بنفسك من تبويب Network في أدوات المطوّر: لا يُرسل أي ملف أثناء المعالجة.",
      en: "No. All processing happens inside your browser on your device. You can check in the browser's developer tools (Network tab): no file is sent while processing.",
    },
  },
  {
    q: { ar: "هل أحتاج إلى إنشاء حساب؟", en: "Do I need an account?" },
    a: {
      ar: "لا يوجد تسجيل دخول ولا حسابات إطلاقاً. افتح الأداة واستخدمها مباشرة.",
      en: "There is no sign-in and no accounts at all. Open a tool and use it.",
    },
  },
  {
    q: { ar: "ما حجم الملفات التي أستطيع معالجتها؟", en: "How large can my files be?" },
    a: {
      ar: "لا نضع حداً مصطنعاً. الملفات الكبيرة جداً قد تفشل على الهواتف بسبب الذاكرة، وعندها نخبرك بالسبب بوضوح بدل أن نُخرج ملفاً ناقصاً.",
      en: "We set no artificial limit. Very large files may fail on phones because of memory, and if that happens we tell you clearly instead of producing a broken file.",
    },
  },
  {
    q: { ar: "هل تعمل على الهاتف؟", en: "Does it work on phones?" },
    a: {
      ar: "نعم. الواجهة مصممة للهاتف أولاً، مع اختيار الصور من المعرض أو الكاميرا ومشاركة الملفات الناتجة مباشرة.",
      en: "Yes. The interface is designed for phones first, with picking from the gallery or camera and sharing results directly.",
    },
  },
];

const TRUST: Localized[] = [
  { ar: "بدون تسجيل", en: "No sign-up" },
  { ar: "بدون رفع ملفات", en: "No uploads" },
  { ar: "بدون إعلانات", en: "No ads" },
  { ar: "بدون حدود يومية", en: "No daily limits" },
];

const STEPS: { title: Localized; text: Localized }[] = [
  { title: { ar: "اختر ملفاتك", en: "Choose your files" }, text: { ar: "اسحبها أو اخترها أو الصقها. نتعرف على نوعها الحقيقي تلقائياً.", en: "Drag, pick or paste them. We detect their real type automatically." } },
  { title: { ar: "اضبط الإعدادات", en: "Adjust settings" }, text: { ar: "اختر ما تريد مع معاينة مباشرة قبل التنفيذ.", en: "Pick what you want with a live preview first." } },
  { title: { ar: "نزّل النتيجة", en: "Download the result" }, text: { ar: "ملف واحد أو ZIP لكل الملفات، ناتج حقيقي جاهز فوراً.", en: "One file or a ZIP of all, a real result right away." } },
];

const PRIVACY: Localized[] = [
  { ar: "المعالجة على جهازك فقط", en: "Processing on your device only" },
  { ar: "بدون حسابات أو تسجيل", en: "No accounts or sign-in" },
  { ar: "بدون أدوات تتبع أو إعلانات", en: "No trackers or ads" },
  { ar: "لا تخزين لملفاتك في أي مكان", en: "Your files aren't stored anywhere" },
  { ar: "كل المكتبات مضمّنة في الموقع", en: "All libraries bundled with the site" },
  { ar: "نتائج حقيقية، بدون محاكاة", en: "Real results, never simulated" },
];

/** Opens the hero's file picker (the gallery input, not the camera one). */
function openHeroPicker() {
  document.querySelector<HTMLInputElement>('#hero-upload input[type="file"]:not([capture])')?.click();
}

export function HomeContent() {
  const t = useT();
  const locale = useLocale();
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const recentSlugs = useRecentTools((s) => s.slugs);
  const recent = recentSlugs.map(getToolBySlug).filter((x) => x !== undefined);
  const total = formatNumber(ALL_TOOLS.length);

  return (
    <>
      {/* 1. Hero: message on one side, the smart upload on the other */}
      <section className="relative overflow-hidden border-b">
        <GoldSilk corners="top" />
        <Container className="relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14">
          <div className="min-w-0 text-center lg:text-start">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-card/70 px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground backdrop-blur">
              <ShieldCheck className="size-4 text-gold" />
              {t({ ar: "معالجة كاملة داخل متصفحك", en: "Processed entirely in your browser" })}
            </p>
            <h1 className="text-4xl leading-[1.5] font-bold text-balance sm:text-5xl lg:text-[3.6rem] lg:leading-[1.45]">
              {locale === "ar" ? (
                <>
                  <span className="inline-block">كل ملفاتك.</span> <span className="inline-block">كل أدواتك.</span>{" "}
                  <span className="inline-block text-gold">بمكان واحد.</span>
                </>
              ) : (
                <>
                  <span className="inline-block">Every File.</span> <span className="inline-block">Every Tool.</span>{" "}
                  <span className="inline-block text-gold">One Place.</span>
                </>
              )}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-pretty text-muted-foreground lg:mx-0">
              {t({
                ar: "أدوات احترافية لتحويل وتعديل وتنظيم ملفات PDF والصور. مجاناً، بدون تسجيل، وبدون اشتراكات.",
                en: "Professional tools to convert, edit and organize PDF and image files. Free, no sign-up, no subscriptions.",
              })}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Button className="h-12 rounded-xl px-6 text-base" onClick={openHeroPicker}>
                {t({ ar: "اختر ملفاتك", en: "Choose your files" })}
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-xl border-gold/25 px-6 text-base">
                <Link href="/tools/">
                  {t({ ar: "استعرض جميع الأدوات", en: "Browse all tools" })} <span dir="ltr">({total})</span>
                </Link>
              </Button>
            </div>
            <dl className="mx-auto mt-11 grid max-w-xl grid-cols-3 border-t pt-6 lg:mx-0">
              {[
                { label: { ar: "أداة جاهزة", en: "Ready tools" }, value: total, ltr: true },
                { label: { ar: "ملف يُرفع لخادم", en: "Files sent to a server" }, value: "0", ltr: true },
                { label: { ar: "السعر", en: "Price" }, value: t({ ar: "مجاني", en: "Free" }), gold: true },
              ].map((x, i) => (
                <div key={i} className={i > 0 ? "border-s ps-4 sm:ps-6" : "pe-4 sm:pe-6"}>
                  <dt className="text-[13px] text-muted-foreground">{t(x.label)}</dt>
                  {/* Only the number is isolated as LTR, so it still sits at the cell's start like its label. */}
                  <dd className={`mt-0.5 font-heading text-3xl font-bold ${x.gold ? "text-gold" : ""}`}>
                    {x.ltr ? <span dir="ltr">{x.value}</span> : x.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div id="hero-upload" className="min-w-0 rounded-[1.6rem] border border-gold/35 bg-gradient-to-b from-card to-[#0e0c09] p-2.5 shadow-lift">
            <SmartUpload />
            <p className="flex items-center gap-2.5 px-3 pt-3.5 pb-1.5 text-start text-[13px] text-muted-foreground">
              <Lock className="size-4 shrink-0 text-gold" />
              {t({
                ar: "نتعرّف على نوع الملف ونقترح الأدوات المناسبة. لا شيء يغادر جهازك.",
                en: "We detect the file type and suggest the right tools. Nothing leaves your device.",
              })}
            </p>
          </div>
        </Container>
      </section>

      {/* 2. Trust strip */}
      <div className="border-b bg-[#0d0c09]">
        <Container>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-3 py-5 sm:grid-cols-4">
            {TRUST.map((x) => (
              <li key={x.en} className="flex items-center gap-3 text-[15px] font-medium text-foreground/85">
                <span className="size-[7px] shrink-0 rotate-45 bg-primary" aria-hidden />
                {t(x)}
              </li>
            ))}
          </ul>
        </Container>
      </div>

      {recent.length > 0 && (
        <Container className="pt-16">
          <SectionHeader title={{ ar: "استخدمتها مؤخراً", en: "Recently used" }} />
          <ToolGrid tools={recent} compact />
        </Container>
      )}

      {/* 3. Popular */}
      <Container className="pt-20 sm:pt-24">
        <SectionHeader
          eyebrow={{ ar: "الأكثر استخداماً", en: "Most used" }}
          title={{ ar: "ابدأ من هنا", en: "Start here" }}
          href="/tools/"
          linkLabel={{ ar: `كل الأدوات (${total})`, en: `All tools (${total})` }}
        />
        <ToolGrid tools={popularTools()} />
      </Container>

      {/* 4. Every tool, by category */}
      <Container className="grid gap-6 pt-20 sm:pt-24 lg:grid-cols-2">
        {(["pdf", "image"] as const).map((cat) => {
          const tools = toolsInCategory(cat);
          return (
            <div key={cat} className="min-w-0 rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
              <div className="mb-2 flex items-baseline justify-between gap-3 border-b pb-4">
                <h2 className="text-2xl font-bold sm:text-3xl">
                  <Link href={cat === "pdf" ? "/pdf/" : "/image/"} className="hover:text-gold">
                    {cat === "pdf" ? t({ ar: "أدوات PDF", en: "PDF tools" }) : t({ ar: "أدوات الصور", en: "Image tools" })}
                  </Link>
                </h2>
                <span className="text-sm text-muted-foreground" dir="ltr">
                  {formatNumber(tools.length)}
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-x-6 min-[420px]:grid-cols-2">
                {tools.map((tool) => (
                  <li key={tool.id} className="min-w-0 border-b border-border/60">
                    <Link
                      href={`/tools/${tool.slug}/`}
                      className="flex items-center gap-2.5 py-3 text-[15px] text-foreground/85 transition-colors hover:text-gold"
                    >
                      <span className="size-[5px] shrink-0 rotate-45 bg-primary" aria-hidden />
                      <span className="truncate">{t(tool.name)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </Container>

      {/* 5. Workflow presets */}
      <Container className="pt-20 sm:pt-24">
        <SectionHeader
          eyebrow={{ ar: "أدوات متسلسلة", en: "Chained tools" }}
          title={{ ar: "سير عمل جاهز", en: "Workflow presets" }}
          description={{
            ar: "سلاسل أدوات تعمل خطوة بعد خطوة على ملفاتك، دون تنزيل وإعادة إضافة الملفات بين كل أداة. اختر قالباً لفتحه جاهزاً في منشئ سير العمل.",
            en: "Tool chains that run step by step on your files, without re-adding files between tools. Pick one to open it ready in the workflow builder.",
          }}
          href="/workflows/"
          linkLabel={{ ar: "أنشئ سير عملك", en: "Build your own" }}
        />
        <WorkflowPresetList />
      </Container>

      {/* 6. How it works */}
      <Container className="pt-20 sm:pt-24">
        <SectionHeader eyebrow={{ ar: "ثلاث خطوات", en: "Three steps" }} title={{ ar: "كيف تعمل؟", en: "How it works" }} />
        <ol className="grid overflow-hidden rounded-2xl border bg-border sm:grid-cols-3" style={{ gap: 1 }}>
          {STEPS.map((step, i) => (
            <li key={i} className="bg-card p-7 sm:p-8">
              <span className="block font-heading text-5xl leading-none font-bold text-gold" dir="ltr">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-6 text-lg font-semibold">{t(step.title)}</h3>
              <p className="mt-2 text-[15px] leading-7 text-muted-foreground">{t(step.text)}</p>
            </li>
          ))}
        </ol>
      </Container>

      {/* 7. Privacy */}
      <Container className="pt-20 sm:pt-24">
        <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-[radial-gradient(120%_140%_at_100%_0%,#1c180f_0%,#0e0c09_60%)]">
          <div className="grid gap-10 p-6 sm:p-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
            <div className="min-w-0">
              <span className="inline-flex size-13 items-center justify-center rounded-2xl bg-brand-soft text-gold ring-1 ring-gold/25 ring-inset">
                <ShieldCheck className="size-6" />
              </span>
              <h2 className="mt-5 text-3xl font-bold sm:text-4xl">{t({ ar: "ملفاتك لا تغادر جهازك", en: "Your files never leave your device" })}</h2>
              <p className="mt-3 leading-8 text-muted-foreground">
                {t({
                  ar: "كل أداة هنا تعمل داخل متصفحك باستخدام JavaScript وWebAssembly. لا خوادم معالجة، ولا تخزين، ولا أحد غيرك يرى ملفاتك.",
                  en: "Every tool here runs inside your browser with JavaScript and WebAssembly. No processing servers, no storage, and nobody but you sees your files.",
                })}
              </p>
              <Link href="/privacy/" className="mt-5 inline-flex items-center gap-1 text-[15px] font-semibold text-primary hover:underline">
                {t({ ar: "اقرأ سياسة الخصوصية", en: "Read the privacy policy" })}
                <Arrow className="size-4" />
              </Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {PRIVACY.map((x) => (
                <li key={x.en} className="flex items-center gap-3 rounded-xl border bg-background/60 p-4 text-[15px] font-medium">
                  <Check className="size-[18px] shrink-0 text-gold" strokeWidth={2.2} />
                  {t(x)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>

      {/* 8. FAQ */}
      <Container className="grid gap-10 pt-20 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <p className="mb-1.5 text-sm font-semibold text-gold">{t({ ar: "قبل أن تبدأ", en: "Before you start" })}</p>
          <h2 className="text-3xl font-bold sm:text-4xl">{t({ ar: "أسئلة شائعة", en: "Frequently asked questions" })}</h2>
          <p className="mt-3 max-w-sm leading-8 text-muted-foreground">
            {t({ ar: "أجوبة مباشرة عن الخصوصية والحدود وطريقة العمل.", en: "Straight answers about privacy, limits and how it works." })}
          </p>
        </div>
        <div className="min-w-0 border-t">
          {FAQ.map((item) => (
            <details key={item.q.en} className="group border-b py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold">
                {t(item.q)}
                <span className="text-2xl leading-none text-gold transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 leading-8 text-muted-foreground">{t(item.a)}</p>
            </details>
          ))}
        </div>
      </Container>
    </>
  );
}
