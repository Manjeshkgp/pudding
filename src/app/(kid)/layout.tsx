import { SessionGate } from "@/components/app-ui";
import KidNav from "@/components/kid-nav";

// Screens of the signed-in kid. The bottom bar lives here so it stays put
// (and its pill can glide) when moving between screens.
export default function KidLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate role="CHILD">
      {children}
      <KidNav />
    </SessionGate>
  );
}
