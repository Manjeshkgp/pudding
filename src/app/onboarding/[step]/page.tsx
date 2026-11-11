import { notFound } from "next/navigation";
import { requirePage } from "@/lib/page-auth";
import SetupScreen from "@/components/setup-screen";
import EmailScreen from "@/components/email-screen";
import VerifyScreen from "@/components/verify-screen";
import PasswordScreen from "@/components/password-screen";
import NotificationsScreen from "@/components/notifications-screen";
import SecurityScreen from "@/components/security-screen";
import ProfileScreen from "@/components/profile-screen";
import AddKidScreen from "@/components/add-kid-screen";
import CrewScreen from "@/components/crew-screen";
import PaypalScreen from "@/components/paypal-screen";
import PinScreen from "@/components/pin-screen";
export default async function Page({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  if (
    ![
      "setup",
      "email",
      "verify",
      "password",
      "notifications",
      "security",
      "security-2",
      "profile",
      "add-kid",
      "children",
      "paypal",
      "pin",
    ].includes(step)
  )
    notFound();
  await requirePage(`/onboarding/${step}`);
  switch (step) {
    case "setup":
      return <SetupScreen />;
    case "email":
      return <EmailScreen />;
    case "verify":
      return <VerifyScreen />;
    case "password":
      return <PasswordScreen />;
    case "notifications":
      return <NotificationsScreen />;
    case "security":
      return <SecurityScreen />;
    case "security-2":
      return <SecurityScreen step={2} />;
    case "profile":
      return <ProfileScreen returnTo="/onboarding/add-kid" />;
    case "add-kid":
      return <AddKidScreen mode="onboarding" />;
    case "children":
      return <CrewScreen mode="onboarding" />;
    case "paypal":
      return <PaypalScreen mode="onboarding" />;
    case "pin":
      return <PinScreen />;
  }
}
