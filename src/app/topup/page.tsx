import { requirePage } from "@/lib/page-auth";
import TopupScreen from "@/components/topup-screen";

export default async function TopupPage() {
  await requirePage("/topup");
  return <TopupScreen />;
}
