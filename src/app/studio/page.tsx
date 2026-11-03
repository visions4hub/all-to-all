import type { Metadata } from "next";
import { StudioContent } from "./studio-content";

export const metadata: Metadata = { title: "الاستوديو" };

export default function Page() {
  return <StudioContent />;
}
