import { requirePage } from "@/lib/page-auth";
import ProfileScreen from "@/components/profile-screen";
import { SessionGate } from "@/components/app-ui";
export default async function Page() {
  await requirePage("/account");
  return (
    <SessionGate role="USER">
      <ProfileScreen returnTo="/account" />
    </SessionGate>
  );
}
