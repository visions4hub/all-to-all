import type { Metadata } from "next";
import { HelpContent } from "./help-content";

export const metadata: Metadata = {
  title: "المساعدة والدليل",
  description:
    "كيف تعمل أدوات All To All، والصيغ المدعومة، وحدود الجهاز، وحلول المشكلات الشائعة، والأسئلة المتكررة.",
};

export default function HelpPage() {
  return <HelpContent />;
}
