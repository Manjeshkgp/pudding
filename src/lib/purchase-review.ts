export function purchaseReviewPath(id: string) {
  return `/approve/${encodeURIComponent(id)}`;
}

// AI_BLOCKED remains reviewable for purchases created before blocks went to the queue.
const waitingForParentStatuses = ["WAITING_PARENT", "AI_BLOCKED"] as const;
export const parentReviewStatuses = [
  ...waitingForParentStatuses,
  "APPROVED",
  "PAYMENT_FAILED",
] as const;

export function isWaitingForParent(status: string) {
  return waitingForParentStatuses.some(
    (waitingStatus) => waitingStatus === status,
  );
}

export function canReviewPurchase(status: string) {
  return parentReviewStatuses.some((reviewStatus) => reviewStatus === status);
}

const parentReasons: Record<string, string> = {
  "Your parent needs to allocate more Spend allowance before this purchase can be paid.":
    "This child needs more Spending Allowance before payment can go through.",
  "Your family spending limit is used up. Your parent needs to add a top-up.":
    "The available family spending limit is too low for this purchase.",
  "Your parent needs to review scanned purchases.":
    "Scanned purchases are set to require parent approval.",
  "This exceeds your per-purchase limit. Your parent needs to review it.":
    "This bill exceeds the child’s per-purchase limit.",
  "Your parent reviews every purchase.":
    "The daily limit is set to $0, so every purchase needs parent approval.",
  "AI review is unavailable or its free-tier quota was reached. Your parent will review this purchase.":
    "AI review is unavailable. Review this purchase manually.",
  "Approved by your parent.": "A parent approved this purchase.",
  "Your parent declined this purchase.": "A parent declined this purchase.",
};

export function purchaseReason(reason: string | null, parent: boolean) {
  if (!parent || !reason) return reason;
  if (Object.hasOwn(parentReasons, reason)) return parentReasons[reason];
  const period =
    /^This purchase would exceed your (daily|weekly|monthly) limit\. Parent approval is required\.$/.exec(
      reason,
    );
  return period
    ? `This bill would exceed the child’s ${period[1]} limit.`
    : reason;
}
