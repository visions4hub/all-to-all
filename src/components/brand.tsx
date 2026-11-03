import Link from "next/link";
import { cn } from "@/lib/utils";

/** The All To All mark: two arrows meeting — any file in, any file out. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M9 12.5h11.5l-3-3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23 19.5H11.5l3 3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="12.5" r="1.6" fill="var(--teal)" />
    </svg>
  );
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)} aria-label="All To All — By Visions">
      <BrandMark className="transition-transform duration-300 group-hover:rotate-[-6deg]" />
      <span dir="ltr" className="flex flex-col leading-none">
        <span className="font-heading text-[17px] font-bold tracking-tight text-foreground">All To All</span>
        <span className="mt-1 text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">By Visions</span>
      </span>
    </Link>
  );
}
