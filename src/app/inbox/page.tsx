import { requirePage } from "@/lib/page-auth";
import InboxScreen from "@/components/inbox-screen";
export default async function Page() {
  await requirePage("/inbox");
  return <InboxScreen />;
}
