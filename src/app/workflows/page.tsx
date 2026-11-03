import type { Metadata } from "next";
import { WorkflowsContent } from "./workflows-content";

export const metadata: Metadata = { title: "سير العمل" };

export default function Page() {
  return <WorkflowsContent />;
}
