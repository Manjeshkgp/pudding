import { requirePage } from "@/lib/page-auth";
import { purchaseReviewPath } from "@/lib/purchase-review";
import { redirect } from "next/navigation";

export default async function ApprovePage({
  searchParams,
}: {
  searchParams: Promise<{ purchaseId?: string | string[] }>;
}) {
  const { purchaseId } = await searchParams;
  if (typeof purchaseId === "string" && purchaseId)
    redirect(purchaseReviewPath(purchaseId));
  await requirePage("/approve");
  redirect("/approvals");
}
