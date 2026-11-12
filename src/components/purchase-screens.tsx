"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ListEnd, usePagedList } from "@/components/paged-list";
import { frequencyLabels, taskFrequencies } from "@/lib/chore-period";
import { taskSubmissionPath } from "@/lib/navigation-policy";
import { AlertCircleIcon, SpinnerIcon } from "@/components/icons";
import {
  AppScreen,
  Card,
  Button,
  Field,
  Select,
  Status,
  Empty,
  ActionLink,
  useRemote,
  useAction,
} from "@/components/app-ui";
import { Me, Purchase, money, readable } from "@/lib/app-types";
import {
  ChoreEvidenceReview,
  ChoreSubmissionView,
} from "@/components/chore-proof-screen";
import { postApi } from "@/lib/client-api";

const titles: Record<string, string> = {
  CREATED: "Your invoice",
  REVIEWING: "Reviewing your purchase",
  APPROVED: "Purchase approved",
  WAITING_PARENT: "Waiting for your parent",
  AI_BLOCKED: "Let’s pause this purchase",
  DECLINED: "Purchase declined",
  PROCESSING: "Confirming your payment",
  PAID: "All paid!",
  PAYMENT_FAILED: "Payment needs attention",
};

// Invoices are shared across roles. Keep the stored reason for the child and
// adapt known guidance for parents, including invoices created earlier.
const parentDecisionReasons: Record<string, string> = {
  "Your parent needs to allocate more Spend allowance before this purchase can be paid.":
    "This child needs more Spend allowance before payment can go through.",
  "Your family spending limit is used up. Your parent needs to add a top-up.":
    "The available family spending limit is too low for this purchase.",
  "Your parent needs to review scanned purchases.":
    "Scanned purchases are set to require parent approval.",
  "Your parent reviews every purchase.":
    "The daily limit is set to $0, so every purchase needs parent approval.",
  "AI review is unavailable or its free-tier quota was reached. Your parent will review this purchase.":
    "AI review is unavailable. Review this purchase manually.",
  "Approved by your parent.": "A parent approved this purchase.",
  "Your parent declined this purchase.": "A parent declined this purchase.",
};

function purchaseReason(reason: string | null, parent: boolean) {
  return parent && reason && Object.hasOwn(parentDecisionReasons, reason)
    ? parentDecisionReasons[reason]
    : reason;
}

const missingReviewReason =
  "This purchase was sent for manual review without a recorded reason.";
type AllowanceConfirmation = { amount: string; currency: string };

function AllowanceApprovalDialog({
  quote,
  reason,
  busy,
  error,
  onApprove,
  onDecline,
  onClose,
}: {
  quote: AllowanceConfirmation;
  reason: string;
  busy: boolean;
  error: string;
  onApprove: () => void;
  onDecline: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="allowance-approval-title"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[420px] overflow-y-auto rounded-[32px] bg-white p-6 text-black shadow-xl backdrop:bg-black/50"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="flex flex-col gap-4">
        <h2
          id="allowance-approval-title"
          className="font-display text-2xl font-bold"
        >
          Add Spend allowance and pay?
        </h2>
        <p className="text-sm text-[#5e5e5e]">{reason}</p>
        <p>
          This child is {money(quote.amount, quote.currency)} short. Approving
          allocates that amount from your available family budget to their Spend
          wallet, then attempts the PayPal Sandbox payment.
        </p>
        <p className="text-sm text-[#5e5e5e]">
          Spending limits stay the same. The allocation stays in Spend if the
          payment doesn’t complete.
        </p>
        <Status error={error} />
        <Button busy={busy} onClick={onApprove}>
          Approve, allocate & pay
        </Button>
        <Button secondary disabled={busy} onClick={onDecline}>
          Decline purchase
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="self-center px-4 py-2 underline"
        >
          Not now
        </button>
      </div>
    </dialog>
  );
}

function PurchaseErrorToast({
  message,
  embedded,
}: {
  message: string;
  embedded: boolean;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 8000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 ${embedded ? "bottom-[calc(10rem+env(safe-area-inset-bottom))]" : "bottom-[max(24px,env(safe-area-inset-bottom))]"}`}
    >
      <div className="pointer-events-auto flex w-full max-w-[488px] items-start gap-3 rounded-2xl bg-black p-4 text-sm text-white shadow-lg">
        <AlertCircleIcon className="size-6 shrink-0" />
        <p role="alert" className="flex-1">
          {message}
        </p>
        <button
          type="button"
          aria-label="Dismiss error"
          onClick={() => setVisible(false)}
          className="shrink-0 px-2 text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function PurchaseScreen({
  id,
  initialPurchase,
  parent,
  embedded = false,
  onBusyChange,
}: {
  id: string;
  initialPurchase?: Purchase;
  parent: boolean;
  embedded?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [current, setCurrent] = useState<Purchase | null>(
    initialPurchase || null,
  );
  const [phase, setPhase] = useState<"decision" | "payment" | null>(null);
  const [allowanceConfirmation, setAllowanceConfirmation] =
    useState<AllowanceConfirmation | null>(null);
  const submitting = useRef(false);
  const pending =
    current &&
    ["REVIEWING", "WAITING_PARENT", "PROCESSING"].includes(current.status);
  const invoice = useRemote<{ purchase: Purchase }>(
    `/api/purchases/${id}`,
    pending ? 4000 : 0,
    true,
  );
  const action = useAction();
  useEffect(() => {
    onBusyChange?.(action.busy);
    return () => onBusyChange?.(false);
  }, [action.busy, onBusyChange]);
  const p = current;
  const statusTitle =
    p &&
    (parent && p.status === "WAITING_PARENT"
      ? "Needs parent approval"
      : titles[p.status]);
  useEffect(() => {
    if (invoice.data?.purchase.id === id && !submitting.current)
      setCurrent(invoice.data.purchase);
  }, [invoice.data, id]);
  // Invoice creation is read-only until the child explicitly taps Pay.
  function pay() {
    if (!p || submitting.current) return;
    submitting.current = true;
    void action.run(async () => {
      try {
        let next = p;
        if (["CREATED", "REVIEWING"].includes(next.status)) {
          setPhase("decision");
          next = (
            await postApi<{ purchase: Purchase }>(
              `/api/purchases/${id}/decision`,
              {},
            )
          ).purchase;
          setCurrent(next);
        }
        if (
          (next.status === "APPROVED" && next.aiDecision === "APPROVE") ||
          (next.status === "PAYMENT_FAILED" && next.aiDecision === "APPROVE") ||
          next.status === "PROCESSING"
        ) {
          setPhase("payment");
          next = (
            await postApi<{ purchase: Purchase }>(
              `/api/purchases/${id}/pay`,
              {},
            )
          ).purchase;
          setCurrent(next);
        }
      } finally {
        submitting.current = false;
        setPhase(null);
        invoice.reload();
      }
    });
  }
  function review(approve: boolean, confirmedAllowance?: string) {
    void action.run(async () => {
      const result = await postApi<
        | { purchase: Purchase }
        | { allowanceConfirmation: AllowanceConfirmation }
      >(`/api/purchases/${id}/review`, {
        action: approve ? "APPROVE" : "DECLINE",
        confirmedAllowance,
      });
      if ("allowanceConfirmation" in result) {
        setAllowanceConfirmation(result.allowanceConfirmation);
        return;
      }
      setAllowanceConfirmation(null);
      setCurrent(result.purchase);
      invoice.reload();
    });
  }
  const content = (
    <>
      <Status error={invoice.error} loading={!p && invoice.loading} />
      {action.error && !action.busy && !allowanceConfirmation && (
        <PurchaseErrorToast
          key={action.error}
          message={action.error}
          embedded={embedded}
        />
      )}
      {allowanceConfirmation && (
        <AllowanceApprovalDialog
          quote={allowanceConfirmation}
          reason={
            purchaseReason(p?.decisionReason ?? null, true) ||
            missingReviewReason
          }
          busy={action.busy}
          error={action.error}
          onApprove={() => review(true, allowanceConfirmation.amount)}
          onDecline={() => review(false)}
          onClose={() => {
            setAllowanceConfirmation(null);
            action.setError("");
          }}
        />
      )}
      {p && (
        <>
          <Card>
            <img
              src={`/api/purchases/${p.id}/qr`}
              alt="QR containing this demo invoice, items and prices"
              className="mx-auto w-full max-w-[260px]"
            />
            <p className="text-center text-sm text-[#5e5e5e]">
              Demo invoice QR · not a PayPal payment link
            </p>
            <div className="flex justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold">INVOICE</h2>
                <p className="mt-1 text-sm text-[#5e5e5e]">Pudding Sandbox</p>
              </div>
              <img
                src="/images/playful/reciept-1.svg"
                alt=""
                className="size-12"
              />
            </div>
            <p className="break-all text-xs text-[#5e5e5e]">#{p.id}</p>
            <div className="flex justify-between text-sm">
              <span>Bill to {p.child?.name || (parent ? "child" : "you")}</span>
              <time>{new Date(p.createdAt).toLocaleDateString()}</time>
            </div>
            <div className="border-y border-[#e8e8e8] py-3">
              <div className="mb-3 grid grid-cols-[1fr_32px_66px_70px] gap-1 text-xs text-[#5e5e5e]">
                <span>Item</span>
                <span>Qty</span>
                <span>Price</span>
                <span className="text-right">Amount</span>
              </div>
              {p.items.map((item, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_32px_66px_70px] gap-1 py-3 text-sm"
                >
                  <span>
                    {item.name}
                    <span className="block text-xs text-[#5e5e5e]">
                      {item.category}
                    </span>
                  </span>
                  <span>{item.quantity}</span>
                  <span>{money(item.unitPrice, p.currency)}</span>
                  <span className="text-right">
                    {money(Number(item.unitPrice) * item.quantity, p.currency)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm text-[#5e5e5e]">
              <span>Subtotal</span>
              <span>{money(p.amount, p.currency)}</span>
            </div>
            <div className="flex justify-between font-display text-2xl font-bold">
              <span>Total</span>
              <span>{money(p.amount, p.currency)}</span>
            </div>
          </Card>
          <Card
            className={
              p.status === "AI_BLOCKED" || p.status === "PAYMENT_FAILED"
                ? "bg-[#fff0ee]"
                : "bg-[#f3f3f3]"
            }
          >
            <p className="font-display text-xl font-bold">{statusTitle}</p>
            {parent && p.status === "WAITING_PARENT" && (
              <p className="text-sm font-semibold">
                Why this needs your approval
              </p>
            )}
            <p>
              {purchaseReason(p.decisionReason, parent) ||
                (p.status === "WAITING_PARENT"
                  ? missingReviewReason
                  : parent
                    ? "Review the invoice items and total."
                    : "Check your items and total, then tap Pay to review this purchase.")}
            </p>
            {action.busy && (
              <div
                role="status"
                aria-live="polite"
                className="flex min-h-24 flex-col items-center justify-center gap-3 text-center"
              >
                <SpinnerIcon className="size-8 motion-reduce:animate-none" />
                <p>
                  {phase === "decision"
                    ? "Checking your purchase…"
                    : phase === "payment"
                      ? "Confirming your payment…"
                      : "Updating your purchase…"}
                </p>
              </div>
            )}
          </Card>
          {parent &&
            ["WAITING_PARENT", "APPROVED", "PAYMENT_FAILED"].includes(
              p.status,
            ) && (
              <>
                <p className="text-sm text-[#5e5e5e]">
                  Approval charges the primary parent’s saved PayPal Sandbox
                  wallet. A top-up only changes your internal limit.
                </p>
                <Button busy={action.busy} onClick={() => review(true)}>
                  Approve & pay {money(p.amount)}
                </Button>
                <Button
                  busy={action.busy}
                  secondary
                  onClick={() => review(false)}
                >
                  Decline
                </Button>
                <ActionLink href={`/allowances?childId=${p.childId}`}>
                  Manage this child's allowance
                </ActionLink>
                <ActionLink href="/topup">Increase family limit</ActionLink>
              </>
            )}
          {p.status === "PROCESSING" && (
            <Button
              busy={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await postApi(`/api/purchases/${id}/pay`, {});
                  invoice.reload();
                })
              }
            >
              Check payment confirmation
            </Button>
          )}
          {!parent &&
            (p.status === "CREATED" ||
              p.status === "REVIEWING" ||
              (["APPROVED", "PAYMENT_FAILED"].includes(p.status) &&
                p.aiDecision === "APPROVE")) && (
              <Button busy={action.busy} onClick={pay}>
                {p.status === "REVIEWING"
                  ? "Check review status"
                  : p.status === "PAYMENT_FAILED"
                    ? "Retry payment"
                    : `Pay ${money(p.amount, p.currency)}`}
              </Button>
            )}
          {parent && p.status === "PAYMENT_FAILED" && (
            <ActionLink href="/account/paypal">
              Authorize your saved wallet again
            </ActionLink>
          )}
          {p.status === "PAID" && (
            <ActionLink href={parent ? "/activity" : "/money"}>
              View your activity
            </ActionLink>
          )}
        </>
      )}
    </>
  );
  return embedded ? (
    content
  ) : (
    <AppScreen
      title={statusTitle || "Your invoice"}
      back={parent ? "/approvals" : "/home"}
      color={p?.status === "PAID" ? "#a0e1e1" : "#fff"}
    >
      {content}
    </AppScreen>
  );
}
function FeedSwitcher({
  options,
}: {
  options: { label: string; href: string; active: boolean }[];
}) {
  return (
    <nav
      aria-label="View"
      className="grid grid-cols-2 gap-1 rounded-full bg-[#f3f3f3] p-1"
    >
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.active ? "page" : undefined}
          replace
          scroll={false}
          className={`rounded-full px-4 py-3 text-center font-semibold ${option.active ? "bg-black text-white" : "text-black"}`}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

type Submission = ChoreSubmissionView & {
  child: { name: string };
  chore: {
    id: string;
    title: string;
    rewardAmount: string;
    recurrence: string;
  };
};
function TaskSubmissions() {
  const [recurrence, setRecurrence] = useState("");
  const [status, setStatus] = useState("");
  const query = new URLSearchParams();
  if (recurrence) query.set("recurrence", recurrence);
  if (status) query.set("status", status);
  const list = usePagedList<Submission>(`/api/chore-submissions?${query}`);
  const action = useAction();
  function review(id: string, approve: boolean) {
    void action.run(async () => {
      const { submission } = await postApi<{ submission: ChoreSubmissionView }>(
        `/api/chore-submissions/${id}/review`,
        { decision: approve ? "APPROVE" : "REJECT" },
      );
      list.updateItems((items) =>
        items.flatMap((item) =>
          item.id !== id
            ? [item]
            : !status || status === submission.status
              ? [{ ...item, ...submission }]
              : [],
        ),
      );
    }, "Task reviewed.");
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Repeat" value={recurrence} onChange={setRecurrence}>
          <option value="">All frequencies</option>
          {taskFrequencies.map((frequency) => (
            <option key={frequency} value={frequency}>
              {frequencyLabels[frequency]}
            </option>
          ))}
        </Select>
        <Select label="Status" value={status} onChange={setStatus}>
          <option value="">All submissions</option>
          <option value="PENDING">Needs review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Asked to redo</option>
        </Select>
      </div>
      <Status
        loading={list.loading}
        error={list.error || action.error}
        notice={action.notice}
      />
      {!list.loading && !list.error && !list.items.length && (
        <Empty>No matching task submissions.</Empty>
      )}
      {list.items.map((submission) => (
        <Card key={submission.id}>
          <Link
            href={taskSubmissionPath(submission.id)}
            className="self-start font-semibold underline underline-offset-4"
          >
            {submission.child.name} · {submission.chore.title}
          </Link>
          <p className="text-sm text-[#5e5e5e]">
            {
              frequencyLabels[
                submission.chore.recurrence as keyof typeof frequencyLabels
              ]
            }{" "}
            · {new Date(submission.submittedAt).toLocaleString()}
          </p>
          <p>
            Reward:{" "}
            {money(
              submission.rewardAmountPaid ?? submission.chore.rewardAmount,
            )}
          </p>
          {submission.status === "PENDING" && !submission.aiReason && (
            <p className="text-sm">
              {submission.aiStatus === "REVIEWING"
                ? "The evidence review is still in progress."
                : "This task hasn’t been automatically approved. Review the evidence to decide."}
            </p>
          )}
          <ChoreEvidenceReview submission={submission} />
          {submission.status === "PENDING" && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                busy={action.busy}
                onClick={() => review(submission.id, true)}
              >
                Approve
              </Button>
              <Button
                secondary
                busy={action.busy}
                onClick={() => review(submission.id, false)}
              >
                Ask to redo
              </Button>
            </div>
          )}
        </Card>
      ))}
      <ListEnd list={list} />
    </>
  );
}

function PurchaseList({ approvals = false }: { approvals?: boolean }) {
  const list = usePagedList<Purchase>(
    approvals ? "/api/purchases?view=approvals" : "/api/purchases",
  );
  return (
    <>
      <Status loading={list.loading} error={list.error} />
      {!list.loading && !list.error && !list.items.length && (
        <Empty>
          {approvals
            ? "No purchases need your attention."
            : "Your purchases will appear here."}
        </Empty>
      )}
      {list.items.map((purchase) =>
        approvals ? (
          <Card key={purchase.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{purchase.child?.name}</span>
              <span className="font-display text-2xl font-bold">
                {money(purchase.amount, purchase.currency)}
              </span>
            </div>
            <p>
              {purchaseReason(purchase.decisionReason, true) ||
                missingReviewReason}
            </p>
            <ActionLink href={`/purchases/${purchase.id}`}>
              Review invoice
            </ActionLink>
          </Card>
        ) : (
          <Link
            key={purchase.id}
            href={`/purchases/${purchase.id}`}
            className="flex items-center justify-between gap-3 rounded-3xl border border-[#e8e8e8] bg-white p-5"
          >
            <div>
              <p className="font-semibold">
                {purchase.child?.name || "Purchase"}
              </p>
              <p className="text-sm text-[#5e5e5e]">
                {readable(purchase.status)} ·{" "}
                {new Date(purchase.createdAt).toLocaleDateString()}
              </p>
            </div>
            <span className="font-display text-xl font-bold">
              {money(purchase.amount, purchase.currency)}
            </span>
          </Link>
        ),
      )}
      <ListEnd list={list} />
    </>
  );
}

export function ApprovalsScreen({ tab }: { tab: "purchases" | "tasks" }) {
  return (
    <AppScreen title="Your approval queue" role="USER">
      <FeedSwitcher
        options={[
          {
            label: "Purchases",
            href: "/approvals",
            active: tab === "purchases",
          },
          {
            label: "Tasks",
            href: "/approvals?tab=tasks",
            active: tab === "tasks",
          },
        ]}
      />
      {tab === "tasks" ? <TaskSubmissions /> : <PurchaseList approvals />}
    </AppScreen>
  );
}

function WalletActivity() {
  const list = usePagedList<{
    id: string;
    description: string;
    amount: string;
    direction: string;
    createdAt: string;
  }>("/api/transactions?view=feed");
  return (
    <>
      <Status loading={list.loading} error={list.error} />
      {!list.loading && !list.error && !list.items.length && (
        <Empty>No wallet activity yet.</Empty>
      )}
      {list.items.map((entry) => (
        <Card key={entry.id}>
          <p>{entry.description}</p>
          <div className="flex justify-between gap-3 text-sm">
            <time>{new Date(entry.createdAt).toLocaleString()}</time>
            <span>
              {entry.direction === "CREDIT" ? "+" : "−"}
              {money(entry.amount)}
            </span>
          </div>
        </Card>
      ))}
      <ListEnd list={list} />
    </>
  );
}

export function ActivityScreen({
  tab,
  path,
}: {
  tab: "purchases" | "wallet";
  path: "/activity" | "/money";
}) {
  const child = path === "/money";
  const me = useRemote<Me>(child ? "/api/auth/me" : null);
  const wallet = me.data?.child?.wallet;
  const currency = me.data?.family.currency;
  const [converting, setConverting] = useState(false);
  const [notice, setNotice] = useState("");
  const [activityVersion, setActivityVersion] = useState(0);
  return (
    <AppScreen
      title={child ? "Your money" : "Family activity"}
      back={child ? "/home" : "/family"}
    >
      <Status error={me.error} />
      {wallet && (
        <Card>
          <p>Spend allowance</p>
          <p className="font-display text-5xl font-bold">
            {money(
              Number(wallet.spendBalance) -
                Number(wallet.purchaseReservedBalance || 0),
              currency,
            )}
          </p>
          <ActionLink href="/scan">Scan a purchase</ActionLink>
          <ActionLink href="/savings">Your savings</ActionLink>
          <Button
            secondary
            onClick={() => {
              setNotice("");
              setConverting(true);
            }}
          >
            Move savings to Spend
          </Button>
          <Status notice={notice} />
        </Card>
      )}
      <FeedSwitcher
        options={[
          { label: "Purchases", href: path, active: tab === "purchases" },
          {
            label: "Wallet activity",
            href: `${path}?tab=wallet`,
            active: tab === "wallet",
          },
        ]}
      />
      {tab === "wallet" ? (
        <WalletActivity key={activityVersion} />
      ) : (
        <PurchaseList />
      )}
      {converting && me.data?.child && wallet && (
        <SavingsConversionDialog
          childId={me.data.child.id}
          savings={wallet.saveBalance}
          frozen={wallet.isFrozen}
          currency={currency}
          onClose={() => setConverting(false)}
          onDone={(amount) => {
            me.reload();
            setActivityVersion((version) => version + 1);
            setNotice(`Moved ${money(amount, currency)} to Spend.`);
            setConverting(false);
          }}
        />
      )}
    </AppScreen>
  );
}
function SavingsConversionDialog({
  childId,
  savings,
  frozen,
  currency,
  onClose,
  onDone,
}: {
  childId: string;
  savings: string;
  frozen?: boolean;
  currency?: string;
  onClose: () => void;
  onDone: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");
  const action = useAction();
  const key = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const max = Math.min(10000, Number(savings));
  const canMove = !frozen && max > 0;
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="savings-conversion-title"
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[420px] overflow-y-auto rounded-[32px] bg-white p-6 text-black shadow-xl backdrop:bg-black/50"
      onCancel={(event) => {
        event.preventDefault();
        if (!action.busy) onClose();
      }}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canMove) return;
          void action.run(async () => {
            key.current ||= crypto.randomUUID();
            await postApi(`/api/wallets/${childId}/transfer`, {
              mode: "SAVE_TO_SPEND",
              amount: Number(amount),
              idempotencyKey: key.current,
            });
            onDone(Number(amount));
          });
        }}
      >
        <h2
          id="savings-conversion-title"
          className="font-display text-2xl font-bold"
        >
          Move savings to Spend
        </h2>
        <p>{money(savings, currency)} available in Savings</p>
        {canMove ? (
          <>
            <Field
              label={`Amount (${currency ?? "USD"})`}
              type="number"
              inputMode="decimal"
              min="0.01"
              max={max}
              step="0.01"
              required
              disabled={action.busy}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                key.current = null;
                action.setError("");
              }}
            />
            <Status error={action.error} />
            <Button type="submit" busy={action.busy} disabled={!amount}>
              Move to Spend
            </Button>
          </>
        ) : (
          <p className="text-sm text-[#5e5e5e]">
            {frozen
              ? "You can move savings when your parent unpauses your wallet."
              : "Once you have some savings, you can move them to Spend here."}
          </p>
        )}
        <Button type="button" secondary disabled={action.busy} onClick={onClose}>
          {canMove ? "Cancel" : "Close"}
        </Button>
      </form>
    </dialog>
  );
}
