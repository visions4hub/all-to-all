"use client";

import Link from "next/link";
import { PageHero } from "@/components/page-shell";
import { useT } from "@/lib/i18n";
import { DocLayout, DocSectionBlock, Note, type DocSection } from "../help/_components/doc-layout";

const S = {
  acceptance: { id: "acceptance", title: { ar: "قبول الشروط", en: "Acceptance" } },
  service: { id: "the-service", title: { ar: "الخدمة", en: "The service" } },
  asIs: { id: "as-is", title: { ar: "الاستخدام كما هي ودون ضمان", en: "As-is, without warranty" } },
  files: { id: "your-files", title: { ar: "مسؤوليتك عن ملفاتك", en: "Your responsibility for your files" } },
  lawful: { id: "lawful-use", title: { ar: "الاستخدام المشروع", en: "Lawful use" } },
  limits: { id: "tool-limitations", title: { ar: "حدود الأدوات", en: "Tool limitations" } },
  ip: { id: "intellectual-property", title: { ar: "الملكية الفكرية", en: "Intellectual property" } },
  oss: { id: "open-source", title: { ar: "المكتبات مفتوحة المصدر", en: "Open-source libraries" } },
  liability: { id: "liability", title: { ar: "حدود المسؤولية", en: "Limitation of liability" } },
  changes: { id: "changes", title: { ar: "التغييرات", en: "Changes" } },
  general: { id: "general", title: { ar: "أحكام عامة", en: "General" } },
} satisfies Record<string, DocSection>;

export function TermsContent() {
  const t = useT();

  return (
    <>
      <PageHero
        eyebrow={{ ar: "الشروط", en: "Terms" }}
        title={{ ar: "شروط الاستخدام", en: "Terms of use" }}
        description={{
          ar: "شروط بسيطة لخدمة مجانية: استخدمها بحرية ومسؤولية، واعرف حدودها.",
          en: "Simple terms for a free service: use it freely and responsibly, and know its limits.",
        }}
      >
        <p className="text-sm text-muted-foreground">
          {t({ ar: "آخر تحديث: 4 نوفمبر 2026", en: "Last updated: 4 November 2026" })}
        </p>
      </PageHero>

      <DocLayout sections={Object.values(S)}>
        <DocSectionBlock section={S.acceptance}>
          <p>
            {t({
              ar: "باستخدامك موقع All To All فإنك توافق على هذه الشروط. إن لم توافق عليها، فيُرجى عدم استخدام الموقع.",
              en: "By using All To All you agree to these terms. If you do not agree, please do not use the site.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.service}>
          <p>
            {t({
              ar: "All To All مجموعة أدوات لملفات PDF والصور يقدّمها فريق Visions مجاناً. تعمل الأدوات بالكامل داخل متصفحك، دون حساب أو اشتراك أو رفع للملفات. لمعرفة ما نحفظه وما لا نجمعه، راجع",
              en: "All To All is a set of PDF and image tools offered free of charge by the Visions team. The tools run entirely in your browser, with no account, subscription or file upload. For what we store and what we don't collect, see the",
            })}{" "}
            <Link href="/privacy">{t({ ar: "سياسة الخصوصية", en: "privacy policy" })}</Link>.
          </p>
          <p>
            {t({
              ar: "نطرح الأدوات على مراحل، وقد نضيف أدوات أو نعدّلها أو نوقفها في أي وقت. الأداة التي تحمل شارة «قيد البناء» لم تكتمل بعد.",
              en: "We release tools in milestones and may add, change or discontinue tools at any time. A tool marked “In progress” is not finished yet.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.asIs}>
          <p>
            {t({
              ar: "تُقدَّم الخدمة «كما هي» و«حسب توفرها»، دون أي ضمان صريح أو ضمني، بما في ذلك ضمان الملاءمة لغرض معيّن أو خلوّها من الأخطاء أو استمرار توفرها. نبذل جهدنا للتحقق من صحة مخرجات كل أداة، لكن عليك مراجعة النتيجة قبل الاعتماد عليها.",
              en: "The service is provided “as is” and “as available”, without any warranty, express or implied — including fitness for a particular purpose, freedom from errors or continued availability. We work to verify each tool's output, but you should review the result before relying on it.",
            })}
          </p>
          <p>
            {t({
              ar: "تعتمد المعالجة على جهازك ومتصفحك: الذاكرة المتاحة، ووقت المعالجة، والصيغ التي يستطيع المتصفح قراءتها. قد تفشل معالجة الملفات الكبيرة جداً، خاصة على الهواتف.",
              en: "Processing depends on your device and browser: available memory, processing time and the formats the browser can read. Very large files may fail to process, especially on phones.",
            })}
          </p>
          <Note>
            {t({
              ar: "احتفظ دائماً بنسخة من ملفاتك الأصلية. الأدوات تنشئ ملفات جديدة ولا تغيّر الملف الأصلي على جهازك.",
              en: "Always keep a copy of your original files. The tools create new files and do not change the original file on your device.",
            })}
          </Note>
        </DocSectionBlock>

        <DocSectionBlock section={S.files}>
          <p>
            {t({
              ar: "أنت وحدك المسؤول عن الملفات التي تعالجها وعن طريقة استخدامك للنتائج. يجب أن تملك الملف أو أن يكون لديك الحق في معالجته وتعديله، بما في ذلك احترام حقوق النشر والخصوصية الخاصة بالآخرين.",
              en: "You alone are responsible for the files you process and how you use the results. You must own each file or have the right to process and modify it, including respecting other people's copyright and privacy.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.lawful}>
          <p>{t({ ar: "لا يجوز استخدام الموقع في:", en: "You may not use the site to:" })}</p>
          <ul>
            <li>{t({ ar: "أي نشاط مخالف للقانون.", en: "Carry out any unlawful activity." })}</li>
            <li>
              {t({
                ar: "تزوير المستندات أو التواقيع، أو انتحال شخصية الآخرين، أو تضليلهم.",
                en: "Forge documents or signatures, impersonate others, or mislead people.",
              })}
            </li>
            <li>
              {t({
                ar: "تجاوز حماية ملفات لا تملك حق فتحها، أو انتهاك حقوق الملكية الفكرية.",
                en: "Bypass protection on files you have no right to open, or infringe intellectual property rights.",
              })}
            </li>
            <li>
              {t({
                ar: "محاولة تعطيل الموقع أو إساءة استخدامه.",
                en: "Attempt to disrupt or abuse the site.",
              })}
            </li>
          </ul>
        </DocSectionBlock>

        <DocSectionBlock section={S.limits}>
          <p>{t({ ar: "تقرّ بأنك على علم بالحدود التالية:", en: "You acknowledge the following limitations:" })}</p>
          <ul>
            <li>
              {t({
                ar: "قص PDF يُخفي المحتوى خارج حدود القص ولا يحذفه من الملف.",
                en: "PDF crop hides content outside the crop area; it does not delete it from the file.",
              })}
            </li>
            <li>
              {t({
                ar: "التوقيع المرئي ليس توقيعاً رقمياً مشفّراً أو معتمداً قانونياً.",
                en: "A visual signature is not a cryptographic or legally certified digital signature.",
              })}
            </li>
            <li>
              {t({
                ar: "ملفات PDF الممسوحة ضوئياً لا تحتوي نصاً قابلاً للاستخراج دون OCR، وOCR غير متوفر في هذا الإصدار.",
                en: "Scanned PDFs contain no extractable text without OCR, and OCR is not part of this release.",
              })}
            </li>
            <li>
              {t({
                ar: "التمويه والتقطيع إلى مربعات ليسا وسيلة آمنة لإخفاء المعلومات الحساسة.",
                en: "Blur and pixelation are not a secure way to redact sensitive information.",
              })}
            </li>
            <li>
              {t({
                ar: "توفير المساحة في ضغط PDF يعتمد على الملف وقد يكون معدوماً.",
                en: "Space savings from PDF compression depend on the file and can be zero.",
              })}
            </li>
            <li>
              {t({
                ar: "أداة «تعديل PDF» تضيف عناصر فوق الصفحة ولا تعيد كتابة النص الأصلي.",
                en: "“Edit PDF” adds elements on top of the page and does not rewrite the original text.",
              })}
            </li>
          </ul>
          <p>
            {t({ ar: "تفاصيل أكثر في", en: "More details in the" })}{" "}
            <Link href="/help#tool-limitations">{t({ ar: "صفحة المساعدة", en: "help page" })}</Link>.
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.ip}>
          <p>
            {t({
              ar: "تصميم الموقع واسم «All To All» وعبارة «By Visions» والشعار والنصوص مملوكة لفريق Visions. لا يمنحك استخدام الموقع أي حق في استخدامها دون إذن. أما ملفاتك ونتائجها فتبقى لك، ولا نطالب بأي حق فيها.",
              en: "The site's design, the “All To All” name, the “By Visions” signature, the logo and the text belong to the Visions team. Using the site does not grant you any right to use them without permission. Your files and their results remain yours; we claim no rights over them.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.oss}>
          <p>
            {t({
              ar: "يعتمد الموقع على مكتبات مفتوحة المصدر، وتبقى كل مكتبة خاضعة لترخيصها الخاص. لا تُغيّر هذه الشروط أياً من تلك التراخيص.",
              en: "The site relies on open-source libraries, each of which remains under its own license. These terms do not change any of those licenses.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.liability}>
          <p>
            {t({
              ar: "إلى الحد الأقصى الذي يسمح به القانون المعمول به، لا يتحمّل فريق Visions أي مسؤولية عن أي ضرر مباشر أو غير مباشر ينتج عن استخدام الموقع أو تعذّر استخدامه، بما في ذلك فقدان البيانات أو أخطاء المخرجات.",
              en: "To the fullest extent permitted by applicable law, the Visions team is not liable for any direct or indirect damage arising from the use of, or inability to use, the site — including data loss or errors in output.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.changes}>
          <p>
            {t({
              ar: "قد نعدّل هذه الشروط من وقت لآخر، وننشر النسخة المحدّثة في هذه الصفحة مع تاريخ التحديث. استمرارك في استخدام الموقع بعد التعديل يعني قبولك للشروط المحدّثة.",
              en: "We may revise these terms from time to time and will publish the updated version on this page with its date. Continuing to use the site after a change means you accept the updated terms.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.general}>
          <p>
            {t({
              ar: "تخضع هذه الشروط للقوانين المعمول بها. إذا تبيّن أن أي بند منها غير قابل للتطبيق، تبقى بقية البنود سارية. لأي استفسار، افتح بلاغاً (Issue) عبر",
              en: "These terms are subject to applicable law. If any provision is found unenforceable, the remaining provisions stay in effect. For any question, open an issue via",
            })}{" "}
            <a href="https://github.com/visions4hub" target="_blank" rel="noopener noreferrer" dir="ltr">
              github.com/visions4hub
            </a>
            .
          </p>
        </DocSectionBlock>
      </DocLayout>
    </>
  );
}
