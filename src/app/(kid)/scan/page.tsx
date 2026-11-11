import { requirePage } from "@/lib/page-auth";
import { ScanScreen } from "@/components/purchase-screens";
export default async function Page() {
  await requirePage("/scan");
  return <ScanScreen />;
}
