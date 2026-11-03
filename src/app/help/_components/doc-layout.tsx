"use client";

import { Container, Prose } from "@/components/page-shell";
import { useT, type Localized } from "@/lib/i18n";

export type DocSection = { id: string; title: Localized };

/**
 * Two-column layout for long text pages (help, privacy, terms):
 * an "On this page" list of anchors beside the article. On small screens the
 * list sits above the article.
 */
export function DocLayout({
  sections,
  meta,
  children,
}: {
  sections: DocSection[];
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <Container className="py-10 sm:py-14">
      <div className="grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav
            aria-label={t({ ar: "في هذه الصفحة", en: "On this page" })}
            className="rounded-2xl border bg-card p-5 shadow-soft"
          >
            <p className="mb-3 text-sm font-semibold">{t({ ar: "في هذه الصفحة", en: "On this page" })}</p>
            <ol className="space-y-1.5 text-sm">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block rounded-md py-0.5 text-muted-foreground transition-colors hover:text-primary"
                  >
                    {t(s.title)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          {meta && <div className="mt-4 px-1 text-xs text-muted-foreground">{meta}</div>}
        </aside>
        <article className="min-w-0">
          <Prose className="[&_h2]:scroll-mt-24 [&_section]:space-y-4 [&_section:first-child_h2]:mt-0">{children}</Prose>
        </article>
      </div>
    </Container>
  );
}

/** A titled section whose heading is an anchor target from the list above. */
export function DocSectionBlock({ section, children }: { section: DocSection; children: React.ReactNode }) {
  const t = useT();
  return (
    <section aria-labelledby={section.id}>
      <h2 id={section.id}>{t(section.title)}</h2>
      {children}
    </section>
  );
}

/** Highlighted note card used inside long text. */
export function Note({ children, tone = "brand" }: { children: React.ReactNode; tone?: "brand" | "teal" | "pdf" }) {
  const tones = {
    brand: "bg-brand-soft",
    teal: "bg-teal-soft",
    pdf: "bg-pdf-soft",
  } as const;
  return <div className={`my-5 rounded-2xl px-5 py-4 text-[15px] leading-7 ${tones[tone]}`}>{children}</div>;
}
