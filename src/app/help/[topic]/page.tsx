import { notFound } from "next/navigation";
import HelpTopicsScreen from "@/components/help-topics-screen";
import { findTopic } from "@/components/help-content";

export default async function Page({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const t = findTopic(topic);
  if (!t) notFound();
  return <HelpTopicsScreen topic={t} />;
}
