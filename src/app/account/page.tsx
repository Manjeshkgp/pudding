import { requirePage } from "@/lib/page-auth";
import AccountScreen from "@/components/account-screen";

export default async function Page() {
  await requirePage("/account");
  return <AccountScreen />;
}
