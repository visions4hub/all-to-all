import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory-page";

export const metadata: Metadata = { title: "أدوات PDF" };

export default function Page() {
  return <DirectoryPage category="pdf" />;
}
