import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory-page";

export const metadata: Metadata = { title: "أدوات الصور" };

export default function Page() {
  return <DirectoryPage category="image" />;
}
