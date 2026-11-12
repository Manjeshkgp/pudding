import { ApiError } from "@/lib/api-response";
import {
  getPayPalAccessToken,
  getPayPalApiBaseUrl,
  PayPalOrderResponse,
} from "@/lib/paypal";

export async function savedPayPalOrder(input: {
  purchaseId: string;
  amount: string;
  currency: string;
  vaultId: string;
  attempt: number;
}) {
  if (
    process.env.PAYPAL_ENV === "live" ||
    new URL(getPayPalApiBaseUrl()).origin !== "https://api-m.sandbox.paypal.com"
  )
    throw new ApiError(
      403,
      "Pudding demo payments require PayPal Sandbox.",
      "SANDBOX_REQUIRED",
    );
  const token = await getPayPalAccessToken();
  const response = await fetch(`${getPayPalApiBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "PayPal-Request-Id": `pudding-${input.purchaseId}-${input.attempt}-create`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.purchaseId,
          custom_id: input.purchaseId,
          invoice_id: input.purchaseId,
          description: "Pudding sandbox demo purchase",
          amount: { currency_code: input.currency, value: input.amount },
        },
      ],
      payment_source: {
        paypal: {
          vault_id: input.vaultId,
          stored_credential: {
            payment_initiator: "MERCHANT",
            usage: "SUBSEQUENT",
            usage_pattern: "UNSCHEDULED_PREPAID",
          },
        },
      },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new ApiError(
      502,
      "PayPal could not create this sandbox payment.",
      "PAYPAL_SAVED_ORDER_FAILED",
      {
        httpStatus: response.status,
        paypalDebugId: response.headers.get("paypal-debug-id"),
        definitive: response.status >= 400 && response.status < 500,
      },
    );
  return (await response.json()) as PayPalOrderResponse;
}
