import KidProfileScreen from "@/components/kid-profile-screen";
import { requirePage } from "@/lib/page-auth";

export default async function Page() {
  await requirePage("/me");
  return <KidProfileScreen />;
}
