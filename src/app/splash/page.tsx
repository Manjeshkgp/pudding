import { requirePage } from "@/lib/page-auth";
import SplashScreen from "@/components/splash-screen";

export default async function SplashPage() {
  await requirePage("/splash");
  return <SplashScreen />;
}
