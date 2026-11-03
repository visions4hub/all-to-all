import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ALL_TOOLS, getToolBySlug } from "@/lib/tools/registry";
import { ToolPage } from "./tool-page";

// Every tool page is generated at build time (static export).
export const dynamicParams = false;

export function generateStaticParams() {
  return ALL_TOOLS.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool) return {};
  return { title: tool.name.ar, description: tool.description.ar };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getToolBySlug(slug)) notFound();
  return <ToolPage slug={slug} />;
}
