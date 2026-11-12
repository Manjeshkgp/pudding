export const subscriptionPlanKeys = ["monthly", "annual"] as const;
export type SubscriptionPlanKey = (typeof subscriptionPlanKeys)[number];

export const subscriptionPlans = {
  monthly: {
    name: "Pudding Monthly (with Trial)",
    amount: "4.99",
    interval: "MONTH",
    billing: "$4.99 every month",
  },
  annual: {
    name: "Pudding Annual (with Trial)",
    amount: "41.88",
    interval: "YEAR",
    billing: "$41.88 every year ($3.49/month equivalent)",
  },
} as const;
