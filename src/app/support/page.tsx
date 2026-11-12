import { requirePage } from "@/lib/page-auth";
import { SupportScreen } from "@/components/settings-screens";
export default async function Page() {
  await requirePage("/support");
  return <SupportScreen />;
}
