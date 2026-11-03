"use client";

import { ChevronDown } from "lucide-react";
import { PageHero } from "@/components/page-shell";
import { useT, type Localized } from "@/lib/i18n";
import { DocLayout, DocSectionBlock, Note, type DocSection } from "./_components/doc-layout";

const S = {
  how: { id: "how-it-works", title: { ar: "كيف تعمل الأدوات", en: "How the tools work" } },
  formats: { id: "formats", title: { ar: "الصيغ المدعومة", en: "Supported formats" } },
  limits: { id: "device-limits", title: { ar: "حدود الجهاز ونصائح", en: "Device limits & tips" } },
  notes: { id: "tool-limitations", title: { ar: "ما يجب معرفته عن بعض الأدوات", en: "What to know about some tools" } },
  trouble: { id: "troubleshooting", title: { ar: "حل المشكلات", en: "Troubleshooting" } },
  keys: { id: "keyboard", title: { ar: "اللصق ولوحة المفاتيح", en: "Paste & keyboard" } },
  faq: { id: "faq", title: { ar: "الأسئلة الشائعة", en: "FAQ" } },
} satisfies Record<string, DocSection>;

type Pair = { q: Localized; a: Localized; href?: string };

const LIMITATIONS: Pair[] = [
  {
    q: { ar: "قص PDF يُخفي المحتوى ولا يحذفه", en: "PDF crop hides content — it does not delete it" },
    a: {
      ar: "القص يغيّر المنطقة الظاهرة من الصفحة فقط. النصوص والصور خارج حدود القص تبقى موجودة داخل الملف ويمكن استرجاعها ببرامج أخرى. لا تستخدم القص لإزالة معلومات حساسة.",
      en: "Cropping only changes the visible area of a page. Text and images outside the crop box remain inside the file and can be recovered with other software. Do not use crop to remove sensitive information.",
    },
  },
  {
    q: { ar: "التوقيع المرئي ليس توقيعاً رقمياً معتمداً", en: "A visual signature is not a certified digital signature" },
    a: {
      ar: "أداة التوقيع تضع صورة توقيعك أو نصه على الصفحة. هذا ليس توقيعاً رقمياً مشفّراً، ولا يثبت هوية الموقّع، ولا يمنع تعديل الملف لاحقاً. إذا كانت الجهة تطلب توقيعاً رقمياً معتمداً فستحتاج إلى خدمة مخصصة لذلك.",
      en: "The signature tool places an image or text of your signature on the page. It is not a cryptographic digital signature: it does not prove the signer's identity and does not prevent later changes. If an organisation requires a certified digital signature, you will need a dedicated service.",
    },
  },
  {
    q: { ar: "ملفات PDF الممسوحة ضوئياً لا تحتوي نصاً قابلاً للاستخراج", en: "Scanned PDFs have no extractable text" },
    a: {
      ar: "الصفحة الممسوحة ضوئياً هي صورة، لا نص. استخراجها يتطلب تقنية التعرّف الضوئي على الحروف (OCR)، وهي غير متوفرة في هذا الإصدار، لذلك قد تُرجع أداة استخراج النص نتيجة فارغة.",
      en: "A scanned page is an image, not text. Getting text out of it requires optical character recognition (OCR), which is not part of this release, so Extract Text may return an empty result.",
    },
  },
  {
    q: { ar: "التمويه ليس إخفاءً آمناً", en: "Blur is not secure redaction" },
    a: {
      ar: "التمويه أو التقطيع إلى مربعات يصعّب القراءة بالعين، لكنه لا يضمن استحالة الاسترجاع، خاصة مع الشدة المنخفضة. لإخفاء معلومات حساسة غطِّها بالكامل بلون مصمت.",
      en: "Blurring or pixelating makes content hard to read by eye, but does not guarantee it cannot be recovered, especially at low strength. To hide sensitive information, cover it completely with a solid colour.",
    },
  },
  {
    q: { ar: "نسبة ضغط PDF تعتمد على الملف", en: "PDF compression savings depend on the file" },
    a: {
      ar: "بعض الملفات مضغوطة أصلاً، فقد يكون التوفير صغيراً أو معدوماً. سنعرض لك الحجم قبل وبعد بصدق، ولن نقدّم ملفاً أكبر على أنه «مضغوط».",
      en: "Some files are already well compressed, so the saving may be small or zero. We show the size before and after honestly and will never present a larger file as “compressed”.",
    },
  },
  {
    q: { ar: "«تعديل PDF» يضيف فوق الصفحة ولا يعيد كتابة النص", en: "“Edit PDF” adds on top — it does not rewrite text" },
    a: {
      ar: "يمكنك إضافة نصوص وأشكال وتعليقات فوق الصفحة، لكن الأداة لا تعدّل النص الأصلي المكتوب في الملف.",
      en: "You can add text, shapes and annotations on top of a page, but the tool does not modify the original text inside the file.",
    },
  },
];

const TROUBLE: Pair[] = [
  {
    q: { ar: "ملف PDF تالف أو لا يُفتح", en: "Damaged PDF or it won't open" },
    a: {
      ar: "إذا كان الملف تالفاً أو غير مكتمل التنزيل فقد تعجز الأداة عن قراءته وتعرض رسالة خطأ. جرّب فتحه في قارئ PDF آخر، أو أعد تنزيله من مصدره، ثم حاول مجدداً.",
      en: "If a file is damaged or was not fully downloaded, the tool may be unable to read it and will show an error. Try opening it in another PDF reader or download it again from its source, then retry.",
    },
  },
  {
    q: { ar: "ملف PDF محمي بكلمة مرور", en: "Password-protected PDF" },
    a: {
      ar: "الملفات المشفّرة قد لا تُعالَج. افتح الملف في برنامج تملك صلاحيته، واحفظ نسخة غير محمية، ثم استخدمها هنا. لا تحاول تجاوز حماية ملف لا تملك حق فتحه.",
      en: "Encrypted files may not be processed. Open the file in software you are authorised to use, save an unprotected copy, and use that here. Do not try to bypass protection on a file you have no right to open.",
    },
  },
  {
    q: { ar: "صيغة غير مدعومة (مثل HEIC)", en: "Unsupported format (such as HEIC)" },
    a: {
      ar: "صور HEIC الخاصة بأجهزة iPhone غير مدعومة حالياً. حوّلها إلى JPG من إعدادات الكاميرا أو تطبيق الصور ثم أعد المحاولة. عموماً، تعتمد الصيغ المقروءة على ما يستطيع متصفحك فك ترميزه.",
      en: "HEIC photos from iPhones are not supported yet. Convert them to JPG from your camera settings or Photos app and try again. In general, readable formats depend on what your browser can decode.",
    },
  },
  {
    q: { ar: "خطأ في الذاكرة أو توقّف الصفحة", en: "Memory error or the page freezes" },
    a: {
      ar: "هذا يعني أن الجهاز وصل إلى حدّ ذاكرته. أغلق التبويبات الأخرى، وعالج ملفات أقل في كل مرة، أو قسّم الملف الكبير، أو استخدم جهاز حاسوب بدل الهاتف.",
      en: "This means the device has reached its memory limit. Close other tabs, process fewer files at a time, split a large file, or use a computer instead of a phone.",
    },
  },
  {
    q: { ar: "لم يبدأ التنزيل", en: "The download didn't start" },
    a: {
      ar: "بعض المتصفحات تحظر التنزيلات المتعددة أو تطلب إذناً. تحقّق من شريط العنوان أو إعدادات التنزيل، أو نزّل النتائج معاً كملف ZIP.",
      en: "Some browsers block multiple downloads or ask for permission. Check the address bar or download settings, or download all results together as a ZIP.",
    },
  },
];

const FAQ: Pair[] = [
  {
    q: { ar: "هل تُرفع ملفاتي إلى خادم؟", en: "Are my files uploaded to a server?" },
    a: {
      ar: "لا. كل المعالجة تجري داخل متصفحك، ولا يوجد خادم لدينا يستقبل الملفات.",
      en: "No. All processing happens inside your browser, and we have no server that receives files.",
    },
  },
  {
    q: { ar: "هل الخدمة مجانية فعلاً؟", en: "Is it really free?" },
    a: {
      ar: "نعم. لا اشتراكات ولا رصيد ولا حدود استخدام ولا إعلانات. الحدود الوحيدة هي حدود جهازك.",
      en: "Yes. No subscriptions, credits, quotas or ads. The only limits are those of your device.",
    },
  },
  {
    q: { ar: "هل أحتاج إلى حساب؟", en: "Do I need an account?" },
    a: {
      ar: "لا. لا يوجد تسجيل ولا تسجيل دخول.",
      en: "No. There is no sign-up and no login.",
    },
  },
  {
    q: { ar: "هل تعمل الأدوات دون إنترنت؟", en: "Do the tools work offline?" },
    a: {
      ar: "تحتاج إلى الاتصال لتحميل الصفحة أول مرة. بعد تحميل الأداة تجري المعالجة نفسها على جهازك دون إرسال ملفاتك إلى أي مكان.",
      en: "You need a connection to load the page. Once a tool has loaded, the processing itself runs on your device without sending your files anywhere.",
    },
  },
  {
    q: { ar: "ما معنى شارة «قيد البناء»؟", en: "What does the “In progress” badge mean?" },
    a: {
      ar: "نطرح الأدوات على مراحل. تبقى الشارة على الأداة حتى ننتهي من بنائها ونتحقق من صحة مخرجاتها.",
      en: "We release tools in milestones. The badge stays on a tool until it is built and its output has been verified.",
    },
  },
  {
    q: { ar: "هل توجد ميزات ذكاء اصطناعي؟", en: "Are there any AI features?" },
    a: {
      ar: "لا، لا توجد ميزات ذكاء اصطناعي في هذا الإصدار.",
      en: "No, there are no AI features in this release.",
    },
  },
  {
    q: { ar: "كيف أبلّغ عن مشكلة أو أقترح فكرة؟", en: "How do I report a problem or suggest an idea?" },
    a: {
      ar: "افتح بلاغاً (Issue) في صفحة Visions على GitHub:",
      en: "Open an issue on the Visions page on GitHub:",
    },
    href: "https://github.com/visions4hub",
  },
];

function Disclosure({ item }: { item: Pair }) {
  const t = useT();
  return (
    <details className="group rounded-2xl border bg-card shadow-soft open:pb-1">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
        <span>{t(item.q)}</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <p className="px-5 pb-4 text-muted-foreground">
        {t(item.a)}
        {item.href && (
          <>
            {" "}
            <a href={item.href} target="_blank" rel="noopener noreferrer" dir="ltr">
              {item.href.replace("https://", "")}
            </a>
          </>
        )}
      </p>
    </details>
  );
}

function DisclosureList({ items }: { items: Pair[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Disclosure key={item.q.en} item={item} />
      ))}
    </div>
  );
}

export function HelpContent() {
  const t = useT();

  const steps: { title: Localized; body: Localized }[] = [
    {
      title: { ar: "اختر الملفات", en: "Choose files" },
      body: {
        ar: "اسحبها إلى الصفحة، أو اخترها من جهازك، أو الصق صورة.",
        en: "Drag them onto the page, pick them from your device, or paste an image.",
      },
    },
    {
      title: { ar: "اضبط الخيارات", en: "Set options" },
      body: { ar: "حدّد الترتيب أو الجودة أو الصفحات حسب الأداة.", en: "Pick order, quality or pages, depending on the tool." },
    },
    {
      title: { ar: "ابدأ المعالجة", en: "Process" },
      body: { ar: "تجري المعالجة على جهازك مع مؤشر للتقدّم.", en: "Processing runs on your device with a progress indicator." },
    },
    {
      title: { ar: "نزّل النتيجة", en: "Download" },
      body: {
        ar: "نزّل كل ملف وحده، أو كل النتائج معاً كملف ZIP.",
        en: "Download each file on its own, or all results together as a ZIP.",
      },
    },
  ];

  return (
    <>
      <PageHero
        eyebrow={{ ar: "المساعدة", en: "Help" }}
        title={{ ar: "الدليل والأسئلة الشائعة", en: "Guide & FAQ" }}
        description={{
          ar: "كل ما تحتاج معرفته لاستخدام الأدوات: طريقة العمل، والصيغ، وحدود الجهاز، وحلول المشكلات الشائعة.",
          en: "Everything you need to use the tools: how they work, formats, device limits and fixes for common problems.",
        }}
      />

      <DocLayout sections={Object.values(S)}>
        <DocSectionBlock section={S.how}>
          <p>
            {t({
              ar: "كل أداة تعمل داخل متصفحك باستخدام JavaScript وWebAssembly. ملفاتك لا تُرفع إلى أي خادم، وتمرّ كل أداة بالخطوات نفسها:",
              en: "Every tool runs inside your browser using JavaScript and WebAssembly. Your files are never uploaded to a server, and every tool follows the same steps:",
            })}
          </p>
          <ol className="grid !list-none gap-3 !ps-0 sm:grid-cols-2 [&>li]:!m-0">
            {steps.map((step, i) => (
              <li key={step.title.en} className="flex gap-3 rounded-2xl border bg-card p-4 shadow-soft">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold leading-7">{t(step.title)}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{t(step.body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </DocSectionBlock>

        <DocSectionBlock section={S.formats}>
          <ul>
            <li>
              <strong>PDF</strong> —{" "}
              {t({
                ar: "ملفات PDF العادية غير المشفّرة.",
                en: "standard, unencrypted PDF files.",
              })}
            </li>
            <li>
              <strong>{t({ ar: "الصور", en: "Images" })}</strong> — JPG, PNG, WebP
              {t({
                ar: "، وSVG (يُحوَّل إلى صورة نقطية). قراءة الصيغ الأخرى مثل GIF تعتمد على ما يدعمه متصفحك.",
                en: ", and SVG (converted to a raster image). Reading other formats such as GIF depends on what your browser supports.",
              })}
            </li>
            <li>
              <strong>{t({ ar: "المخرجات", en: "Output" })}</strong> —{" "}
              {t({
                ar: "PDF أو JPG أو PNG أو WebP أو GIF حسب الأداة، ويمكن تجميع عدة نتائج في ملف ZIP واحد.",
                en: "PDF, JPG, PNG, WebP or GIF depending on the tool; several results can be bundled into a single ZIP.",
              })}
            </li>
          </ul>
          <p className="text-muted-foreground">
            {t({
              ar: "صيغة HEIC غير مدعومة حالياً.",
              en: "HEIC is not supported yet.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.limits}>
          <p>
            {t({
              ar: "لا نضع أي حدّ على عدد الملفات أو أحجامها. الحدود الحقيقية هي حدود جهازك: ذاكرة المتصفح (RAM)، ووقت المعالجة، والصيغ التي يستطيع المتصفح فك ترميزها. الملفات الكبيرة جداً قد تفشل على الهواتف، وعندها نعرض الخطأ كما هو ولا نقدّم نتيجة شكلية.",
              en: "We put no limit on the number or size of files. The real limits are your device's: browser memory (RAM), processing time, and which formats the browser can decode. Very large files may fail on phones; when that happens we show the error as it is rather than a fake result.",
            })}
          </p>
          <ul>
            <li>{t({ ar: "أغلق التبويبات والتطبيقات الأخرى قبل معالجة ملفات كبيرة.", en: "Close other tabs and apps before processing large files." })}</li>
            <li>{t({ ar: "على الهاتف، عالج ملفات أقل في كل مرة.", en: "On a phone, process fewer files at a time." })}</li>
            <li>{t({ ar: "قسّم ملف PDF الضخم إلى أجزاء ثم عالجها واحداً تلو الآخر.", en: "Split a very large PDF into parts and process them one by one." })}</li>
            <li>{t({ ar: "أبقِ الصفحة مفتوحة حتى تنتهي المعالجة.", en: "Keep the page open until processing finishes." })}</li>
          </ul>
        </DocSectionBlock>

        <DocSectionBlock section={S.notes}>
          <p>
            {t({
              ar: "نفضّل أن تعرف حدود كل أداة قبل استخدامها:",
              en: "We would rather you know each tool's limits before you use it:",
            })}
          </p>
          <div className="grid gap-3">
            {LIMITATIONS.map((item) => (
              <div key={item.q.en} className="rounded-2xl border bg-card p-5 shadow-soft">
                <h3 className="!mt-0 !mb-1.5 !text-base font-semibold">{t(item.q)}</h3>
                <p className="text-sm leading-7 text-muted-foreground">{t(item.a)}</p>
              </div>
            ))}
          </div>
          <Note>
            {t({
              ar: "لا توجد ميزات ذكاء اصطناعي في هذا الإصدار.",
              en: "There are no AI features in this release.",
            })}
          </Note>
        </DocSectionBlock>

        <DocSectionBlock section={S.trouble}>
          <DisclosureList items={TROUBLE} />
        </DocSectionBlock>

        <DocSectionBlock section={S.keys}>
          <ul>
            <li>
              {t({ ar: "الصق صورة من الحافظة مباشرة بالضغط على", en: "Paste an image from the clipboard by pressing" })}{" "}
              <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs" dir="ltr">
                Ctrl + V
              </kbd>{" "}
              {t({ ar: "(أو ⌘ + V على Mac).", en: "(or ⌘ + V on Mac)." })}
            </li>
            <li>
              {t({
                ar: "يمكنك التنقّل بين عناصر الصفحة بمفتاح Tab وتفعيلها بمفتاح Enter أو المسافة.",
                en: "You can move between page controls with Tab and activate them with Enter or Space.",
              })}
            </li>
          </ul>
        </DocSectionBlock>

        <DocSectionBlock section={S.faq}>
          <DisclosureList items={FAQ} />
        </DocSectionBlock>
      </DocLayout>
    </>
  );
}
