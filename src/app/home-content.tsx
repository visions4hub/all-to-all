"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Cpu,
  Download,
  EyeOff,
  FolderOpen,
  HardDrive,
  Package,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { BrandMark } from "@/components/brand";
import { SmartUpload } from "@/components/files/smart-upload";
import { Container } from "@/components/page-shell";
import { ToolCard, ToolGrid } from "@/components/tool-card";
import { WorkflowPresetList } from "@/components/workflow-presets";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/files/format";
import { useLocale, useT, type Localized } from "@/lib/i18n";
import { ALL_TOOLS, getToolBySlug, popularTools, toolsInCategory } from "@/lib/tools/registry";
import { useRecentTools } from "@/stores/recent-tools";

function SectionHeader({ title, description, href, linkLabel }: { title: Localized; description?: Localized; href?: string; linkLabel?: Localized }) {
  const t = useT();
  const Arrow = useLocale() === "ar" ? ArrowLeft : ArrowRight;
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div>
        <span className="mb-3 block h-px w-12 bg-gold" aria-hidden />
        <h2 className="text-2xl font-bold sm:text-3xl">{t(title)}</h2>
        {description && <p className="mt-2 max-w-2xl text-muted-foreground">{t(description)}</p>}
      </div>
      {href && linkLabel && (
        <Link href={href} className="group inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
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
    q: { ar: "لماذا بعض الأدوات «قيد البناء»؟", en: "Why are some tools “in progress”?" },
    a: {
      ar: "نفعّل الأداة فقط بعد بنائها والتحقق من أن ملفاتها الناتجة صحيحة. لا نعرض أزراراً وهمية أو نتائج مزيفة.",
      en: "A tool is switched on only after it is built and its output is verified. We don't show fake buttons or fake results.",
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

/** Fine gold contour lines behind the hero: static, flat, very low contrast. */
function HeroLines() {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full text-gold opacity-[0.16]" preserveAspectRatio="none" viewBox="0 0 1200 600" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={`a${i}`} d={`M-50 ${120 + i * 14} C 250 ${20 + i * 10}, 420 ${260 + i * 6}, 700 ${140 + i * 12} S 1100 ${40 + i * 8}, 1260 ${110 + i * 12}`} />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <path key={`b${i}`} d={`M-50 ${560 - i * 12} C 300 ${470 - i * 8}, 560 ${600 - i * 6}, 860 ${500 - i * 10} S 1150 ${430 - i * 6}, 1260 ${470 - i * 10}`} />
        ))}
      </g>
    </svg>
  );
}

export function HomeContent() {
  const t = useT();
  const locale = useLocale();
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const recentSlugs = useRecentTools((s) => s.slugs);
  const recent = recentSlugs.map(getToolBySlug).filter((x) => x !== undefined);

  return (
    <>
      {/* 1. Hero + smart upload */}
      <section className="relative overflow-hidden border-b">
        <HeroLines />
        <Container className="relative py-14 text-center sm:py-20">
          <BrandMark className="mx-auto mb-7 h-32 sm:h-40" />
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-card/70 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <ShieldCheck className="size-4 text-gold" />
            {t({ ar: "معالجة كاملة داخل متصفحك", en: "Processed entirely in your browser" })}
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl leading-[1.25] font-bold text-balance sm:text-5xl sm:leading-[1.2] lg:text-6xl">
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
          <p className="mx-auto mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
            {t({
              ar: "أدوات احترافية لتحويل وتعديل وتنظيم ملفات PDF والصور. مجاناً، بدون تسجيل، وبدون اشتراكات.",
              en: "Professional tools to convert, edit and organize PDF and image files. Free, no sign-up, no subscriptions.",
            })}
          </p>
          <div className="mx-auto mt-8 max-w-3xl">
            <SmartUpload />
          </div>
          <div className="mt-6">
            <Button asChild variant="ghost" className="h-11 rounded-xl text-base">
              <Link href="/tools/">
                {t({ ar: "استعرض جميع الأدوات", en: "Browse all tools" })}
                <Arrow />
              </Link>
            </Button>
          </div>
          <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {[
              { ar: "بدون تسجيل", en: "No sign-up" },
              { ar: "بدون رفع ملفات", en: "No uploads" },
              { ar: "بدون إعلانات", en: "No ads" },
              { ar: "بدون حدود يومية", en: "No daily limits" },
            ].map((x) => (
              <li key={x.en} className="flex items-center gap-1.5">
                <span className="size-1.5 rotate-45 bg-gold" />
                {t(x)}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {recent.length > 0 && (
        <Container className="pt-12">
          <SectionHeader title={{ ar: "استخدمتها مؤخراً", en: "Recently used" }} />
          <ToolGrid tools={recent} compact />
        </Container>
      )}

      {/* 2. Popular */}
      <Container className="pt-16">
        <SectionHeader
          title={{ ar: "الأدوات الأكثر استخداماً", en: "Popular tools" }}
          href="/tools/"
          linkLabel={{ ar: `كل الأدوات (${formatNumber(ALL_TOOLS.length)})`, en: `All tools (${formatNumber(ALL_TOOLS.length)})` }}
        />
        <ToolGrid tools={popularTools()} />
      </Container>

      {/* 3 + 4. PDF and image tools */}
      <Container className="grid gap-12 pt-20 lg:grid-cols-2 lg:gap-8">
        {(["pdf", "image"] as const).map((cat) => (
          <div key={cat}>
            <SectionHeader
              title={cat === "pdf" ? { ar: "أدوات PDF", en: "PDF tools" } : { ar: "أدوات الصور", en: "Image tools" }}
              href={cat === "pdf" ? "/pdf/" : "/image/"}
              linkLabel={{ ar: "عرض الكل", en: "View all" }}
            />
            <div className="grid grid-cols-2 gap-3">
              {toolsInCategory(cat)
                .slice(0, 8)
                .map((tool) => (
                  <ToolCard key={tool.id} tool={tool} compact />
                ))}
            </div>
          </div>
        ))}
      </Container>

      {/* 5. Directory */}
      <Container className="pt-20">
        <SectionHeader title={{ ar: "دليل الأدوات", en: "Tool directory" }} />
        <div className="grid gap-x-8 gap-y-2 rounded-2xl border bg-card p-6 sm:grid-cols-2 lg:grid-cols-4">
          {ALL_TOOLS.map((tool) => (
            <p key={tool.id} className="flex items-center gap-2 text-sm">
              <span className="size-1.5 rotate-45 bg-gold" />
              <span className={tool.status === "operational" || tool.status === "beta" ? "" : "text-muted-foreground"}>{t(tool.name)}</span>
            </p>
          ))}
        </div>
      </Container>

      {/* 6. Workflow presets */}
      <Container className="pt-20">
        <SectionHeader
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

      {/* 7. How it works */}
      <Container className="pt-20">
        <SectionHeader title={{ ar: "كيف تعمل؟", en: "How it works" }} />
        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: FolderOpen, title: { ar: "اختر ملفاتك", en: "Choose your files" }, text: { ar: "اسحبها أو اخترها أو الصقها. نتعرف على نوعها الحقيقي تلقائياً.", en: "Drag, pick or paste them. We detect their real type automatically." } },
            { icon: SlidersHorizontal, title: { ar: "اضبط الإعدادات", en: "Adjust settings" }, text: { ar: "اختر ما تريد مع معاينة مباشرة قبل التنفيذ.", en: "Pick what you want with a live preview first." } },
            { icon: Download, title: { ar: "نزّل النتيجة", en: "Download the result" }, text: { ar: "ملف واحد أو ZIP لكل الملفات، ناتج حقيقي جاهز فوراً.", en: "One file or a ZIP of all, a real result right away." } },
          ].map((step, i) => (
            <li key={i} className="relative rounded-2xl border bg-card p-6">
              <span className="absolute end-5 top-5 font-heading text-4xl font-bold text-muted/80 dark:text-muted" dir="ltr">
                {i + 1}
              </span>
              <step.icon className="size-6 text-primary" />
              <h3 className="mt-4 font-semibold">{t(step.title)}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t(step.text)}</p>
            </li>
          ))}
        </ol>
      </Container>

      {/* 8. Privacy */}
      <Container className="pt-20">
        <div className="overflow-hidden rounded-3xl border bg-card">
          <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-gold ring-1 ring-gold/20 ring-inset">
                <ShieldCheck className="size-6" />
              </span>
              <h2 className="mt-5 text-2xl font-bold sm:text-3xl">{t({ ar: "ملفاتك لا تغادر جهازك", en: "Your files never leave your device" })}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                {t({
                  ar: "كل أداة هنا تعمل داخل متصفحك باستخدام JavaScript وWebAssembly. لا خوادم معالجة، ولا تخزين، ولا أحد غيرك يرى ملفاتك.",
                  en: "Every tool here runs inside your browser with JavaScript and WebAssembly. No processing servers, no storage, and nobody but you sees your files.",
                })}
              </p>
              <Link href="/privacy/" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                {t({ ar: "اقرأ سياسة الخصوصية", en: "Read the privacy policy" })}
                <Arrow className="size-4" />
              </Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: Cpu, text: { ar: "المعالجة على جهازك فقط", en: "Processing on your device only" } },
                { icon: Ban, text: { ar: "بدون حسابات أو تسجيل", en: "No accounts or sign-in" } },
                { icon: EyeOff, text: { ar: "بدون أدوات تتبع أو إعلانات", en: "No trackers or ads" } },
                { icon: HardDrive, text: { ar: "لا تخزين لملفاتك في أي مكان", en: "Your files aren't stored anywhere" } },
                { icon: Package, text: { ar: "كل المكتبات مضمّنة في الموقع", en: "All libraries bundled with the site" } },
                { icon: Sparkles, text: { ar: "نتائج حقيقية، بدون محاكاة", en: "Real results, never simulated" } },
              ].map((x) => (
                <li key={x.text.en} className="flex items-center gap-3 rounded-xl bg-muted/60 p-3 text-sm font-medium">
                  <x.icon className="size-5 shrink-0 text-gold" />
                  {t(x.text)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>

      {/* 9. FAQ */}
      <Container className="pt-20">
        <SectionHeader title={{ ar: "أسئلة شائعة", en: "Frequently asked questions" }} />
        <div className="divide-y rounded-2xl border bg-card">
          {FAQ.map((item) => (
            <details key={item.q.en} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {t(item.q)}
                <span className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-7 text-muted-foreground">{t(item.a)}</p>
            </details>
          ))}
        </div>
      </Container>
    </>
  );
}
