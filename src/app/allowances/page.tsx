import { requirePage } from "@/lib/page-auth";
import { AllowancesScreen } from "@/components/family-tools";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string | string[] }>;
}) {
  await requirePage("/allowances");
  const { childId } = await searchParams;
  return (
    <AllowancesScreen linkedChildId={typeof childId === "string" ? childId : undefined} />
  );
}
