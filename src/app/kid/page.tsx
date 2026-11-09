import LoginScreen from "@/components/login-screen";

// Kid login. Sample only: nothing is checked, any username and an
// 8+ character password signs in.
export default function Page() {
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
        sampleError: true,
        forgotHref: "/kid/forgot",
      }}
    />
  );
}
