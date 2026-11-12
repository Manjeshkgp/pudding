"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ListEnd, usePagedList } from "@/components/paged-list";
import { frequencyLabels, taskFrequencies } from "@/lib/chore-period";
import { taskSubmissionPath } from "@/lib/navigation-policy";
import {
  canReviewPurchase,
  isWaitingForParent,
  purchaseReason,
  purchaseReviewPath,
} from "@/lib/purchase-review";
import { AlertCircleIcon, SpinnerIcon } from "@/components/icons";
import {
  AppScreen,
  Card,
  Button,
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
  CREATED: "Your bill",
  REVIEWING: "Reviewing your purchase",
  APPROVED: "Purchase approved",
  WAITING_PARENT: "Waiting for your parent",
  DECLINED: "Purchase declined",
  PROCESSING: "Confirming your payment",
  PAID: "All paid!",
  PAYMENT_FAILED: "Payment needs attention",
};

const missingReviewReason =
  "This purchase was sent for manual review without a recorded reason.";
export type AllowanceConfirmation = { amount: string; currency: string };

export function AllowanceApprovalDialog({
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
  const submitting = useRef(false);
  const pending =
    current &&
    (isWaitingForParent(current.status) ||
      ["REVIEWING", "PROCESSING"].includes(current.status));
  const purchase = useRemote<{ purchase: Purchase }>(
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
  const waitingForParent = p && isWaitingForParent(p.status);
  const flaggedByAI =
    waitingForParent && (p.aiDecision === "BLOCK" || p.status === "AI_BLOCKED");
  const statusTitle =
    p &&
    (waitingForParent
      ? parent
        ? "Needs parent approval"
        : titles.WAITING_PARENT
      : titles[p.status]);
  useEffect(() => {
    if (purchase.data?.purchase.id === id && !submitting.current)
      setCurrent(purchase.data.purchase);
  }, [purchase.data, id]);
  function requestPayment() {
    if (!p || submitting.current) return;
    submitting.current = true;
    void action.run(async () => {
      const requesting = ["CREATED", "REVIEWING", "APPROVED"].includes(p.status);
      setPhase(requesting ? "decision" : "payment");
      try {
        const result = await postApi<{ purchase: Purchase }>(
          `/api/purchases/${id}/${requesting ? "decision" : "pay"}`,
          {},
        );
        setCurrent(result.purchase);
      } finally {
        submitting.current = false;
        setPhase(null);
        purchase.reload();
      }
    });
  }
  const content = (
    <>
      <Status error={purchase.error} loading={!p && purchase.loading} />
      {action.error && !action.busy && (
        <PurchaseErrorToast
          key={action.error}
          message={action.error}
          embedded={embedded}
        />
      )}
      {p && (
        <>
          <Card>
            <div className="flex justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold">
                  {p.status === "PAID" ? "Invoice" : "Bill"}
                </h2>
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
              <time>{new Date(p.paidAt || p.createdAt).toLocaleDateString()}</time>
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
              flaggedByAI || p.status === "PAYMENT_FAILED"
                ? "bg-[#fff0ee]"
                : "bg-[#f3f3f3]"
            }
          >
            <p className="font-display text-xl font-bold">{statusTitle}</p>
            {flaggedByAI ? (
              <p className="text-sm font-semibold">
                Flagged by AI for parent review
              </p>
            ) : (
              parent && waitingForParent && (
                <p className="text-sm font-semibold">
                  Why this needs your approval
                </p>
              )
            )}
            <p>
              {purchaseReason(p.decisionReason, parent) ||
                (waitingForParent
                  ? missingReviewReason
                  : p.status === "CREATED" && !parent
                    ? "Check your items and total before requesting payment."
                    : "Review the items and total above.")}
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
                    ? "Reviewing your payment request…"
                    : phase === "payment"
                      ? "Confirming your payment…"
                      : "Updating your purchase…"}
                </p>
              </div>
            )}
          </Card>
          {parent && canReviewPurchase(p.status) && (
            <ActionLink href={purchaseReviewPath(p.id)}>
              Review purchase request
            </ActionLink>
          )}
          {p.status === "PROCESSING" && (
            <Button
              busy={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await postApi(`/api/purchases/${id}/pay`, {});
                  purchase.reload();
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
                p.aiDecision === "APPROVE" && !p.reviewedByUserId)) && (
              <Button busy={action.busy} onClick={requestPayment}>
                {p.status === "REVIEWING"
                  ? "Check review status"
                  : p.status === "PAYMENT_FAILED"
                    ? "Retry payment"
                    : p.status === "APPROVED"
                      ? "Continue payment"
                      : "Request to Pay"}
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
      title={statusTitle || "Purchase details"}
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
            <ActionLink
              href={canReviewPurchase(purchase.status)
                ? purchaseReviewPath(purchase.id)
                : `/purchases/${purchase.id}`}
            >
              {purchase.status === "PROCESSING" ? "Check payment" : "Review purchase request"}
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
      {tab === "wallet" ? <WalletActivity /> : <PurchaseList />}
    </AppScreen>
  );
}