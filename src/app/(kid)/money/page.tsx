import { requirePage } from "@/lib/page-auth";
import { ActivityScreen } from "@/components/purchase-screens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  await requirePage("/money");
  const { tab } = await searchParams;
  return (
    <ActivityScreen
      path="/money"
      tab={tab === "wallet" ? "wallet" : "purchases"}
    />
  );
}
