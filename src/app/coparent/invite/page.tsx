import { requirePage } from "@/lib/page-auth";
import CoparentInviteScreen from "@/components/coparent-invite-screen";

export default async function Page() {
  await requirePage("/coparent");
  return <CoparentInviteScreen />;
}
