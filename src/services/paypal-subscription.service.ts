import { randomUUID } from "node:crypto";
import type { FamilySubscription } from "@prisma/client";
import { ApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { getPayPalAccessToken, getPayPalApiBaseUrl } from "@/lib/paypal";
import prisma from "@/lib/prisma";
import { subscriptionPlans, type SubscriptionPlanKey } from "@/lib/subscription-plans";

const subscriptionsPath = "/v1/billing/subscriptions";
const terminal = ["CANCELLED", "EXPIRED"];
const statuses = ["APPROVAL_PENDING", "APPROVED", "ACTIVE", "SUSPENDED", ...terminal];
const idPattern = /^I-[A-Z0-9]+$/;

type Money = { currency_code: string; value: string };
type PayPalSubscription = {
  id: string;
  plan_id: string;
  custom_id: string;
  status: string;
  update_time?: string;
  status_update_time?: string;
  links?: { href: string; rel: string }[];
  billing_info?: { next_billing_time?: string; failed_payments_count?: number };
};
type PayPalPlan = {
  id: string;
  product_id: string;
  status: string;
  billing_cycles?: {
    tenure_type: string;
    total_cycles: number;
    frequency: { interval_unit: string; interval_count: number };
    pricing_scheme?: { fixed_price?: Money };
  }[];
  payment_preferences?: { auto_bill_outstanding?: boolean; setup_fee?: Money };
  taxes?: { percentage?: string; inclusive?: boolean };
};

async function paypalBilling(path: string, init: RequestInit = {}) {
  const base = new URL(getPayPalApiBaseUrl());
  const sandbox = base.origin === "https://api-m.sandbox.paypal.com";
  const local = process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(base.hostname);
  if (process.env.PAYPAL_ENV !== "sandbox" || (!sandbox && !local))
    throw new ApiError(503, "Subscription checkout requires PayPal Sandbox.");

  const token = await getPayPalAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  const response = await fetch(new URL(path, base), {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  }).catch(() => {
    throw new ApiError(503, "PayPal did not respond. Please try again.");
  });
  if (!response.ok) {
    logger.warn("paypal.subscription_request_failed", {
      provider: "paypal",
      httpStatus: response.status,
      paypalDebugId: response.headers.get("paypal-debug-id"),
    });
    throw new ApiError(502, "PayPal could not complete this subscription request. Please try again.");
  }
  return response;
}

function dateOrNull(date?: string) {
  return date && Number.isFinite(Date.parse(date)) ? new Date(date) : null;
}

function sandboxApprovalUrl(subscription: PayPalSubscription) {
  const href = subscription.links?.find((link) => link.rel === "approve")?.href;
  if (!href) return null;
  const url = URL.parse(href);
  return url && ["https://www.sandbox.paypal.com", "https://sandbox.paypal.com"].includes(url.origin)
    ? url.href
    : null;
}

async function configuredPlan(key: SubscriptionPlanKey) {
  const planId = key === "monthly"
    ? process.env.PAYPAL_SUBSCRIPTION_MONTHLY_PLAN_ID
    : process.env.PAYPAL_SUBSCRIPTION_ANNUAL_PLAN_ID;
  const productId = process.env.PAYPAL_SUBSCRIPTION_PRODUCT_ID;
  if (!planId || !/^P-[A-Z0-9]+$/.test(planId) || !productId)
    throw new ApiError(503, "PayPal subscription plans are not configured.", "PAYPAL_PLAN_NOT_CONFIGURED");

  const response = await paypalBilling(`/v1/billing/plans/${planId}`);
  const plan = (await response.json()) as PayPalPlan;
  const [trial, regular] = plan.billing_cycles ?? [];
  const expected = subscriptionPlans[key];
  const matches = (money: Money | undefined, amount: string) =>
    money?.currency_code === "USD" && /^\d+(\.\d+)?$/.test(money.value) &&
    Number(money.value) === Number(amount);
  const setupFee = plan.payment_preferences?.setup_fee;
  const taxes = plan.taxes;
  if (
    plan.id !== planId || plan.product_id !== productId || plan.status !== "ACTIVE" ||
    plan.billing_cycles?.length !== 2 ||
    trial?.tenure_type !== "TRIAL" || trial.total_cycles !== 1 ||
    trial.frequency.interval_unit !== "MONTH" || trial.frequency.interval_count !== 1 ||
    (trial.pricing_scheme?.fixed_price && !matches(trial.pricing_scheme.fixed_price, "0")) ||
    regular?.tenure_type !== "REGULAR" || regular.total_cycles !== 0 ||
    regular.frequency.interval_unit !== expected.interval || regular.frequency.interval_count !== 1 ||
    !matches(regular.pricing_scheme?.fixed_price, expected.amount) ||
    plan.payment_preferences?.auto_bill_outstanding !== false ||
    (setupFee && !matches(setupFee, "0")) ||
    (taxes?.percentage !== undefined && Number(taxes.percentage) !== 0)
  ) throw new ApiError(503, "The Sandbox plan does not match Pudding’s trial and billing terms.", "PAYPAL_PLAN_MISMATCH");

  return planId;
}

async function syncSubscription(record: FamilySubscription, id: string) {
  if (!idPattern.test(id)) throw new ApiError(502, "PayPal returned an invalid subscription ID.");
  const response = await paypalBilling(`${subscriptionsPath}/${id}`);
  const remote = (await response.json()) as PayPalSubscription;
  if (
    remote.id !== id || remote.plan_id !== record.paypalPlanId ||
    remote.custom_id !== record.requestId || !statuses.includes(remote.status)
  ) throw new ApiError(409, "PayPal subscription details do not match this checkout.", "PAYPAL_SUBSCRIPTION_MISMATCH");

  const providerUpdatedAt = dateOrNull(remote.update_time) ?? dateOrNull(remote.status_update_time);
  const olderThanCurrent = record.providerUpdatedAt && (!providerUpdatedAt || record.providerUpdatedAt > providerUpdatedAt);
  if (!olderThanCurrent) {
    await prisma.familySubscription.updateMany({
      where: {
        familyId: record.familyId,
        requestId: record.requestId,
        OR: [{ paypalSubscriptionId: null }, { paypalSubscriptionId: id }],
        ...(providerUpdatedAt ? {
          AND: [{ OR: [{ providerUpdatedAt: null }, { providerUpdatedAt: { lte: providerUpdatedAt } }] }],
        } : { providerUpdatedAt: null }),
      },
      data: {
        paypalSubscriptionId: id,
        status: remote.status,
        approvalUrl: remote.status === "APPROVAL_PENDING"
          ? sandboxApprovalUrl(remote) ?? record.approvalUrl
          : null,
        nextBillingAt: dateOrNull(remote.billing_info?.next_billing_time),
        failedPaymentsCount: remote.billing_info?.failed_payments_count ?? 0,
        providerUpdatedAt,
      },
    });
  }
  return prisma.familySubscription.findUniqueOrThrow({ where: { familyId: record.familyId } });
}

export async function confirmFamilySubscription(familyId: string) {
  const record = await prisma.familySubscription.findUnique({ where: { familyId } });
  return record?.paypalSubscriptionId
    ? syncSubscription(record, record.paypalSubscriptionId)
    : record;
}

export async function startFamilySubscription(familyId: string, key: SubscriptionPlanKey) {
  let record = await confirmFamilySubscription(familyId);
  if (record?.status === "ACTIVE") return record;
  if (record && !terminal.includes(record.status) && record.status !== "APPROVAL_PENDING")
    throw new ApiError(409, "PayPal is still processing your current subscription. Check approval again.");

  const planId = await configuredPlan(key);
  if (record?.status === "APPROVAL_PENDING" && record.planKey !== key) {
    if (!record.paypalSubscriptionId)
      throw new ApiError(409, "Finish starting your existing checkout before changing plans.");
    await paypalBilling(`${subscriptionsPath}/${record.paypalSubscriptionId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: "Primary parent selected another plan before approving checkout." }),
    });
    record = await syncSubscription(record, record.paypalSubscriptionId);
    if (!terminal.includes(record.status))
      throw new ApiError(409, "PayPal is still closing your previous checkout. Try again shortly.");
  }

  if (!record || terminal.includes(record.status)) {
    const attempt = { planKey: key, paypalPlanId: planId, requestId: randomUUID() };
    if (!record) {
      await prisma.familySubscription.createMany({ data: { familyId, ...attempt }, skipDuplicates: true });
    } else {
      await prisma.familySubscription.updateMany({
        where: { familyId, requestId: record.requestId, status: { in: terminal } },
        data: {
          ...attempt, status: "APPROVAL_PENDING", paypalSubscriptionId: null,
          approvalUrl: null, nextBillingAt: null, failedPaymentsCount: 0,
          providerUpdatedAt: null, createdAt: new Date(),
        },
      });
    }
    record = await prisma.familySubscription.findUniqueOrThrow({ where: { familyId } });
  }

  if (record.status === "ACTIVE") return record;
  if (record.planKey !== key || record.paypalPlanId !== planId || record.status !== "APPROVAL_PENDING")
    throw new ApiError(409, "A different checkout is already in progress. Refresh this page to continue.");
  if (record.paypalSubscriptionId) {
    if (!record.approvalUrl) throw new ApiError(409, "Your PayPal approval link is unavailable. Check approval again.");
    return record;
  }
  // PayPal keeps creation keys for 72 hours. An unresolved attempt must never
  // create a second agreement after the provider's idempotency window expires.
  if (Date.now() - record.createdAt.getTime() >= 72 * 60 * 60 * 1000)
    throw new ApiError(409, "This PayPal checkout could not be recovered. Contact support before trying again.");

  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const response = await paypalBilling(subscriptionsPath, {
    method: "POST",
    headers: { "PayPal-Request-Id": record.requestId },
    body: JSON.stringify({
      plan_id: record.paypalPlanId,
      custom_id: record.requestId,
      application_context: {
        brand_name: "Pudding",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: new URL("/onboarding/plan?paypal=returned", base).href,
        cancel_url: new URL("/onboarding/plan?paypal=cancelled", base).href,
      },
    }),
  });
  const remote = (await response.json()) as PayPalSubscription;
  if (!idPattern.test(remote.id))
    throw new ApiError(502, "PayPal did not return a valid subscription ID.");
  await prisma.familySubscription.updateMany({
    where: { familyId, requestId: record.requestId, status: "APPROVAL_PENDING",
      OR: [{ paypalSubscriptionId: null }, { paypalSubscriptionId: remote.id }] },
    data: { paypalSubscriptionId: remote.id, approvalUrl: sandboxApprovalUrl(remote) },
  });
  const saved = await prisma.familySubscription.findUniqueOrThrow({ where: { familyId } });
  if (saved.requestId !== record.requestId)
    throw new ApiError(409, "Your checkout changed. Refresh this page to continue.");
  if (saved.status === "APPROVAL_PENDING" && !saved.approvalUrl)
    return syncSubscription(saved, remote.id);
  return saved;
}

export async function syncSubscriptionWebhook(id: string, requestId?: string) {
  if (!idPattern.test(id)) return false;
  const record = await prisma.familySubscription.findFirst({
    where: {
      OR: [
        { paypalSubscriptionId: id },
        ...(requestId ? [{ requestId, paypalSubscriptionId: null }] : []),
      ],
    },
  });
  if (!record) return false;
  await syncSubscription(record, id);
  return true;
}
