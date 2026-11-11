import { requirePage } from "@/lib/page-auth";
import KidForgot from "@/components/kid-forgot-screen";

export default async function Page() {
  await requirePage("/kid/forgot");
  return <KidForgot />;
}
