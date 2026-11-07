import Link from "next/link";
import TopBar from "@/components/top-bar";
import { ChevronRightIcon } from "@/components/icons";

const LINKS = [
  { label: "Parent and Guardian Agreement", href: "/legal/guardian" },
  { label: "Payment and Refund Policy", href: "/legal/payments" },
  { label: "Contact support", href: "/legal/support" },
];

export default function SetupScreen() {
  return (
    <main className="min-h-dvh bg-white">
      <div className="flex min-h-dvh w-full flex-col bg-white">
        <TopBar backHref="/parent" />

        <header className="flex flex-col gap-2 px-4 pb-8 pt-6">
          <h1 className="font-display text-[32px] font-bold leading-[40px] tracking-[-0.64px] text-black">
            Set up your pudding
          </h1>
          <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
            Give your kids the confidence to make money their own.
          </p>
        </header>

        <section className="flex flex-col gap-6 px-4 tracking-[-0.17px]">
          <p className="text-[17px] leading-[25px] text-black">
            By continuing, you agree to the{" "}
            <Link href="/legal/terms" className="font-medium leading-[22px] text-[#276ef1]">
              Pudding Terms &amp; Conditions
            </Link>{" "}
            and acknowledge the{" "}
            <Link href="/legal/privacy" className="font-medium leading-[22px] text-[#276ef1]">
              Privacy Notice
            </Link>
            . If you are setting up an account for a child, you confirm that you
            are their parent or legal guardian and are authorised to provide the
            required consent.
          </p>
          <div className="flex flex-col gap-4">
            {LINKS.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="text-[17px] font-medium leading-[22px] text-[#276ef1]"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>

        <div className="mt-auto px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
          <Link
            href="/email"
            className="relative flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white"
          >
            Continue
            <ChevronRightIcon className="absolute right-5 top-1/2 size-6 -translate-y-1/2 text-white" />
          </Link>
        </div>
      </div>
    </main>
  );
}
