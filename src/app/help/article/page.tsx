import { redirect } from "next/navigation";

// Old address, kept so earlier links still work
export default function Page() {
  redirect("/help/account/account-recovery-claim-process");
}
