import { ApiError } from "./api-response";

interface CachedPayPalToken {
  accessToken: string;
  expiresAt: number;
}

const globalForPayPal = globalThis as unknown as {
  paypalTokenCache?: CachedPayPalToken;
};

export function getPayPalApiBaseUrl(): string {
  if (process.env.PAYPAL_API_BASE_URL) {
    return process.env.PAYPAL_API_BASE_URL;
  }
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function getPayPalCredentials(): { clientId: string; clientSecret: string } {
  const clientId =
    process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (
    !clientId ||
    !clientSecret ||
    clientId === "your-paypal-sandbox-client-id"
  ) {
    throw new ApiError(
      500,
      "PayPal API credentials (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET) are not configured in .env",
      "PAYPAL_CREDENTIALS_MISSING"
    );
  }

  return { clientId, clientSecret };
}

/**
 * Fetches and caches a PayPal OAuth2 access token using client_credentials (INT-1, INT-5).
 */
export async function getPayPalAccessToken(): Promise<string> {
  const now = Date.now();
  const cached = globalForPayPal.paypalTokenCache;

  if (cached && cached.expiresAt > now + 30_000) {
    return cached.accessToken;
  }

  const { clientId, clientSecret } = getPayPalCredentials();
  const baseUrl = getPayPalApiBaseUrl();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetchWithRetry(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new ApiError(
      502,
      "Failed to authenticate with PayPal OAuth2 API",
      "PAYPAL_AUTH_FAILED",
      errText
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  globalForPayPal.paypalTokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * Resilient fetch wrapper with exponential backoff on 5xx or network errors (INT-6).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status < 500 || attempt === maxRetries - 1) {
        return res;
      }
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries - 1) {
        break;
      }
    }
    const backoffMs = Math.min(2000, 250 * Math.pow(2, attempt));
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  throw new ApiError(
    503,
    "PayPal service is temporarily unreachable. Please retry in a moment.",
    "PAYPAL_OUTAGE",
    lastError instanceof Error ? lastError.message : undefined
  );
}

export interface CreatePayPalPayeeOrderInput {
  amount: string;
  currencyCode: string;
  recipientEmail: string;
  customId: string;
  description: string;
  idempotencyKey: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PayPalOrderResponse {
  id: string;
  status: string;
  links?: Array<{ href: string; rel: string; method: string }>;
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    payee?: { email_address?: string; merchant_id?: string };
    payments?: {
      captures?: Array<{
        id: string;
        status:
          | "COMPLETED"
          | "DECLINED"
          | "PARTIALLY_REFUNDED"
          | "PENDING"
          | "REFUNDED"
          | "FAILED";
        status_details?: { reason?: string };
        amount: { currency_code: string; value: string };
        custom_id?: string;
        create_time?: string;
        update_time?: string;
      }>;
    };
  }>;
}

/**
 * Creates a PayPal Order v2 with a custom `payee.email_address` so money moves
 * 100% directly from the Parent's PayPal to the Recipient's PayPal email (Way 1).
 * Carries `PayPal-Request-Id` idempotency header (INT-2).
 */
export async function createPayPalPayeeOrder(
  input: CreatePayPalPayeeOrderInput
): Promise<PayPalOrderResponse> {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalApiBaseUrl();
  const appUrl =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: input.customId,
        custom_id: input.customId,
        description: input.description.slice(0, 127),
        amount: {
          currency_code: input.currencyCode.toUpperCase(),
          value: Number(input.amount).toFixed(2),
        },
        payee: {
          email_address: input.recipientEmail.toLowerCase(),
        },
      },
    ],
    application_context: {
      brand_name: "GoodSpend Family Wallet",
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
      return_url: input.returnUrl || `${appUrl}/parent/approvals?paypal=success`,
      cancel_url: input.cancelUrl || `${appUrl}/parent/approvals?paypal=cancel`,
    },
  };

  const response = await fetchWithRetry(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": input.idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new ApiError(
      502,
      "Failed to create PayPal order for recipient",
      "PAYPAL_CREATE_ORDER_FAILED",
      errBody
    );
  }

  return (await response.json()) as PayPalOrderResponse;
}

/**
 * Captures an approved PayPal Order v2 (INT-1, INT-2).
 * Returns the full capture payload (including COMPLETED or PENDING/UNCLAIMED status).
 */
export async function capturePayPalOrder(
  paypalOrderId: string,
  idempotencyKey: string
): Promise<PayPalOrderResponse> {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalApiBaseUrl();

  const response = await fetchWithRetry(
    `${baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": idempotencyKey,
      },
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new ApiError(
      502,
      "PayPal order capture failed",
      "PAYPAL_CAPTURE_FAILED",
      errBody
    );
  }

  return (await response.json()) as PayPalOrderResponse;
}

/**
 * Fetches the current details of a PayPal Order v2 (used for daily reconciliation INT-4).
 */
export async function getPayPalOrderDetails(
  paypalOrderId: string
): Promise<PayPalOrderResponse> {
  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalApiBaseUrl();

  const response = await fetchWithRetry(
    `${baseUrl}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new ApiError(
      502,
      `Failed to fetch PayPal order ${paypalOrderId}`,
      "PAYPAL_GET_ORDER_FAILED",
      errBody
    );
  }

  return (await response.json()) as PayPalOrderResponse;
}

export interface VerifyWebhookHeaders {
  authAlgo: string | null;
  certUrl: string | null;
  transmissionId: string | null;
  transmissionSig: string | null;
  transmissionTime: string | null;
}

/**
 * Cryptographically verifies a PayPal webhook signature using PayPal's
 * `/v1/notifications/verify-webhook-signature` endpoint (INT-3).
 */
export async function verifyPayPalWebhookSignature(
  headers: VerifyWebhookHeaders,
  rawWebhookEvent: Record<string, unknown>
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  if (!webhookId || webhookId === "your-paypal-sandbox-webhook-id") {
    throw new ApiError(
      500,
      "PAYPAL_WEBHOOK_ID is not configured in .env",
      "PAYPAL_WEBHOOK_ID_MISSING"
    );
  }

  if (
    !headers.authAlgo ||
    !headers.certUrl ||
    !headers.transmissionId ||
    !headers.transmissionSig ||
    !headers.transmissionTime
  ) {
    return false;
  }

  const accessToken = await getPayPalAccessToken();
  const baseUrl = getPayPalApiBaseUrl();

  const response = await fetchWithRetry(
    `${baseUrl}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: webhookId,
        webhook_event: rawWebhookEvent,
      }),
    }
  );

  if (!response.ok) {
    return false;
  }

  const data = (await response.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}
