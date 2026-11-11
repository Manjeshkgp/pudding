import { requirePage } from "@/lib/page-auth";
import { GoalsScreen } from "@/components/family-tools";
export default async function Page() {
  await requirePage("/goals");
  return <GoalsScreen />;
}
