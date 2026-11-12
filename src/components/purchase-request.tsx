"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import ParentHome from "@/components/parent-home";
import Keypad from "@/components/keypad";
import HelpLink from "@/components/help-link";
import PaypalMark from "@/components/paypal-mark";
import {
  ActionLink,
  AppScreen,
  Status,
  useAction,
  useRemote,
} from "@/components/app-ui";
import {
  AllowanceApprovalDialog,
  type AllowanceConfirmation,
} from "@/components/purchase-screens";
import {
  money,
  type Purchase,
  type PurchaseReviewDetails,
} from "@/lib/app-types";
import { postApi } from "@/lib/client-api";
import { canGoBack } from "@/lib/navigation-history";
import {
  canReviewPurchase,
  isWaitingForParent,
  purchaseReason,
  purchaseReviewPath,
} from "@/lib/purchase-review";
import { AVATARS } from "@/components/avatar-sheet";
import {
  ChevronLeftIcon,
  CloseIcon,
  QuestionCircleFilledIcon,
  QuestionCircleIcon,
  SpinnerIcon,
} from "@/components/icons";

type Step = "modal" | "review" | "pin";

function KidChip({
  size,
  child,
}: {
  size: "sm" | "md";
  child?: Purchase["child"];
}) {
  const avatar =
    AVATARS[Number(child?.avatar?.replace("avatar-", "")) - 1] ?? AVATARS[0];
  return (
    <span
      className={`flex items-center rounded-full bg-[#f3f3f3] px-3 py-2 ${size === "md" ? "gap-2.5" : "gap-2"}`}
    >
      <span className="relative size-8 shrink-0 overflow-hidden rounded-full bg-[#ffd7ef]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar.src}
          alt=""
          className="size-full"
        />
      </span>
      <span className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black">
        {child?.name ?? "Child"}
      </span>
    </span>
  );
}

function BlackButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[52px] w-full items-center justify-center rounded-full bg-black px-5 py-3.5 text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-white transition-opacity active:opacity-80 disabled:bg-[#f3f3f3] disabled:text-[#a6a6a6]"
    >
      {children}
    </button>
  );
}

function SoftButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#fff0ee] px-5 py-3.5 text-[17px] font-medium leading-[22px] text-[#de1135] transition-opacity active:opacity-80 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function PageHeader({
  title,
  onBack,
  color = "text-[#222]",
}: {
  title: string;
  onBack: () => void;
  color?: string;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 bg-white px-4 pb-3 pt-[max(20px,env(safe-area-inset-top))]">
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
      >
        <ChevronLeftIcon className="size-6" />
      </button>
      <h1
        className={`min-w-px flex-1 py-2.5 font-display text-xl font-semibold leading-[22px] tracking-[-0.2px] ${color}`}
      >
        {title}
      </h1>
      <HelpLink
        aria-label="Help"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
      >
        <QuestionCircleIcon className="size-6" />
      </HelpLink>
    </div>
  );
}

export default function PurchaseRequest({ id }: { id: string }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("modal");
  const [pin, setPin] = useState("");
  const [quote, setQuote] = useState<AllowanceConfirmation | null>(null);
  const [leaving, setLeaving] = useState(false);
  const action = useAction();
  const remote = useRemote<{
    purchase: Purchase;
    review: PurchaseReviewDetails & {
      queueHead?: { id: string; status: string } | null;
    };
  }>(`/api/purchases/${id}?view=review`, 12000, true);
  const purchase = remote.data?.purchase;
  const review = remote.data?.review;
  const earlier = review?.queueHead?.id !== id ? review?.queueHead : null;
  const reviewable = Boolean(purchase && canReviewPurchase(purchase.status) && !earlier);
  const modal = useRef<HTMLDialogElement>(null);

  function leave() {
    if (canGoBack(["/approve", purchaseReviewPath(id)])) router.back();
    else router.replace("/approvals");
  }

  function submit(approve: boolean, confirmedAllowance?: string) {
    if (approve && pin.length !== 6) return;
    void action.run(async () => {
      try {
        const response = await postApi<
          | { purchase: Purchase }
          | { allowanceConfirmation: AllowanceConfirmation }
        >(`/api/purchases/${id}/review`, {
          action: approve ? "APPROVE" : "DECLINE",
          ...(approve ? { pin, confirmedAllowance } : {}),
        });
        if ("allowanceConfirmation" in response) {
          setQuote(response.allowanceConfirmation);
          return;
        }
        setQuote(null);
        setPin("");
        setStep("review");
        if (canReviewPurchase(response.purchase.status)) {
          remote.reload();
        } else {
          setLeaving(true);
          router.replace(`/purchases/${id}`);
        }
      } catch (error) {
        setQuote(null);
        setPin("");
        throw error;
      }
    });
  }

  useEffect(() => {
    const element = modal.current;
    if (step !== "modal" || !reviewable || !element) return;
    element.showModal();
    return () => element.close();
  }, [step, reviewable]);

  useEffect(() => {
    if (earlier) {
      router.replace(earlier.status === "PROCESSING"
        ? `/purchases/${earlier.id}`
        : purchaseReviewPath(earlier.id));
    } else if (purchase && !reviewable) router.replace(`/purchases/${id}`);
  }, [earlier, id, purchase, reviewable, router]);

  function onKey(key: string) {
    if (action.busy || quote) return;
    if (key === "back") setPin((value) => value.slice(0, -1));
    else if (/^\d$/.test(key))
      setPin((value) => (value.length < 6 ? value + key : value));
    action.setError("");
  }

  useEffect(() => {
    if (step !== "pin" || !reviewable || !review?.canApprove) return;
    function down(event: KeyboardEvent) {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        action.busy ||
        quote
      )
        return;
      if (/^[0-9]$/.test(event.key) || event.key === "Backspace") {
        event.preventDefault();
        onKey(event.key === "Backspace" ? "back" : event.key);
      } else if (
        event.key === "Enter" &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        event.preventDefault();
        submit(true);
      }
    }
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });

  if (!purchase || !review || !reviewable || leaving) {
    return (
      <AppScreen title="Purchase request" back="/approvals" role="USER">
        <Status
          loading={
            remote.loading || leaving || Boolean(purchase && !reviewable)
          }
          error={remote.error}
        />
      </AppScreen>
    );
  }
  const amount = money(purchase.amount, purchase.currency);
  const available = money(review.availableSpend, purchase.currency);
  const decisionReason =
    purchaseReason(purchase.decisionReason, true) ??
    "This purchase needs a parent decision.";
  const flaggedByAI =
    isWaitingForParent(purchase.status) &&
    (purchase.aiDecision === "BLOCK" || purchase.status === "AI_BLOCKED");
  const reason = flaggedByAI
    ? `Flagged by AI. ${decisionReason}`
    : decisionReason;
  const shortfall = Number(review.availableSpend) < Number(purchase.amount);

  if (step === "modal") {
    return (
      <>
        <ParentHome />
        <dialog
          ref={modal}
          aria-labelledby="purchase-request-title"
          onCancel={(event) => {
            event.preventDefault();
            leave();
          }}
          className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-transparent backdrop:bg-black/60"
        >
          <div className="mx-auto flex min-h-full max-w-[520px] flex-col justify-end px-2 pb-[max(8px,env(safe-area-inset-bottom))]">
            <motion.div
              initial={reduceMotion ? false : { y: "100%" }}
              animate={{ y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col rounded-t-[32px] rounded-b-[clamp(32px,14vw,62px)] bg-[#de1135] drop-shadow-[0px_2px_17.2px_rgba(0,0,0,0.16)]"
            >
              <div className="flex items-center gap-2 p-4">
                <svg
                  className="size-6 shrink-0"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM11 16V18H13V16H11ZM11 6V14.5H13V6H11Z"
                    fill="#fff"
                  />
                </svg>
                <p className="min-w-px flex-1 text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-white">
                  {reason}
                </p>
              </div>

              <div className="relative flex flex-col gap-8 rounded-t-[32px] rounded-b-[clamp(32px,14vw,60px)] bg-white px-4 py-8">
                <h2
                  id="purchase-request-title"
                  className="pr-14 font-display text-2xl font-bold leading-8 tracking-[-0.48px] text-black"
                >
                  Purchase request
                </h2>

                <button
                  type="button"
                  aria-label="Close"
                  onClick={leave}
                  className="absolute right-4 top-7 flex size-11 items-center justify-center rounded-full bg-white shadow-[0px_8px_24px_0px_rgba(0,0,0,0.12)]"
                >
                  <CloseIcon className="size-6" />
                </button>

                <div className="flex flex-col items-center gap-[15px]">
                  <KidChip size="sm" child={purchase.child} />
                  <p className="font-display text-[72px] font-bold leading-[80px] tracking-[-1.08px] text-black">
                    {amount}
                  </p>
                </div>

                <div className="flex items-start gap-2 rounded-2xl bg-[#eff4fe] p-4">
                  <QuestionCircleIcon className="size-6 shrink-0" />
                  <div className="flex min-w-px flex-1 flex-col justify-center gap-1">
                    <p className="text-[17px] leading-[25px] tracking-[-0.17px] text-black">
                      {shortfall
                        ? "This bill exceeds the available Spending Allowance."
                        : "Spending Allowance available"}
                    </p>
                    <p className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-[#276ef1]">
                      {available}
                    </p>
                  </div>
                </div>

                <BlackButton onClick={() => setStep("review")}>
                  Review request
                </BlackButton>
              </div>
            </motion.div>
          </div>
        </dialog>
      </>
    );
  }

  if (step === "review") {
    return (
      <main className="min-h-dvh bg-white">
        <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col">
          <PageHeader
            title="Purchase request"
            color="text-black"
            onBack={() => setStep("modal")}
          />

          <div className="flex flex-col items-center gap-3 px-4 pt-10">
            <KidChip size="md" child={purchase.child} />
            <p className="font-display text-[64px] font-bold leading-[80px] tracking-[-0.96px] text-black">
              {amount}
            </p>
          </div>

          <div className="mt-[50px] flex flex-col gap-6 px-4 pb-[180px]">
            <div className="overflow-clip rounded-3xl border border-[#e8e8e8] bg-white">
              <div className="relative">
                <div className="flex items-start gap-3 border-b border-[#e8e8e8] px-4 py-3">
                  <PaypalMark className="size-11 shrink-0" />
                  <div className="flex flex-col gap-[5px]">
                    <p className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black">
                      Saved PayPal wallet
                    </p>
                    <p className="text-[13px] leading-[18px] tracking-[-0.13px] text-black">
                      Spending Allowance available {available}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#eff4fe] text-black">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M5 5H19C20.1 5 21 5.9 21 7V19H16.5L15 16.5H9L7.5 19H3V7C3 5.9 3.9 5 5 5ZM7 9V11H5V13H7V15H9V13H11V11H9V9H7ZM15 10.5A1.25 1.25 0 1 0 15 13A1.25 1.25 0 0 0 15 10.5ZM17.5 12.5A1.25 1.25 0 1 0 17.5 15A1.25 1.25 0 0 0 17.5 12.5Z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <p className="text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black">
                    To Pudding Sandbox merchant
                  </p>
                </div>
                <span className="absolute right-[25px] top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full border border-[#e8e8e8] bg-white p-3">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 4V19M12 19L6 13M12 19L18 13"
                      stroke="#000"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
              <div className="flex items-center gap-2 bg-[#a0e1e1] px-5 pb-4 pt-3">
                <QuestionCircleFilledIcon
                  className="size-5 shrink-0"
                  mark="#a0e1e1"
                  dot="#000"
                />
                <p className="min-w-px flex-1 text-[15px] font-medium leading-[19px] tracking-[-0.15px] text-black">
                  This payment uses the primary parent’s saved PayPal Sandbox
                  wallet.
                </p>
              </div>
            </div>

            <p className="rounded-2xl bg-[#fff0ee] p-4 text-sm text-[#a20d28]">
              {reason}
            </p>
            <Status error={action.error} />
            {purchase.status === "PAYMENT_FAILED" && (
              <ActionLink href="/account/paypal">
                Check your saved PayPal wallet
              </ActionLink>
            )}
            <div className="flex flex-col gap-4 rounded-3xl border border-[#e8e8e8] bg-white p-4 text-black">
              <p className="text-xl font-semibold leading-[25px] tracking-[-0.45px]">
                Bill details
              </p>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 gap-y-3 text-sm">
                <span>Items</span>
                <span className="text-right">Price</span>
                <span className="text-right">Amount</span>
                {purchase.items.map((item, index) => (
                  <BillLine
                    key={index}
                    item={item}
                    currency={purchase.currency}
                  />
                ))}
              </div>
              <div className="flex flex-col gap-4 border-t border-[#e8e8e8] pt-3">
                <div className="flex items-center justify-between text-[17px] font-medium leading-[22px] tracking-[-0.17px]">
                  <span>Subtotal</span>
                  <span>{amount}</span>
                </div>
                <div className="flex items-center justify-between text-xl font-semibold leading-7 tracking-[-0.15px]">
                  <span>Total</span>
                  <span>{amount}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-[520px] flex-col gap-2.5 bg-gradient-to-t from-white from-70% to-white/0 px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-6">
            {review.canApprove ? (
              <>
                {review.pinSet ? (
                  <BlackButton
                    disabled={action.busy}
                    onClick={() => {
                      action.setError("");
                      setStep("pin");
                    }}
                  >
                    {purchase.status === "PAYMENT_FAILED"
                      ? "Retry payment"
                      : "Approve"}
                  </BlackButton>
                ) : (
                  <ActionLink href="/account/security">
                    Set up your parent PIN
                  </ActionLink>
                )}
                <SoftButton
                  disabled={action.busy}
                  onClick={() => submit(false)}
                >
                  {action.busy ? "Declining…" : "Decline"}
                </SoftButton>
              </>
            ) : (
              <p className="rounded-2xl bg-[#f3f3f3] p-4 text-sm">
                A parent with spending approval access can respond to this
                request.
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col">
        <PageHeader
          title="Enter PIN"
          onBack={() => {
            if (action.busy) return;
            setPin("");
            action.setError("");
            setStep("review");
          }}
        />

        <div className="px-4 py-6">
          <div className="flex items-center gap-3 rounded-2xl bg-[#eff4fe] px-5 py-3">
            <PaypalMark className="size-10" />
            <div className="flex min-w-px flex-1 flex-col gap-[3px]">
              <p className="text-[17px] font-medium leading-[22px] tracking-[-0.17px] text-black">
                Pay {amount} to Pudding Sandbox merchant
              </p>
              <p className="text-[13px] leading-[18px] tracking-[-0.13px] text-black">
                from the primary parent’s saved PayPal wallet
              </p>
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-center gap-6 px-4 py-10"
          role="img"
          aria-label={`${pin.length} of 6 digits entered`}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`size-6 rounded-full border transition-colors ${i < pin.length ? "border-[#e8e8e8] bg-black" : "border-[#a6a6a6] bg-white"}`}
            />
          ))}
        </div>

        <div className="px-4">
          <Status error={action.error} />
        </div>
        {quote && (
          <AllowanceApprovalDialog
            quote={quote}
            reason={reason}
            busy={action.busy}
            error={action.error}
            onApprove={() => submit(true, quote.amount)}
            onDecline={() => submit(false)}
            onClose={() => {
              setQuote(null);
              setPin("");
            }}
          />
        )}
        <div className="mt-auto flex flex-col gap-8">
          <Keypad onKey={onKey} />
          <div className="px-4 pb-[max(40px,env(safe-area-inset-bottom))] pt-4">
            <BlackButton
              disabled={pin.length < 6 || action.busy || Boolean(quote)}
              onClick={() => submit(true)}
            >
              {action.busy ? (
                <SpinnerIcon className="size-6 text-white" aria-hidden />
              ) : (
                `Confirm ${amount}`
              )}
              {action.busy && (
                <span className="sr-only">Confirming payment</span>
              )}
            </BlackButton>
          </div>
        </div>
      </div>
    </main>
  );
}

function BillLine({
  item,
  currency,
}: {
  item: Purchase["items"][number];
  currency: string;
}) {
  return (
    <>
      <span>
        {item.name} × {item.quantity}
      </span>
      <span className="text-right">{money(item.unitPrice, currency)}</span>
      <span className="text-right">
        {money(Number(item.unitPrice) * item.quantity, currency)}
      </span>
    </>
  );
}
