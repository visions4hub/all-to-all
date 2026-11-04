import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The All To All mark: four ribbons folded into one knot — every file passes
 * through the same loop and comes out as something else. Flat gold in two
 * tones (no glow) so it stays crisp from a 16px favicon to a hero.
 * Colours come from --gold-hi / --gold-lo / --gold-star (see globals.css).
 */
export function BrandMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  const bar = "M22 22H84";
  return (
    <svg viewBox="0 0 100 100" className={cn("size-8", animated && "brand-mark-animated", className)} aria-hidden>
      <g transform="rotate(45 50 50) translate(50 50) scale(0.9) translate(-50 -50)" fill="none" strokeWidth="16" strokeLinecap="round">
        <path className="brand-ribbon" pathLength={100} d={bar} stroke="var(--gold-hi)" />
        <path className="brand-ribbon" pathLength={100} d={bar} stroke="var(--gold-lo)" transform="rotate(90 50 50)" />
        <path className="brand-ribbon" pathLength={100} d={bar} stroke="var(--gold-hi)" transform="rotate(180 50 50)" />
        <path className="brand-ribbon" pathLength={100} d={bar} stroke="var(--gold-lo)" transform="rotate(270 50 50)" />
        {/* The first ribbon passes over the last one, closing the weave. */}
        <path className="brand-ribbon" pathLength={100} d="M22 22H42" stroke="var(--gold-hi)" />
      </g>
      <path
        className="brand-star"
        d="M50 38c1.3 7.2 4.8 10.7 12 12-7.2 1.3-10.7 4.8-12 12-1.3-7.2-4.8-10.7-12-12 7.2-1.3 10.7-4.8 12-12z"
        fill="var(--gold-star)"
      />
    </svg>
  );
}

/** Wordmark: classic serif capitals, as in the brand artwork. */
export function BrandWordmark({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span dir="ltr" className={cn("flex flex-col items-center leading-none", className)}>
      <span
        className={cn(
          "font-brand font-semibold tracking-[0.04em] text-gold",
          size === "md" ? "text-[17px]" : "text-4xl sm:text-5xl",
        )}
      >
        ALL TO ALL
      </span>
      <span className={cn("flex w-full items-center gap-1.5 text-muted-foreground", size === "md" ? "mt-1" : "mt-3")}>
        <span className="h-px flex-1 bg-current opacity-40" />
        <span className={cn("font-brand tracking-[0.32em]", size === "md" ? "text-[8px]" : "text-xs sm:text-sm")}>BY VISIONS</span>
        <span className="h-px flex-1 bg-current opacity-40" />
      </span>
    </span>
  );
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)} aria-label="All To All — By Visions">
      <BrandMark className="size-9 transition-transform duration-500 ease-out group-hover:rotate-90" />
      <BrandWordmark />
    </Link>
  );
}
