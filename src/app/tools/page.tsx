import type { Metadata } from "next";
import { DirectoryPage } from "@/components/directory-page";

export const metadata: Metadata = { title: "كل الأدوات" };

export default function Page() {
  return <DirectoryPage />;
}
