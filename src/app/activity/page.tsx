import { requirePage } from "@/lib/page-auth";
import { ActivityScreen } from "@/components/purchase-screens";
import KidActivityScreen from "@/components/activity-screen";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const state = await requirePage("/activity");
  const { tab } = await searchParams;
  if (state.kind === "CHILD") return <KidActivityScreen />;
  return (
    <ActivityScreen
      path="/activity"
      tab={tab === "wallet" ? "wallet" : "purchases"}
    />
  );
}
