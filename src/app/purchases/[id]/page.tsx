import { requirePage } from "@/lib/page-auth";
import { PurchaseScreen } from "@/components/purchase-screens";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await requirePage(`/purchases/${encodeURIComponent(id)}`);
  return <PurchaseScreen id={id} parent={viewer.kind === "PARENT"} />;
}
