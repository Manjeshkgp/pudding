import { requirePage } from "@/lib/page-auth";
import ParentWelcome from "@/components/parent-welcome";

export default async function ParentPage() {
  await requirePage("/parent");
  return <ParentWelcome />;
}
