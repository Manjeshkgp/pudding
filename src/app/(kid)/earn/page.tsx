import { requirePage } from "@/lib/page-auth";
import EarnScreen from "@/components/earn-screen";

export default async function Page() {
  await requirePage("/earn");
  return <EarnScreen />;
}
