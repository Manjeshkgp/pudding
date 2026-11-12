import { SavingsScreen } from "@/components/savings-screen";
import { requirePage } from "@/lib/page-auth";

export default async function Page() {
  await requirePage("/savings");
  return <SavingsScreen />;
}
