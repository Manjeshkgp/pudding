import { requirePage } from "@/lib/page-auth";
import ChoreProofScreen from "@/components/chore-proof-screen";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePage(`/chores/${(await params).id}/proof`);
  return <ChoreProofScreen id={(await params).id} />;
}
