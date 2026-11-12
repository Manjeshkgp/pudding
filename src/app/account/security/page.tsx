import { requirePage } from "@/lib/page-auth";
import { SecuritySettings } from "@/components/settings-screens";
import { topupPath } from "@/lib/topup-navigation";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  await requirePage("/account/security");
  const { returnTo } = await searchParams;
  return <SecuritySettings continueToTopup={returnTo === topupPath} />;
}
