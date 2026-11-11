import { requirePage } from "@/lib/page-auth";
import AddKidScreen from "@/components/add-kid-screen";
export default async function Page() {
  await requirePage("/children/new");
  return <AddKidScreen />;
}
