"use client";

import { PageHero } from "@/components/page-shell";
import { useT } from "@/lib/i18n";
import { DocLayout, DocSectionBlock, Note, type DocSection } from "../help/_components/doc-layout";

const S = {
  summary: { id: "summary", title: { ar: "الخلاصة", en: "In short" } },
  files: { id: "your-files", title: { ar: "ملفاتك", en: "Your files" } },
  notCollected: { id: "not-collected", title: { ar: "ما لا نجمعه", en: "What we don't collect" } },
  local: { id: "stored-locally", title: { ar: "ما يُحفظ على جهازك", en: "What is stored on your device" } },
  hosting: { id: "hosting", title: { ar: "الاستضافة وسجلات الخادم", en: "Hosting & server logs" } },
  cookies: { id: "cookies", title: { ar: "ملفات تعريف الارتباط", en: "Cookies" } },
  children: { id: "children", title: { ar: "الأطفال", en: "Children" } },
  changes: { id: "changes", title: { ar: "التغييرات على هذه السياسة", en: "Changes to this policy" } },
  contact: { id: "contact", title: { ar: "التواصل", en: "Contact" } },
} satisfies Record<string, DocSection>;

export function PrivacyContent() {
  const t = useT();
  const updated = t({ ar: "آخر تحديث: 4 نوفمبر 2026", en: "Last updated: 4 November 2026" });

  return (
    <>
      <PageHero
        eyebrow={{ ar: "الخصوصية", en: "Privacy" }}
        title={{ ar: "سياسة الخصوصية", en: "Privacy policy" }}
        description={{
          ar: "بلغة واضحة: ملفاتك تبقى على جهازك، ولا نجمع عنك أي بيانات.",
          en: "In plain language: your files stay on your device, and we collect no data about you.",
        }}
      >
        <p className="text-sm text-muted-foreground">{updated}</p>
      </PageHero>

      <DocLayout sections={Object.values(S)}>
        <DocSectionBlock section={S.summary}>
          <Note tone="teal">
            <ul className="!my-0">
              <li>{t({ ar: "ملفاتك لا تُرفع إلى أي خادم؛ تُعالَج داخل متصفحك فقط.", en: "Your files are never uploaded; they are processed only inside your browser." })}</li>
              <li>{t({ ar: "لا حسابات، ولا تتبّع، ولا أدوات تحليل، ولا إعلانات.", en: "No accounts, no tracking, no analytics and no ads." })}</li>
              <li>{t({ ar: "التفضيلات القليلة التي نحفظها تبقى في متصفحك، ويمكنك مسحها متى شئت.", en: "The few preferences we save stay in your browser, and you can clear them at any time." })}</li>
            </ul>
          </Note>
        </DocSectionBlock>

        <DocSectionBlock section={S.files}>
          <p>
            {t({
              ar: "كل أداة في All To All تعمل داخل متصفحك باستخدام JavaScript وWebAssembly. عندما تختار ملفاً، يقرؤه متصفحك من جهازك ويعالجه في الذاكرة، ثم ينشئ النتيجة لتنزّلها. لا يُرسَل الملف ولا محتواه ولا اسمه إلى أي خادم، لأنه لا يوجد لدينا خادم يستقبل الملفات أصلاً.",
              en: "Every tool in All To All runs inside your browser using JavaScript and WebAssembly. When you choose a file, your browser reads it from your device, processes it in memory and creates the result for you to download. Neither the file, its contents nor its name is sent to any server — we have no server that receives files at all.",
            })}
          </p>
          <p>
            {t({
              ar: "بمجرد إغلاق الصفحة أو تحديثها تُزال الملفات من ذاكرة المتصفح.",
              en: "Once you close or reload the page, the files are released from the browser's memory.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.notCollected}>
          <p>{t({ ar: "لا نجمع أياً مما يلي:", en: "We do not collect any of the following:" })}</p>
          <ul>
            <li>{t({ ar: "ملفاتك أو محتواها أو أسماؤها.", en: "Your files, their contents or their names." })}</li>
            <li>{t({ ar: "اسمك أو بريدك الإلكتروني أو أي بيانات حساب — لا توجد حسابات.", en: "Your name, email or any account data — there are no accounts." })}</li>
            <li>{t({ ar: "بيانات الدفع — لا توجد مدفوعات.", en: "Payment details — there are no payments." })}</li>
            <li>{t({ ar: "بيانات الاستخدام عبر أدوات التحليل أو التتبّع — لا نستخدم أياً منها.", en: "Usage data via analytics or tracking tools — we use none." })}</li>
          </ul>
          <p>
            {t({
              ar: "الخطوط والمكتبات البرمجية مضمّنة مع الموقع نفسه، فلا يتصل الموقع أثناء الاستخدام بشبكات توزيع محتوى (CDN) أو خدمات خارجية.",
              en: "Fonts and libraries are bundled with the site itself, so it does not contact third-party CDNs or external services while you use it.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.local}>
          <p>
            {t({
              ar: "نحفظ بعض البيانات في متصفحك أنت فقط، لتسهيل الاستخدام. هذه البيانات لا تغادر جهازك ولا نستطيع الاطلاع عليها:",
              en: "We keep a little data in your own browser, purely for convenience. It never leaves your device and we cannot see it:",
            })}
          </p>
          <ul>
            <li>
              {t({ ar: "اللغة والمظهر (فاتح أو داكن)، في localStorage تحت المفتاح", en: "Language and theme (light or dark), in localStorage under the key" })}{" "}
              <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 text-sm">ata-prefs</code>.
            </li>
            <li>{t({ ar: "قائمة الأدوات التي استخدمتها مؤخراً، في localStorage.", en: "A list of recently used tools, in localStorage." })}</li>
            <li>
              {t({
                ar: "لاحقاً: مسارات العمل التي تحفظها بنفسك (إعدادات الأدوات فقط، لا الملفات)، في IndexedDB.",
                en: "Later: workflows you save yourself (tool settings only, not files), in IndexedDB.",
              })}
            </li>
          </ul>
          <p>
            {t({
              ar: "يمكنك حذف كل ذلك في أي وقت بمسح بيانات الموقع من إعدادات متصفحك.",
              en: "You can delete all of it at any time by clearing this site's data in your browser settings.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.hosting}>
          <p>
            {t({
              ar: "الموقع عبارة عن ملفات ثابتة تُقدَّم عبر مزوّد استضافة ثابتة (مثل Cloudflare Pages أو GitHub Pages). وكأي موقع على الإنترنت، قد يسجّل مزوّد الاستضافة بيانات الطلبات المعتادة، مثل عنوان IP والصفحة المطلوبة ووقت الطلب، وفق سياساته الخاصة.",
              en: "The site is a set of static files served by a static host (such as Cloudflare Pages or GitHub Pages). Like any website, the host may record normal request data — such as IP address, the page requested and the time — under its own policies.",
            })}
          </p>
          <p>
            {t({
              ar: "هذه السجلات لا تتضمن ملفاتك أو محتواها أبداً، لأن الملفات لا تغادر جهازك.",
              en: "These logs never include your files or their contents, because files never leave your device.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.cookies}>
          <p>
            {t({
              ar: "لا نستخدم ملفات تعريف الارتباط (Cookies) للتتبّع أو الإعلانات. التفضيلات المذكورة أعلاه محفوظة في التخزين المحلي للمتصفح ولا تُرسَل مع الطلبات.",
              en: "We do not use cookies for tracking or advertising. The preferences described above are kept in the browser's local storage and are not sent with requests.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.children}>
          <p>
            {t({
              ar: "لا نجمع بيانات شخصية من أي شخص، بمن فيهم الأطفال. ننصح الأطفال باستخدام الأدوات بإشراف أحد الوالدين أو من يقوم مقامهما.",
              en: "We collect no personal data from anyone, including children. We recommend that children use the tools under the supervision of a parent or guardian.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.changes}>
          <p>
            {t({
              ar: "قد نحدّث هذه السياسة عند إضافة ميزات جديدة أو تغيير طريقة عمل الموقع. سننشر أي تعديل في هذه الصفحة مع تحديث تاريخ «آخر تحديث» أعلاها.",
              en: "We may update this policy when we add features or change how the site works. Any change will be published on this page with the “Last updated” date above revised.",
            })}
          </p>
        </DocSectionBlock>

        <DocSectionBlock section={S.contact}>
          <p>
            {t({
              ar: "لأي سؤال عن الخصوصية، افتح بلاغاً (Issue) عبر صفحة Visions على GitHub:",
              en: "For any privacy question, open an issue through the Visions page on GitHub:",
            })}{" "}
            <a href="https://github.com/visions4hub" target="_blank" rel="noopener noreferrer" dir="ltr">
              github.com/visions4hub
            </a>
          </p>
        </DocSectionBlock>
      </DocLayout>
    </>
  );
}
