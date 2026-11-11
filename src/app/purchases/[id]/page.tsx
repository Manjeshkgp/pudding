import { requirePage } from "@/lib/page-auth";
import { PurchaseScreen } from "@/components/purchase-screens";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requirePage("/purchases");
  return (
    <PurchaseScreen id={(await params).id} parent={viewer.kind === "PARENT"} />
  );
}
