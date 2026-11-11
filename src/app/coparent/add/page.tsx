import { requirePage } from "@/lib/page-auth";
import CoparentAddScreen from "@/components/coparent-add-screen";

export default async function Page() {
  await requirePage("/coparent");
  return <CoparentAddScreen />;
}
