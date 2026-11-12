import { notFound } from "next/navigation";
import HelpArticleScreen from "@/components/help-article-screen";
import { findArticle } from "@/components/help-content";

export default async function Page({
  params,
}: {
  params: Promise<{ topic: string; article: string }>;
}) {
  const { topic, article } = await params;
  const found = findArticle(topic, article);
  if (!found || !found.article) notFound();
  return <HelpArticleScreen topic={found.topic} article={found.article} />;
}
