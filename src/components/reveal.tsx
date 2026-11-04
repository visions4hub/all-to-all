"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// One shared observer for every revealed element on the page.
let observer: IntersectionObserver | null = null;
function getObserver() {
  if (!observer && typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer?.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
  }
  return observer;
}

/**
 * Fades its content up the first time it scrolls into view. `index` staggers
 * siblings (70 ms apart). Without IntersectionObserver the content just shows.
 */
export function Reveal({
  children,
  index = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    const io = getObserver();
    if (!el) return;
    if (!io) {
      el.classList.add("is-visible");
      return;
    }
    io.observe(el);
    return () => io.unobserve(el);
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLLIElement>}
      className={cn("reveal", className)}
      style={{ "--reveal-i": Math.min(index, 8) } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}
