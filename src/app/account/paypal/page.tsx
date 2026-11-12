import { requirePage } from "@/lib/page-auth";
import PaypalScreen from "@/components/paypal-screen";
export default async function Page() {
  await requirePage("/account/paypal");
  return <PaypalScreen />;
}
