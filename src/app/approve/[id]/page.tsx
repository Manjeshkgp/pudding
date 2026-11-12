import PurchaseRequest from "@/components/purchase-request";
import { requirePage } from "@/lib/page-auth";
import { purchaseReviewPath } from "@/lib/purchase-review";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePage(purchaseReviewPath(id));
  return <PurchaseRequest key={id} id={id} />;
}
