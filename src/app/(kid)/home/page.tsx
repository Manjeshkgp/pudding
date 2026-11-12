import { requirePage } from "@/lib/page-auth";
import KidHome from "@/components/kid-home";

export default async function Page() {
  await requirePage("/home");
  return <KidHome />;
}
