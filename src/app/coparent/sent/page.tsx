import { requirePage } from "@/lib/page-auth";
import CoparentSentScreen from "@/components/coparent-sent-screen";

export default async function Page() {
  await requirePage("/coparent");
  return <CoparentSentScreen />;
}
