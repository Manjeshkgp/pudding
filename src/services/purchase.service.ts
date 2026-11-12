import { randomInt } from "node:crypto";
import { Prisma, Purchase } from "@prisma/client";
import prisma from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import { InvoiceItem } from "@/lib/app-types";
import { reviewInvoice } from "@/services/invoice-ai.service";
import { savedPayPalOrder } from "@/lib/paypal-saved-payment";
import {
  capturePayPalOrder,
  getPayPalOrderDetails,
  PayPalOrderResponse,
} from "@/lib/paypal";
import { logger } from "@/lib/logger";
import { dispatchNotification } from "@/services/notification.service";

export const catalog = [
  { name: "Notebook and pencils", category: "School", unitPrice: "6.50" },
  { name: "Water bottle", category: "Everyday", unitPrice: "8.00" },
  { name: "Fruit snack pack", category: "Food", unitPrice: "3.25" },
  { name: "Chocolate multipack", category: "Treat", unitPrice: "7.50" },
  { name: "Board game", category: "Play", unitPrice: "14.00" },
  { name: "Video game credit", category: "Play", unitPrice: "19.99" },
  {
    name: "Energy drink multipack",
    category: "Caffeinated drinks",
    unitPrice: "5.50",
  },
  {
    name: "Tobacco cigarettes",
    category: "Age-restricted",
    unitPrice: "12.00",
  },
  { name: "Vodka bottle", category: "Age-restricted", unitPrice: "18.00" },
];
export const serializePurchase = (p: Purchase) => ({
  ...p,
  amount: p.amount.toFixed(2),
});
export async function notifyPurchase(
  p: Purchase,
  title: string,
  reason: string,
) {
  try {
    const parents = await prisma.user.findMany({
      where: { familyId: p.familyId },
      select: { id: true },
    });
    const common = {
      familyId: p.familyId,
      type: "PURCHASE_UPDATE",
      title,
      body: reason,
      data: { purchaseId: p.id, href: `/purchases/${p.id}` },
    };
    await dispatchNotification({ ...common, childId: p.childId });
    await Promise.allSettled(
      parents.map((parent) =>
        dispatchNotification({
          ...common,
          userId: parent.id,
          ...(p.status === "PAID"
            ? { transactionAmount: p.amount.toNumber() }
            : {}),
        }),
      ),
    );
  } catch (error) {
    logger.warn(
      "purchase.notification_failed",
      { requestId: p.id, provider: "notifications" },
      error,
    );
  }
}

export async function createInvoice(childId: string, key: string) {
  return prisma.$transaction(async (tx) => {
    const child = await tx.child.findUniqueOrThrow({
      where: { id: childId },
      include: { family: true, wallet: true },
    });
    if (
      !child.pinHash ||
      child.isFrozen ||
      child.family.isFrozen ||
      child.wallet?.isFrozen
    )
      throw new ApiError(
        403,
        "Your wallet is not active. Ask your parent for help.",
        "WALLET_INACTIVE",
      );
    const prior = await tx.purchase.findUnique({
      where: { idempotencyKey: key },
    });
    if (prior) {
      if (prior.childId !== child.id)
        throw new ApiError(409, "Request key already used.");
      return prior;
    }
    const items: InvoiceItem[] = Array.from(
      { length: randomInt(1, 4) },
      () => ({
        ...catalog[randomInt(catalog.length)],
        quantity: randomInt(1, 3),
      }),
    );
    const amount = items.reduce(
      (sum, item) =>
        sum.plus(new Prisma.Decimal(item.unitPrice).mul(item.quantity)),
      new Prisma.Decimal(0),
    );
    return tx.purchase.create({
      data: {
        childId: child.id,
        familyId: child.familyId,
        amount,
        currency: "USD",
        items: items as unknown as Prisma.InputJsonValue,
        idempotencyKey: key,
      },
    });
  });
}

export async function decideInvoice(id: string) {
  const claimed = await prisma.purchase.updateMany({
    where: { id, status: "CREATED" },
    data: { status: "REVIEWING", processingAt: new Date() },
  });
  if (!claimed.count) {
    const current = await prisma.purchase.findUniqueOrThrow({ where: { id } });
    if (
      current.status === "REVIEWING" &&
      current.processingAt &&
      Date.now() - current.processingAt.getTime() > 120000
    ) {
      const recovered = await prisma.purchase.updateMany({
        where: {
          id,
          status: "REVIEWING",
          processingAt: { lt: new Date(Date.now() - 120000) },
        },
        data: {
          status: "WAITING_PARENT",
          decisionReason:
            "AI review was interrupted. Parent approval is required.",
          aiDecision: "UNAVAILABLE",
          processingAt: null,
        },
      });
      if (recovered.count) {
        const waiting = await prisma.purchase.findUniqueOrThrow({
          where: { id },
        });
        await notifyPurchase(
          waiting,
          "Purchase needs approval",
          waiting.decisionReason ||
            "AI review was interrupted. Parent approval is required.",
        );
        return waiting;
      }
    }
    return current;
  }
  const p = await prisma.purchase.findUniqueOrThrow({
    where: { id },
    include: { child: { include: { spendingRule: true } } },
  });
  const rule = p.child.spendingRule;
  const limitReason = await purchaseReviewReason(prisma, p);
  let decision: { decision: string; reason: string };
  if (limitReason) decision = { decision: "PARENT", reason: limitReason };
  else
    decision = await reviewInvoice({
      age: p.child.age,
      items: p.items as unknown as InvoiceItem[],
      total: p.amount.toFixed(2),
      currency: p.currency,
      ageBlockEnabled: rule?.ageBlockEnabled ?? true,
    });
  const status =
    decision.decision === "APPROVE"
      ? "APPROVED"
      : decision.decision === "BLOCK"
        ? "AI_BLOCKED"
        : "WAITING_PARENT";
  // An interrupted review may have already been routed to a parent. A late
  // model response must not overwrite that decision or a payment in progress.
  const saved = await prisma.purchase.updateMany({
    where: { id, status: "REVIEWING", processingAt: p.processingAt },
    data: {
      status,
      decisionReason: decision.reason,
      aiDecision: decision.decision,
      processingAt: null,
    },
  });
  const updated = await prisma.purchase.findUniqueOrThrow({ where: { id } });
  if (saved.count && updated.status === status && status !== "APPROVED")
    await notifyPurchase(
      updated,
      status === "AI_BLOCKED"
        ? "AI blocked a purchase"
        : "Purchase needs approval",
      decision.reason,
    );
  return updated;
}

function completedCapture(order: PayPalOrderResponse, p: Purchase) {
  const unit = order.purchase_units?.find(
    (u) => u.custom_id === p.id || u.reference_id === p.id,
  );
  const captures = unit?.payments?.captures || [];
  const capture = captures.find(
    (c) =>
      c.status === "COMPLETED" &&
      c.amount.currency_code === p.currency &&
      new Prisma.Decimal(c.amount.value).equals(p.amount),
  );
  return capture;
}
type ParentPurchaseApproval = {
  familyId: string;
  actorRole: string;
  canAllocate: boolean;
  confirmedAllowance?: string;
  note?: string;
};

export async function payPurchase(
  id: string,
  parentId?: string,
  approval?: ParentPurchaseApproval,
) {
  const initial = await prisma.purchase.findUniqueOrThrow({ where: { id } });
  if (approval && initial.familyId !== approval.familyId)
    throw new ApiError(404, "Invoice not found.");
  const claim = await prisma.$transaction(async (tx) => {
    // One family lock serializes capacity checks across all children.
    await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id" = ${initial.familyId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Purchase" WHERE "id" = ${id} FOR UPDATE`;
    const p = await tx.purchase.findUniqueOrThrow({ where: { id } });
    if (p.status === "PAID") return { p, send: false, vaultId: "" };
    if (
      p.status === "PROCESSING" &&
      p.processingAt &&
      Date.now() - p.processingAt.getTime() < 60000
    )
      return { p, send: false, vaultId: "" };
    if (
      !["APPROVED", "PROCESSING", "PAYMENT_FAILED"].includes(p.status) &&
      !(parentId && approval && p.status === "WAITING_PARENT")
    )
      throw new ApiError(
        409,
        "This invoice is not approved for payment.",
        "PURCHASE_NOT_APPROVED",
      );
    if (
      !parentId &&
      p.aiDecision !== "APPROVE" &&
      !(p.status === "PROCESSING" && p.reviewedByUserId)
    )
      throw new ApiError(
        403,
        "Your parent must approve this purchase.",
        "PARENT_APPROVAL_REQUIRED",
      );
    if (
      p.status === "PROCESSING" &&
      !p.paypalOrderId &&
      Date.now() - (p.paymentStartedAt || p.createdAt).getTime() > 900000
    ) {
      const waiting = await tx.purchase.update({
        where: { id },
        data: {
          decisionReason:
            "Payment outcome needs manual confirmation. Contact support before retrying; your reserved allowance is protected.",
        },
      });
      return { p: waiting, send: false, vaultId: "" };
    }
    const child = await tx.child.findUniqueOrThrow({
      where: { id: p.childId },
      include: { spendingRule: true },
    });
    const family = await tx.family.findUniqueOrThrow({
      where: { id: p.familyId },
    });
    await tx.$queryRaw`SELECT "id" FROM "Wallet" WHERE "childId" = ${p.childId} FOR UPDATE`;
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { childId: p.childId },
    });
    // Resume an ambiguous charge even if the account has since been frozen;
    // reconciliation must still record any charge PayPal already completed.
    if (
      p.status !== "PROCESSING" &&
      (child.isFrozen || family.isFrozen || wallet.isFrozen)
    )
      throw new ApiError(403, "This wallet is paused.", "WALLET_FROZEN");
    const payer = p.payerUserId
      ? await tx.user.findUnique({ where: { id: p.payerUserId } })
      : await tx.user.findFirst({
          where: { familyId: p.familyId, role: "PRIMARY_PARENT" },
        });
    if (payer?.isFrozen && p.status !== "PROCESSING")
      throw new ApiError(
        403,
        "The primary payer account is paused.",
        "PAYER_FROZEN",
      );
    if (!payer?.paypalVaultId)
      throw new ApiError(
        409,
        "The primary parent must save a PayPal wallet before paying.",
        "PAYPAL_WALLET_REQUIRED",
      );
    if (p.status !== "PROCESSING") {
      if (
        family.spendingLimit
          .minus(family.spentTotal)
          .minus(family.reservedTotal)
          .lt(p.amount)
      ) {
        if (!parentId) {
          const waiting = await tx.purchase.update({
            where: { id },
            data: {
              status: "WAITING_PARENT",
              decisionReason:
                "Your family spending limit is used up. Your parent needs to add a top-up.",
            },
          });
          return { p: waiting, send: false, vaultId: "" };
        }
        throw new ApiError(
          409,
          "The available family spending limit is too low for this purchase. Increase the family limit, then try again.",
          "FAMILY_LIMIT_REACHED",
        );
      }
      const shortfall = p.amount.minus(
        wallet.spendBalance.minus(wallet.purchaseReservedBalance),
      );
      if (shortfall.gt(0)) {
        if (!parentId) {
          const waiting = await tx.purchase.update({
            where: { id },
            data: {
              status: "WAITING_PARENT",
              decisionReason:
                "Your parent needs to allocate more Spend allowance before this purchase can be paid.",
            },
          });
          return { p: waiting, send: false, vaultId: "" };
        }
        if (!approval?.canAllocate)
          throw new ApiError(
            409,
            "This child needs more Spend allowance. A parent with budget access can allocate it before payment.",
            "INSUFFICIENT_CHILD_BALANCE",
          );
        if (family.unallocatedBudget.lt(shortfall))
          throw new ApiError(
            409,
            "There isn’t enough unallocated family budget to cover the Spend shortfall. Increase the family limit, then try again.",
            "INSUFFICIENT_FAMILY_BUDGET",
          );
        if (approval.confirmedAllowance !== shortfall.toFixed(2))
          throw new ApiError(
            409,
            "Confirm the Spend allowance needed for this purchase.",
            "ALLOWANCE_CONFIRMATION_REQUIRED",
            { amount: shortfall.toFixed(2), currency: p.currency },
          );

        // This allocation and the payment reservation commit together under the
        // same locks. Retrying an in-flight payment cannot allocate twice.
        await tx.family.update({
          where: { id: family.id },
          data: { unallocatedBudget: { decrement: shortfall } },
        });
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { spendBalance: { increment: shortfall } },
        });
        const allocationKey = `purchase-allowance:${p.id}:${p.paymentAttempt + 1}`;
        const entry = {
          familyId: p.familyId,
          childId: p.childId,
          type: "INSTANT_TRANSFER" as const,
          amount: shortfall,
          referenceId: p.id,
          actorUserId: parentId,
          description: "Spend allowance allocated during purchase approval",
        };
        await tx.ledgerEntry.createMany({
          data: [
            {
              ...entry,
              walletBucket: "FAMILY_BUDGET",
              direction: "DEBIT",
              idempotencyKey: `${allocationKey}:debit`,
            },
            {
              ...entry,
              walletBucket: "SPEND",
              direction: "CREDIT",
              idempotencyKey: `${allocationKey}:credit`,
            },
          ],
        });
      }
      if (!parentId) {
        const reason = await purchaseReviewReason(tx, p);
        if (reason) {
          const waiting = await tx.purchase.update({
            where: { id },
            data: { status: "WAITING_PARENT", decisionReason: reason },
          });
          return { p: waiting, send: false, vaultId: "" };
        }
      }
      await tx.family.update({
        where: { id: family.id },
        data: { reservedTotal: { increment: p.amount } },
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { purchaseReservedBalance: { increment: p.amount } },
      });
      if (parentId && approval) {
        await tx.auditLog.create({
          data: {
            familyId: p.familyId,
            actorUserId: parentId,
            actorRole: approval.actorRole,
            action: "PURCHASE_APPROVE",
            targetType: "Purchase",
            targetId: p.id,
            details: {
              reviewReason: p.decisionReason,
              allocatedAllowance: shortfall.gt(0)
                ? shortfall.toFixed(2)
                : "0.00",
              note: approval.note ?? null,
            },
          },
        });
      }
    }
    const next = await tx.purchase.update({
      where: { id },
      data: {
        status: "PROCESSING",
        processingAt: new Date(),
        payerUserId: payer.id,
        ...(parentId && approval && p.status !== "PROCESSING"
          ? { reviewedByUserId: parentId }
          : {}),
        ...(p.status !== "PROCESSING"
          ? {
              paymentAttempt: { increment: 1 },
              paymentStartedAt: new Date(),
              paypalOrderId: null,
            }
          : {}),
      },
    });
    return { p: next, send: true, vaultId: payer.paypalVaultId };
  });
  if (!claim.send) {
    if (claim.p.status === "WAITING_PARENT")
      await notifyPurchase(
        claim.p,
        "Purchase needs your attention",
        claim.p.decisionReason || "Parent review required.",
      );
    return claim.p;
  }
  const p = claim.p;
  let orderId = p.paypalOrderId;
  let order: PayPalOrderResponse | null = null;
  try {
    order = orderId
      ? await getPayPalOrderDetails(orderId)
      : await savedPayPalOrder({
          purchaseId: p.id,
          amount: p.amount.toFixed(2),
          currency: p.currency,
          vaultId: claim.vaultId,
          attempt: p.paymentAttempt,
        });
    orderId = order.id;
    await prisma.purchase.update({
      where: { id },
      data: { paypalOrderId: orderId },
    });
    if (!completedCapture(order, p) && order.status === "APPROVED")
      order = await capturePayPalOrder(
        orderId,
        `pudding-${p.id}-${p.paymentAttempt}-capture`,
      );
  } catch (error) {
    logger.warn(
      "purchase.paypal_confirmation_failed",
      {
        provider: "paypal",
        operation: "saved_wallet_capture",
        retryable: true,
        requestId: p.id,
      },
      error,
    );
    if (orderId) {
      try {
        order = await getPayPalOrderDetails(orderId);
      } catch {
        /* Keep reservation while outcome is unknown. */
      }
    }
    if (
      !order &&
      error instanceof ApiError &&
      (error.details as { definitive?: boolean } | undefined)?.definitive
    )
      return releasePurchase(
        p,
        "PayPal declined this payment. Your allowance was not deducted.",
      );
    if (!order)
      return prisma.purchase.update({
        where: { id },
        data: {
          decisionReason:
            "Waiting for PayPal confirmation. Retry confirmation to safely check this same payment.",
        },
      });
  }
  const capture = completedCapture(order!, p);
  if (!capture) {
    const captures =
      order?.purchase_units?.flatMap((u) => u.payments?.captures || []) || [];
    if (
      order?.status === "VOIDED" ||
      captures.some((c) => ["DECLINED", "FAILED"].includes(c.status)) ||
      order?.status === "PAYER_ACTION_REQUIRED"
    )
      return releasePurchase(
        p,
        "PayPal requires a new wallet authorization or declined this payment. Ask your parent to reconnect PayPal.",
      );
    return prisma.purchase.update({
      where: { id },
      data: {
        decisionReason:
          "PayPal has not confirmed this payment yet. No completed spending has been recorded.",
      },
    });
  }
  return finishPaidPurchase(p, order!, parentId);
}
export async function reconcilePurchase(id: string, expectedCaptureId?: string) {
  const p = await prisma.purchase.findUniqueOrThrow({ where: { id } });
  if (p.status === "PAID") return p;
  if (p.status !== "PROCESSING" || !p.paypalOrderId)
    throw new ApiError(409, "Payment is not ready for confirmation.");
  const order = await getPayPalOrderDetails(p.paypalOrderId);
  const capture = completedCapture(order, p);
  if (!capture)
    throw new ApiError(
      503,
      "PayPal has not confirmed a completed payment yet.",
    );
  if (expectedCaptureId && capture.id !== expectedCaptureId)
    throw new ApiError(
      409,
      "PayPal capture does not match the confirmed order.",
      "WEBHOOK_CAPTURE_MISMATCH",
    );
  return finishPaidPurchase(p, order, p.reviewedByUserId || undefined);
}
async function finishPaidPurchase(
  p: Purchase,
  order: PayPalOrderResponse,
  parentId?: string,
) {
  const capture = completedCapture(order, p);
  if (!capture)
    throw new ApiError(
      503,
      "PayPal payment details do not match this invoice.",
    );
  const paid = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id" = ${p.familyId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Purchase" WHERE "id" = ${p.id} FOR UPDATE`;
    const current = await tx.purchase.findUniqueOrThrow({
      where: { id: p.id },
    });
    if (current.status === "PAID") return current;
    if (current.status !== "PROCESSING")
      throw new ApiError(
        409,
        "This payment has no active reservation.",
        "PAYMENT_RESERVATION_MISSING",
      );
    await tx.wallet.update({
      where: { childId: p.childId },
      data: {
        spendBalance: { decrement: p.amount },
        purchaseReservedBalance: { decrement: p.amount },
      },
    });
    await tx.family.update({
      where: { id: p.familyId },
      data: {
        spentTotal: { increment: p.amount },
        reservedTotal: { decrement: p.amount },
      },
    });
    await tx.ledgerEntry.create({
      data: {
        familyId: p.familyId,
        childId: p.childId,
        walletBucket: "SPEND",
        type: "SPEND_OPTION_B_ORDER",
        direction: "DEBIT",
        amount: p.amount,
        referenceId: p.id,
        paypalOrderId: order.id,
        paypalCaptureId: capture.id,
        idempotencyKey: `purchase-paid:${p.id}`,
        description: "Pudding sandbox invoice paid",
      },
    });
    await tx.auditLog.create({
      data: {
        familyId: p.familyId,
        actorUserId: parentId,
        actorRole: parentId ? "PARENT" : "AI",
        action: "PURCHASE_PAID",
        targetType: "Purchase",
        targetId: p.id,
        details: { paypalCaptureId: capture.id },
      },
    });
    return tx.purchase.update({
      where: { id: p.id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        processingAt: null,
        paypalOrderId: order.id,
        paypalCaptureId: capture.id,
        decisionReason: "Payment completed in PayPal Sandbox.",
      },
    });
  });
  await notifyPurchase(
    paid,
    "Purchase paid",
    `${p.amount.toFixed(2)} ${p.currency} was paid for your invoice.`,
  );
  return paid;
}
async function releasePurchase(p: Purchase, reason: string) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id" = ${p.familyId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Purchase" WHERE "id" = ${p.id} FOR UPDATE`;
    const current = await tx.purchase.findUniqueOrThrow({
      where: { id: p.id },
    });
    if (current.status !== "PROCESSING") return current;
    await tx.family.update({
      where: { id: p.familyId },
      data: { reservedTotal: { decrement: p.amount } },
    });
    await tx.wallet.update({
      where: { childId: p.childId },
      data: { purchaseReservedBalance: { decrement: p.amount } },
    });
    return tx.purchase.update({
      where: { id: p.id },
      data: {
        status: "PAYMENT_FAILED",
        processingAt: null,
        decisionReason: reason,
      },
    });
  });
  await notifyPurchase(result, "Payment needs attention", reason);
  return result;
}

async function purchaseReviewReason(
  db: Pick<Prisma.TransactionClient, "purchase" | "spendingRule">,
  p: Purchase,
) {
  const rule = await db.spendingRule.findUnique({
    where: { childId: p.childId },
  });
  if (rule && !rule.inStoreEnabled)
    return "Your parent needs to review scanned purchases.";
  if (rule?.maxPerTransaction && p.amount.gt(rule.maxPerTransaction))
    return "This exceeds your per-purchase limit. Your parent needs to review it.";
  const daily =
    rule?.dailyLimit ??
    new Prisma.Decimal(process.env.DEMO_DEFAULT_DAILY_LIMIT_USD || 20);
  if (daily.equals(0)) return "Your parent reviews every purchase.";
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const week = new Date(day);
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  const month = new Date(day);
  month.setUTCDate(1);
  for (const [label, limit, start] of [
    ["daily", daily, day],
    ["weekly", rule?.weeklyLimit, week],
    ["monthly", rule?.monthlyLimit, month],
  ] as const) {
    if (!limit) continue;
    const used = await db.purchase.aggregate({
      where: {
        childId: p.childId,
        id: { not: p.id },
        OR: [
          { status: "PAID", paidAt: { gte: start } },
          { status: "PROCESSING" },
        ],
      },
      _sum: { amount: true },
    });
    if ((used._sum.amount || new Prisma.Decimal(0)).plus(p.amount).gt(limit))
      return `This purchase would exceed your ${label} limit. Parent approval is required.`;
  }
  return null;
}
