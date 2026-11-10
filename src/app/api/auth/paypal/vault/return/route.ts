import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import { getPayPalAccessToken, getPayPalApiBaseUrl } from "@/lib/paypal";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

type PayPalSetupToken = { id: string; status: string };
type PayPalPaymentToken = {
  id?: string;
  customer?: { id?: string };
  payment_source?: {
    paypal?: { payer_id?: string; email_address?: string };
  };
};

function appUrl(path: string) {
  return new URL(path, process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
}

/** Confirms the approved setup token and persists the reusable PayPal payment token. */
export async function GET(req: NextRequest) {
  try {
    const setupTokenId =
      req.nextUrl.searchParams.get("approval_token_id") ||
      req.nextUrl.searchParams.get("setup_token_id") ||
      req.nextUrl.searchParams.get("token");
    if (!setupTokenId) throw new ApiError(400, "PayPal did not return a setup token", "PAYPAL_SETUP_TOKEN_MISSING");

    const user = await prisma.user.findFirst({ where: { paypalSetupTokenId: setupTokenId } });
    if (!user) throw new ApiError(404, "No pending PayPal wallet setup matches this approval", "PAYPAL_SETUP_NOT_FOUND");

    const accessToken = await getPayPalAccessToken();
    const apiBaseUrl = getPayPalApiBaseUrl();
    const setupResponse = await fetch(`${apiBaseUrl}/v3/vault/setup-tokens/${encodeURIComponent(setupTokenId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    const setup = (await setupResponse.json().catch(() => ({}))) as PayPalSetupToken & { message?: string };
    if (!setupResponse.ok) {
      logger.error("paypal.vault.setup_token_lookup_failed", {
        provider: "paypal",
        operation: "get_setup_token",
        httpStatus: setupResponse.status,
        paypalDebugId: setupResponse.headers.get("paypal-debug-id"),
      });
      throw new ApiError(502, "Could not verify PayPal wallet approval", "PAYPAL_SETUP_LOOKUP_FAILED");
    }
    if (setup.status !== "APPROVED") {
      throw new ApiError(400, "PayPal wallet setup was not approved", "PAYPAL_SETUP_NOT_APPROVED");
    }

    const tokenResponse = await fetch(`${apiBaseUrl}/v3/vault/payment-tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `pudding-vault-${user.id}-${setupTokenId}`,
      },
      body: JSON.stringify({ payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } }),
    });
    const paymentToken = (await tokenResponse.json().catch(() => ({}))) as PayPalPaymentToken & { message?: string };
    if (!tokenResponse.ok || !paymentToken.id) {
      logger.error("paypal.vault.payment_token_creation_failed", {
        provider: "paypal",
        operation: "create_payment_token",
        httpStatus: tokenResponse.status,
        paypalDebugId: tokenResponse.headers.get("paypal-debug-id"),
      });
      throw new ApiError(502, "PayPal approved the wallet, but could not save its payment token", "PAYPAL_PAYMENT_TOKEN_FAILED");
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        paypalVaultId: paymentToken.id,
        paypalCustomerId: paymentToken.customer?.id ?? user.paypalCustomerId,
        paypalPayerId: paymentToken.payment_source?.paypal?.payer_id ?? user.paypalPayerId,
        paypalVerifiedEmail: paymentToken.payment_source?.paypal?.email_address?.toLowerCase() ?? user.paypalVerifiedEmail,
        paypalLinkedAt: user.paypalLinkedAt ?? new Date(),
        paypalSetupTokenId: null,
      },
    });
    const { ipAddress, userAgent } = getRequestMeta(req);
    await writeAuditLog({
      familyId: updatedUser.familyId,
      actorUserId: updatedUser.id,
      actorRole: updatedUser.role,
      action: "PAYPAL_WALLET_VAULTED",
      targetType: "User",
      targetId: updatedUser.id,
      details: { paypalCustomerId: updatedUser.paypalCustomerId },
      ipAddress,
      userAgent,
    });

    return NextResponse.redirect(appUrl("/paypal?paypal_vault=connected"));
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "PAYPAL_VAULT_CALLBACK_FAILED";
    if (error instanceof ApiError) {
      logger.warn("paypal.vault.return_failed", { provider: "paypal", errorCode: code });
    } else {
      logger.error("paypal.vault.return_failed", { provider: "paypal", errorCode: code }, error);
    }
    return NextResponse.redirect(appUrl(`/paypal?paypal_vault=error&code=${encodeURIComponent(code)}`));
  }
}
