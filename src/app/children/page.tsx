import { requirePage } from "@/lib/page-auth";
import CrewScreen from "@/components/crew-screen";
export default async function Page() {
  await requirePage("/children");
  return <CrewScreen />;
}
