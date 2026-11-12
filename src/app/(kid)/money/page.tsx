import { requirePage } from "@/lib/page-auth";
import MoneyScreen from "@/components/money-screen";
export default async function Page() {
  await requirePage("/money");
  return <MoneyScreen />;
}
