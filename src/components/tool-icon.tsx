import {
  Blend,
  Combine,
  Crop,
  Droplets,
  FileDigit,
  FileImage,
  FileMinus2,
  FileOutput,
  FileText,
  Film,
  FlipHorizontal2,
  GitCompareArrows,
  ImageDown,
  Images,
  Info,
  Laugh,
  LayoutGrid,
  type LucideIcon,
  PenLine,
  Repeat2,
  RotateCw,
  Scaling,
  Scissors,
  Signature,
  SlidersHorizontal,
  SquareDashed,
  Stamp,
  TextCursorInput,
  Minimize2,
} from "lucide-react";
import type { ToolCategory, ToolIconName } from "@/lib/tools/types";
import { cn } from "@/lib/utils";

const ICONS: Record<ToolIconName, LucideIcon> = {
  merge: Combine,
  split: Scissors,
  "remove-pages": FileMinus2,
  "extract-pages": FileOutput,
  organize: LayoutGrid,
  "rotate-pdf": RotateCw,
  "page-numbers": FileDigit,
  "watermark-pdf": Stamp,
  "crop-pdf": SquareDashed,
  "edit-pdf": PenLine,
  "image-to-pdf": Images,
  "pdf-to-image": FileImage,
  "pdf-text": FileText,
  "pdf-forms": TextCursorInput,
  "sign-pdf": Signature,
  "compress-pdf": Minimize2,
  "compare-pdf": GitCompareArrows,
  "compress-image": ImageDown,
  "resize-image": Scaling,
  "crop-image": Crop,
  "rotate-image": FlipHorizontal2,
  "convert-image": Repeat2,
  "photo-editor": SlidersHorizontal,
  "watermark-image": Droplets,
  meme: Laugh,
  "blur-image": Blend,
  metadata: Info,
  gif: Film,
};

// `category` is accepted for callers' clarity; every tool icon is gold, so it doesn't change the look.
export function ToolIcon({
  name,
  size = "md",
  className,
}: {
  name: ToolIconName;
  category: ToolCategory;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = ICONS[name];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl",
        "bg-brand-soft text-gold ring-1 ring-gold/20 ring-inset",
        size === "sm" && "size-8 [&_svg]:size-4",
        size === "md" && "size-11 [&_svg]:size-5",
        size === "lg" && "size-14 rounded-2xl [&_svg]:size-7",
        className,
      )}
      aria-hidden
    >
      <Icon strokeWidth={1.8} />
    </span>
  );
}
