import Link from "next/link";
import { cn } from "@/lib/utils";

// The brand artwork is used exactly as supplied (assets/brand-source.webp), cut into
// files by scripts/build-brand.mjs. Only the black background was made transparent.

/** The gold knot. Natural size 512×488. */
export function BrandMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand artwork, served as is
    <img src="/brand/mark.png" width={512} height={488} alt="" aria-hidden className={cn("h-8 w-auto", className)} draggable={false} />
  );
}

/** "ALL TO ALL — BY VISIONS". Natural size 900×191. */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand artwork, served as is
    <img src="/brand/wordmark.png" width={900} height={191} alt="All To All — By Visions" className={cn("h-7 w-auto", className)} draggable={false} />
  );
}

export function BrandLogo({ className }: { className?: string }) {
  return (
    <Link href="/" dir="ltr" className={cn("inline-flex shrink-0 items-center gap-2", className)} aria-label="All To All — By Visions">
      <BrandMark className="h-9 sm:h-10" />
      <BrandWordmark className="h-6 sm:h-7" />
    </Link>
  );
}
