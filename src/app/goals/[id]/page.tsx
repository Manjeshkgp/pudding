import { requirePage } from "@/lib/page-auth";
import { GoalDetail } from "@/components/family-tools";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePage("/goals");
  return <GoalDetail id={(await params).id} />;
}
