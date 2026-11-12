import { requirePage } from "@/lib/page-auth";
import LoginScreen from "@/components/login-screen";

export default async function Page() {
  await requirePage("/login");
  return <LoginScreen />;
}
