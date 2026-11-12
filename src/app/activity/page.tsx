import { requirePage } from "@/lib/page-auth";
import { ActivityScreen } from "@/components/purchase-screens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  await requirePage("/activity");
  const { tab } = await searchParams;
  return (
    <ActivityScreen
      path="/activity"
      tab={tab === "wallet" ? "wallet" : "purchases"}
    />
  );
}
