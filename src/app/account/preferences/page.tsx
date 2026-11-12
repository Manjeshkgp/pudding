import { requirePage } from "@/lib/page-auth";
import { PreferencesScreen } from "@/components/settings-screens";
export default async function Page() {
  await requirePage("/account");
  return <PreferencesScreen />;
}
