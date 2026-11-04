import type { Metadata } from "next";
import { NotFoundContent } from "./not-found-content";

export const metadata: Metadata = { title: "الصفحة غير موجودة" };

// Exported as out/404.html; static hosts (Cloudflare Pages) serve it for unknown paths.
export default function NotFound() {
  return <NotFoundContent />;
}
