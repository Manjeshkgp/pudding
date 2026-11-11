import { requirePage } from "@/lib/page-auth";
import BlockedScreen from "@/components/blocked-screen";
export default async function Page() {
  await requirePage("/account-blocked");
  return <BlockedScreen />;
}
