import { requirePage } from "@/lib/page-auth";
import { ChoresScreen } from "@/components/family-tools";
export default async function Page() {
  await requirePage("/chores");
  return <ChoresScreen />;
}
