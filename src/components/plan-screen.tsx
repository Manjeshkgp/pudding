"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { CheckmarkIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { AVATARS } from "@/components/avatar-sheet";
import { Status, useAction, useRemote } from "@/components/app-ui";
import { postApi } from "@/lib/client-api";
import PayPalSuccessScreen from "@/components/connecting-screen";
import {
  subscriptionPlans,
  type SubscriptionPlanKey,
} from "@/lib/subscription-plans";

const Lottie = dynamic(() => import("lottie-react").then((m) => m.Lottie), {
  ssr: false,
});

const PLANS = [
  {
    id: "annual",
    name: "Yearly plan",
    sub: `$${subscriptionPlans.annual.amount} billed yearly`,
    price: `$${(Number(subscriptionPlans.annual.amount) / 12).toFixed(2)}`,
    tag: "Save 30%",
  },
  {
    id: "monthly",
    name: "Monthly plan",
    sub: `$${subscriptionPlans.monthly.amount} billed monthly`,
    price: `$${subscriptionPlans.monthly.amount}`,
    tag: null,
  },
] as const;

const GET = [
  {
    title: "Earn",
    items: [
      "Smart money app that grows with your kid.",
      "Set allowances and reward completed chores.",
      "Move allowance between Spend and Save.",
      "Track savings goals.",
    ],
  },
  { title: "Spend", items: ["Parental spending controls.", "Review purchase requests."] },
];

const path = "/api/onboarding/subscription";
type CheckoutResult = {
  nextRoute?: string;
  approvalUrl?: string;
  status?: string;
  planKey?: SubscriptionPlanKey;
};

export default function PlanScreen({ paypalReturn }: { paypalReturn?: string }) {
  const router = useRouter();
  const remote = useRemote<{ subscription: { status: string; planKey: SubscriptionPlanKey } | null }>(path);
  const action = useAction();
  const [confirmedPlan, setConfirmedPlan] = useState<SubscriptionPlanKey | null>(null);
  const [approvalPending, setApprovalPending] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [chosen, setChosen] = useState<SubscriptionPlanKey | null>(null);
  const checkedOnReturn = useRef(false);
  const previous = remote.data?.subscription;
  const selected = chosen ?? previous?.planKey ?? "annual";

  function proceed(result: CheckoutResult) {
    if (result.status === "ACTIVE" && result.planKey) {
      setConfirmedPlan(result.planKey);
    } else if (result.nextRoute) {
      router.replace(result.nextRoute);
      router.refresh();
    } else if (result.approvalUrl) {
      window.location.assign(result.approvalUrl);
    }
  }

  function checkApproval() {
    void action.run(async () => {
      const result = await postApi<CheckoutResult>(path, { action: "confirm" });
      if (result.nextRoute) {
        proceed(result);
        return;
      }
      remote.reload();
      if (result.status === "APPROVAL_PENDING" || result.status === "APPROVED") {
        setApprovalPending(true);
        return;
      }
      setApprovalPending(false);
      throw new Error("PayPal hasn’t activated your trial. Choose a plan to try again.");
    });
  }

  useEffect(() => {
    if (checkedOnReturn.current || (paypalReturn !== "returned" && previous?.status !== "ACTIVE")) return;
    checkedOnReturn.current = true;
    checkApproval();
  }, [paypalReturn, previous?.status]);

  function startCheckout() {
    void action.run(async () => {
      setApprovalPending(false);
      const result = await postApi<CheckoutResult>(path, {
        action: "start",
        plan: selected,
      });
      if (!result.nextRoute && !result.approvalUrl) {
        remote.reload();
        if (result.status === "APPROVAL_PENDING" || result.status === "APPROVED") {
          setApprovalPending(true);
          return;
        }
        throw new Error("PayPal couldn’t open your checkout. Try again.");
      }
      proceed(result);
    });
  }

  const [me, setMe] = useState(0);
  const reduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 330);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    try {
      const i = Number(sessionStorage.getItem("pudding-avatar"));
      if (Number.isInteger(i) && AVATARS[i]) setMe(i);
    } catch {}
  }, []);

  if (confirmedPlan) {
    return (
      <PayPalSuccessScreen
        title="Your Pudding trial is active"
        description={`One month free, then ${subscriptionPlans[confirmedPlan].billing}. Connect your spending wallet next.`}
        label="Continue"
        busy={continuing}
        onContinue={() => {
          setContinuing(true);
          window.location.replace("/api/auth/navigation/refresh?returnTo=%2Fonboarding");
        }}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-white">
      {/* Top bar stays on screen; it turns white once the sky has scrolled away */}
      <div
        className={`fixed inset-x-0 top-0 z-20 px-4 pb-3 pt-[max(20px,env(safe-area-inset-top))] transition-colors duration-200 ${
          scrolled ? "bg-white" : "bg-transparent"
        }`}
      >
        <div className="flex h-11 items-center justify-between">
          <Link
            href="/onboarding/children"
            aria-label="Back"
            className="flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
          >
            <ChevronLeftIcon className="size-6 text-black" />
          </Link>
          <span
            aria-hidden="true"
            className="size-11 overflow-hidden rounded-full"
            style={{ backgroundColor: AVATARS[me].bg }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={AVATARS[me].src} alt="" className="size-full" />
          </span>
        </div>
      </div>

      {/* Sky, sun and clouds from Figma, with the flying cat on top. The stage is the 402 px phone frame, centered. */}
      <div className="relative h-[420px] w-full overflow-hidden bg-[linear-gradient(#ffd7ef_0,#ffd7ef_255px,#fff_255px)]">
        <div className="absolute left-1/2 top-0 h-full w-[402px] -translate-x-1/2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/plan/bg.svg"
            alt=""
            className="pointer-events-none absolute -left-1 -top-[1.35px] h-[385px] w-[410px] max-w-none"
          />
          <div
            className="pointer-events-none absolute left-[77.57px] top-[170.82px] size-[249px]"
            aria-hidden="true"
          >
            <Lottie
              src="/lottie/plan-cat.json"
              loop={!reduceMotion}
              autoplay
              segment={reduceMotion ? [0, 1] : undefined}
              className="size-full"
            />
          </div>
        </div>
      </div>

      <div className="relative -mt-[22px] flex flex-col gap-10 px-4 pb-[170px]">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col items-center gap-6">
            <div className="flex h-6 items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/pudding-wordmark.svg" alt="Pudding" className="h-5 w-auto" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/plan/plus.svg" alt="Plus" className="h-6 w-[41px]" />
            </div>
            <h1 className="text-center font-display text-4xl font-bold leading-[44px] tracking-[-0.54px] text-black">
              Manage and teach your kid finance
            </h1>
          </div>

          <div role="radiogroup" aria-label="Plan" className="flex flex-col gap-5">
            {PLANS.map((p) => {
              const on = selected === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setChosen(p.id)}
                  disabled={action.busy}
                  className={`relative flex w-full items-start justify-between rounded-[20px] border-2 text-left transition-colors ${
                    p.tag ? "pb-5 pl-5 pr-5 pt-8" : "p-5"
                  } ${
                    on
                      ? "border-[#0e8345] bg-[#eaf6ed]"
                      : "border-[#a6a6a6] bg-white"
                  }`}
                >
                  {p.tag && (
                    <span className="absolute -top-0.5 left-[19px] whitespace-pre rounded-b-xl bg-[#0e8345] px-2.5 py-1.5 text-[13px] font-medium leading-[15px] tracking-[-0.13px] text-white">
                      {p.tag}
                    </span>
                  )}
                  <span className="flex w-[151px] flex-col">
                    <span className="font-display text-xl font-bold leading-7 tracking-[-0.3px] text-black">
                      {p.name}
                    </span>
                    <span className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-[#5e5e5e]">
                      {p.sub}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <span className="font-display text-xl font-bold leading-7 tracking-[-0.3px] text-black">
                      {p.price}
                    </span>
                    <span className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-[#5e5e5e]">
                      /mon
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {(paypalReturn === "cancelled" || action.error || remote.error || approvalPending || previous) && (
            <div className="flex flex-col gap-2">
              {paypalReturn === "cancelled" && (
                <p role="status" className="rounded-2xl bg-[#eff4fe] p-4 text-sm">
                  Checkout was cancelled. Choose a plan to continue.
                </p>
              )}
              {approvalPending && !action.error && (
                <p role="status" className="rounded-2xl bg-[#eff4fe] p-4 text-sm">
                  PayPal is still confirming your trial. Check approval again when you’re ready.
                </p>
              )}
              <Status error={action.error || remote.error} />
              {previous && (
                <button
                  type="button"
                  onClick={checkApproval}
                  disabled={action.busy}
                  className="self-start text-sm font-semibold underline"
                >
                  Check PayPal approval
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-[19px]">
          <h2 className="font-display text-2xl font-bold leading-8 tracking-[-0.48px] text-black">
            What you get
          </h2>
          {GET.map((g) => (
            <section key={g.title} className="flex flex-col gap-4 rounded-[20px] bg-[#eff4fe] p-5">
              <h3 className="text-xl font-semibold leading-7 tracking-[-0.15px] text-black">
                {g.title}
              </h3>
              <ul className="flex flex-col gap-3">
                {g.items.map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="flex h-[25px] w-6 shrink-0 items-center justify-center">
                      <CheckmarkIcon className="size-6 text-[#0e8345]" />
                    </span>
                    <span className="min-w-0 flex-1 text-[17px] leading-[25px] tracking-[-0.17px] text-black">
                      {t}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4 text-[13px] leading-[18px] tracking-[-0.13px] text-black underline">
          <Link href="/legal/terms?returnTo=/onboarding/plan">Terms of Use</Link>
          <Link href="/legal/privacy?returnTo=/onboarding/plan">Privacy Policy</Link>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 px-2 pb-[max(32px,env(safe-area-inset-bottom))] pt-4">
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-[#f3f3f3] px-2 py-3">
          <p className="text-center text-[13px] leading-[18px] tracking-[-0.13px] text-[#5e5e5e]">
            $0 today, then {subscriptionPlans[selected].billing}. Cancel in PayPal.
          </p>
          <button
            type="button"
            disabled={action.busy || remote.loading}
            aria-busy={action.busy}
            onClick={startCheckout}
            className="relative flex h-[52px] w-full items-center justify-center rounded-full bg-black px-12 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white disabled:opacity-50"
          >
            {action.busy
              ? "Please wait…"
              : previous?.status === "APPROVAL_PENDING" && previous.planKey === selected
                ? "Resume PayPal checkout"
                : "Start 1 month free trial"}
            <ChevronRightIcon className="absolute right-5 top-1/2 size-6 -translate-y-1/2 text-white" />
          </button>
        </div>
      </div>
    </main>
  );
}
