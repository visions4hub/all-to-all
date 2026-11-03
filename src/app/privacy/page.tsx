import type { Metadata } from "next";
import { PrivacyContent } from "./privacy-content";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description:
    "ملفاتك لا تغادر جهازك. تعرّف على ما لا نجمعه، وما يُحفظ محلياً في متصفحك فقط، وكيف تمسحه.",
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
