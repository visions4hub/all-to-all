import { cn } from "@/lib/utils";

// Bundles of fine gold lines sweeping out of two corners, as in the brand artwork.
// Static, flat, decorative only. Each line's opacity peaks in the middle of the bundle.
const LINES = 22;

function Bundle({ className, flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 600 320"
      className={cn("pointer-events-none absolute h-[220px] w-[420px] text-gold sm:h-[300px] sm:w-[600px]", className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <g fill="none" stroke="currentColor" strokeWidth="0.8" transform={flip ? "rotate(180 300 160)" : undefined}>
        {Array.from({ length: LINES }, (_, i) => {
          const t = i / (LINES - 1);
          const opacity = 0.08 + 0.55 * Math.sin(Math.PI * t);
          return (
            <path
              key={i}
              opacity={opacity.toFixed(3)}
              d={`M-10 ${250 - i * 4} C ${150 + i * 2} ${200 - i * 6}, ${180 + i * 6} ${40 + i * 4}, ${620} ${-10 + i * 7}`}
            />
          );
        })}
      </g>
    </svg>
  );
}

/** Place inside a `relative overflow-hidden` container. */
export function GoldSilk({ corners = "both", className }: { corners?: "both" | "top" | "bottom"; className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {/* Each bundle fades out toward its open end, so no line stops abruptly. */}
      {corners !== "bottom" && <Bundle className="top-0 left-0 [mask-image:linear-gradient(to_right,black_45%,transparent_98%)]" />}
      {corners !== "top" && <Bundle className="right-0 bottom-0 [mask-image:linear-gradient(to_left,black_45%,transparent_98%)]" flip />}
    </div>
  );
}
