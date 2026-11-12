import { requirePage } from "@/lib/page-auth";
import TypeOfUser from "@/components/type-of-user";

export default async function StartPage() {
  await requirePage("/start");
  return <TypeOfUser />;
}
