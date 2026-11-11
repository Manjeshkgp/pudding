import { requirePage } from "@/lib/page-auth";
import LoginScreen from "@/components/login-screen";

// Child authentication uses username and a parent-created six-digit PIN.
export default async function Page() {
  await requirePage("/kid");
  return (
    <LoginScreen
      copy={{
        backHref: "/start",
        nextHref: "/home",
        title: "Look who’s back!",
        subtitle: "Ready to put those money skills to work?",
        focusedTitle: "Login to kid account",
        emailPlaceholder: "Enter your username",
        emailLabel: "Username",
        plainEmail: true,
        forgotHref: "/kid/forgot",
      }}
    />
  );
}
