import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import { getPayPalAccessToken, getPayPalApiBaseUrl } from "@/lib/paypal";

type PayPalSetupTokenResponse = {
  id?: string;
  status?: string;
  customer?: { id?: string };
  links?: Array<{ href: string; rel: string; method?: string }>;
};

/** Creates a PayPal-hosted approval flow to save the parent's sandbox wallet. */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireParent(req);
    if (!user.paypalIsVerified || !user.paypalPayerId) {
      throw new ApiError(
        403,
        "Verify your PayPal account before saving its payment method",
        "PAYPAL_IDENTITY_REQUIRED"
      );
    }
    if (user.paypalVaultId) {
      throw new ApiError(409, "A PayPal wallet is already connected", "PAYPAL_VAULT_ALREADY_CONNECTED");
    }

    const accessToken = await getPayPalAccessToken();
    const apiBaseUrl = getPayPalApiBaseUrl();
    const appBaseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const payload = {
      payment_source: {
        paypal: {
          description: "Pudding can charge this PayPal wallet when a child purchase is approved.",
          usage_pattern: "IMMEDIATE",
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          experience_context: {
            payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
            brand_name: "Pudding",
            locale: "en-US",
            shipping_preference: "NO_SHIPPING",
            return_url: new URL("/api/auth/paypal/vault/return", appBaseUrl).toString(),
            cancel_url: new URL("/api/auth/paypal/vault/cancel", appBaseUrl).toString(),
          },
        },
      },
      customer: user.paypalCustomerId
        ? { id: user.paypalCustomerId, merchant_customer_id: user.id }
        : { merchant_customer_id: user.id },
    };

    const response = await fetch(`${apiBaseUrl}/v3/vault/setup-tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `pudding-setup-${user.id}-${randomUUID()}`,
      },
      body: JSON.stringify(payload),
    });
    const result = (await response.json().catch(() => ({}))) as PayPalSetupTokenResponse & { name?: string; message?: string };
    if (!response.ok) {
      logger.error("paypal.vault.setup_token_failed", {
        provider: "paypal",
        operation: "create_setup_token",
        httpStatus: response.status,
        paypalDebugId: response.headers.get("paypal-debug-id"),
        errorName: result.name,
      });
      throw new ApiError(502, "PayPal could not start wallet setup. Check sandbox vault permissions and try again.", "PAYPAL_SETUP_TOKEN_FAILED");
    }

    const approveUrl = result.links?.find((link) => link.rel === "approve")?.href;
    const approveHost = approveUrl ? new URL(approveUrl).hostname : "";
    const paypalCustomerId = result.customer?.id ?? user.paypalCustomerId;
    if (!result.id || !approveUrl || !approveHost.endsWith("paypal.com")) {
      throw new ApiError(502, "PayPal did not return a valid wallet approval link", "PAYPAL_APPROVAL_LINK_MISSING");
    }
    if (!paypalCustomerId) {
      throw new ApiError(502, "PayPal did not return a customer ID for the wallet", "PAYPAL_CUSTOMER_ID_MISSING");
    }
    if (result.status !== "PAYER_ACTION_REQUIRED") {
      throw new ApiError(502, `Unexpected PayPal setup status: ${result.status || "unknown"}`, "PAYPAL_SETUP_STATUS_UNEXPECTED");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        paypalSetupTokenId: result.id,
        paypalCustomerId,
      },
    });

    return apiSuccess({ approvalUrl: approveUrl }, 200, "PayPal wallet approval started");
  } catch (error) {
    return handleRouteError(error);
  }
}
