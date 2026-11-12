import { requirePage } from "@/lib/page-auth";
import CoparentScreen from "@/components/coparent-screen";

export default async function Page() {
  await requirePage("/coparent");
  return <CoparentScreen />;
}
