"use client";

import { useT, type Localized } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

/** Standard top section for inner pages. */
export function PageHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: Localized;
  title: Localized;
  description?: Localized;
  children?: React.ReactNode;
}) {
  const t = useT();
  return (
    <section className="border-b bg-card/60">
      <Container className="py-10 sm:py-14">
        {eyebrow && <p className="mb-3 text-sm font-semibold text-primary">{t(eyebrow)}</p>}
        <h1 className="text-3xl font-bold text-balance sm:text-4xl">{t(title)}</h1>
        {description && <p className="mt-3 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">{t(description)}</p>}
        {children && <div className="mt-6">{children}</div>}
      </Container>
    </section>
  );
}

/** Long-form text pages (privacy, terms, help, about). */
export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-3xl space-y-4 text-[15px] leading-8 text-foreground/90",
        "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold",
        "[&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:ps-6",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline",
        className,
      )}
    >
      {children}
    </div>
  );
}
