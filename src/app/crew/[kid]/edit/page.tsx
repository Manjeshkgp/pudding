import { redirectLegacyPage } from "@/lib/page-auth";
export default async function Page({
  params,
}: {
  params: Promise<{ kid: string }>;
}) {
  return redirectLegacyPage(`/crew/${(await params).kid}/edit`);
}
