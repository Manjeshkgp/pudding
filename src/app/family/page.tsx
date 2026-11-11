import { requirePage } from "@/lib/page-auth";
import ParentHome from "@/components/parent-home";

export default async function FamilyPage() {
  await requirePage("/family");
  return <ParentHome />;
}
