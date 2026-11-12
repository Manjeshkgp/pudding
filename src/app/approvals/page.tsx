import { requirePage } from "@/lib/page-auth";
import { ApprovalsScreen } from "@/components/purchase-screens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  await requirePage("/approvals");
  const { tab } = await searchParams;
  return <ApprovalsScreen tab={tab === "tasks" ? "tasks" : "purchases"} />;
}
