"use client";

import Link from "next/link";
import { ArrowUpRight, Gift, Laptop, Scale, UserX, type LucideIcon } from "lucide-react";
import { Container, PageHero, Prose } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { useT, type Localized } from "@/lib/i18n";

type Principle = { icon: LucideIcon; tone: string; title: Localized; body: Localized };

const PRINCIPLES: Principle[] = [
  {
    icon: Gift,
    tone: "bg-brand-soft text-primary",
    title: { ar: "مجانية بالكامل", en: "Completely free" },
    body: {
      ar: "لا اشتراكات، ولا رصيد، ولا حدود استخدام يومية، ولا إعلانات. الأداة متاحة لك كما هي متاحة للجميع.",
      en: "No subscriptions, no credits, no daily quotas and no ads. Every tool is available to you exactly as it is to everyone else.",
    },
  },
  {
    icon: UserX,
    tone: "bg-brand-soft text-gold",
    title: { ar: "بلا حساب", en: "No account" },
    body: {
      ar: "لا تسجيل ولا تسجيل دخول. افتح الأداة واستخدمها مباشرة، دون أن نطلب منك بريداً أو اسماً.",
      en: "No sign-up and no login. Open a tool and use it right away — we never ask for your email or name.",
    },
  },
  {
    icon: Laptop,
    tone: "bg-brand-soft text-gold",
    title: { ar: "معالجة محلية", en: "Local processing" },
    body: {
      ar: "كل أداة تعمل داخل متصفحك. ملفاتك لا تُرفع إلى أي خادم، ولا يوجد لدينا خادم أصلاً يستقبلها.",
      en: "Every tool runs inside your browser. Your files are never uploaded — there is no server on our side to receive them.",
    },
  },
  {
    icon: Scale,
    tone: "bg-brand-soft text-primary",
    title: { ar: "صراحة في الحدود", en: "Honest about limits" },
    body: {
      ar: "نذكر ما لا تستطيع الأداة فعله، ونعرض الخطأ كما هو عند الفشل، ولا نقدّم نتيجة شكلية بدل نتيجة حقيقية.",
      en: "We state what a tool cannot do, show errors as they are when something fails, and never present a fake result.",
    },
  },
];

export function AboutContent() {
  const t = useT();

  return (
    <>
      <PageHero
        eyebrow={{ ar: "عن المنصة", en: "About" }}
        title={{ ar: "All To All — من Visions", en: "All To All — By Visions" }}
        description={{
          ar: "أدوات عملية لملفات PDF والصور، مجانية للجميع، وتعمل على جهازك دون أن تغادره ملفاتك.",
          en: "Practical PDF and image tools — free for everyone, running on your device without your files ever leaving it.",
        }}
      />

      <Container className="py-12 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <Prose>
            <h2 className="!mt-0">{t({ ar: "رسالتنا", en: "Our mission" })}</h2>
            <p>
              {t({
                ar: "كثير من المهام اليومية على الملفات بسيطة: دمج مستندين، أو تصغير صورة، أو تدوير صفحة. ومع ذلك تطلب معظم الخدمات رفع الملف إلى خوادمها، أو إنشاء حساب، أو دفع اشتراك. أردنا بديلاً أبسط وأكثر احتراماً لخصوصية الناس.",
                en: "Many everyday file tasks are simple: merging two documents, shrinking an image, rotating a page. Yet most services ask you to upload the file to their servers, create an account, or pay for a subscription. We wanted a simpler alternative that respects people's privacy.",
              })}
            </p>
            <p>
              {t({
                ar: "All To All مجموعة أدوات تعمل بالكامل داخل المتصفح باستخدام JavaScript وWebAssembly. تختار ملفك، فتجري المعالجة على جهازك، ثم تنزّل النتيجة. لا شيء يمرّ عبر خادم.",
                en: "All To All is a set of tools that run entirely in the browser using JavaScript and WebAssembly. You pick a file, the processing happens on your device, and you download the result. Nothing passes through a server.",
              })}
            </p>

            <h2>{t({ ar: "من نحن", en: "Who we are" })}</h2>
            <p>
              {t({
                ar: "Visions فريق صغير ينشر أدوات مفيدة للجميع تحت اسم «Developer Team Gods» على GitHub. هدفنا بسيط: أدوات عملية، مجانية، وتضع الخصوصية أولاً.",
                en: "Visions is a small team that publishes useful tools for everyone under the name “Developer Team Gods” on GitHub. Our goal is simple: practical tools that are free and put privacy first.",
              })}
            </p>
          </Prose>

          <div className="grid content-start gap-4 sm:grid-cols-2">
            {PRINCIPLES.map(({ icon: Icon, tone, title, body }) => (
              <div key={title.en} className="rounded-2xl border bg-card p-5 shadow-soft">
                <span className={`inline-flex size-10 items-center justify-center rounded-xl ${tone}`}>
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{t(title)}</h3>
                <p className="mt-1.5 text-sm leading-7 text-muted-foreground">{t(body)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
          <Prose className="max-w-none">
            <h2 className="!mt-0">{t({ ar: "ما الخطوة التالية؟", en: "What's next?" })}</h2>
            <p>
              {t({
                ar: "نطرح الأدوات على مراحل. كل أداة تحمل شارة «قيد البناء» حتى ننتهي من بنائها ونتحقق من صحة مخرجاتها، ولا نرفع الشارة قبل ذلك.",
                en: "We release tools in milestones. Each tool carries an “In progress” badge until it is built and its output has been verified — not before.",
              })}
            </p>
            <p>
              {t({
                ar: "بعد اكتمال المرحلة الحالية سندرس مرحلة ثانية، لكننا لن نعتمد أي إضافة إلا إذا أمكن أن تبقى مجانية وتحافظ على المبادئ نفسها. لذلك لا نَعِد اليوم بميزات محددة.",
                en: "Once the current phase is complete we will evaluate a second phase, but we will only adopt additions that can stay free and keep the same principles. That is why we are not promising specific features today.",
              })}
            </p>
          </Prose>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/help">{t({ ar: "اقرأ الدليل", en: "Read the guide" })}</Link>
            </Button>
            <Button asChild variant="outline">
              <a href="https://github.com/visions4hub" target="_blank" rel="noopener noreferrer">
                {t({ ar: "Visions على GitHub", en: "Visions on GitHub" })}
                <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden />
              </a>
            </Button>
          </div>
        </div>
      </Container>
    </>
  );
}
