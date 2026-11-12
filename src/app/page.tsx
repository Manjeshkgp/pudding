import { requirePage } from "@/lib/page-auth";
import SplashScreen from "@/components/splash-screen";

export default async function HomePage() {
  await requirePage("/");
  return <SplashScreen />;
}
