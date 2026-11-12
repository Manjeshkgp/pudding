import { requirePage } from "@/lib/page-auth";
import ScanScreen from "@/components/scan-screen";
export default async function Page() {
  await requirePage("/scan");
  return <ScanScreen />;
}
