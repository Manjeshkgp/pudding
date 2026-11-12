import { requirePage } from "@/lib/page-auth";
import { ForgotPasswordScreen } from "@/components/settings-screens";
export default async function Page() {
  await requirePage("/forgot-password");
  return <ForgotPasswordScreen />;
}
