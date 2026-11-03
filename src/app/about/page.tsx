import type { Metadata } from "next";
import { AboutContent } from "./about-content";

export const metadata: Metadata = {
  title: "عن المنصة",
  description:
    "تعرّف على All To All من Visions: أدوات مجانية لملفات PDF والصور تعمل بالكامل داخل متصفحك، بلا حساب وبلا رفع للملفات.",
};

export default function AboutPage() {
  return <AboutContent />;
}
