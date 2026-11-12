import { requirePage } from "@/lib/page-auth";
import CoparentInvitationsScreen from "@/components/coparent-invitations-screen";

export default async function Page() {
  await requirePage("/coparent");
  return <CoparentInvitationsScreen />;
}
