import type { Metadata } from "next";
import { TermsContent } from "./terms-content";

export const metadata: Metadata = {
  title: "شروط الاستخدام",
  description: "شروط استخدام منصة All To All: استخدام مجاني كما هي، ومسؤوليتك عن ملفاتك، وحدود الأدوات بوضوح.",
};

export default function TermsPage() {
  return <TermsContent />;
}
