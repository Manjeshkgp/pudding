import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

function getStateSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || "goodspend-default-dev-secret-key-32-chars-min"
  );
}

/**
 * GET /api/auth/paypal/connect
 * Initiates "Log in with PayPal" OAuth flow (FR-1.4, INT-1).
 * Pass ?mode=json to get { authorizationUrl, state } in JSON, or default redirects directly.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req);

    const clientId = process.env.PAYPAL_CLIENT_ID;
    if (!clientId) {
      throw new ApiError(
        500,
        "PAYPAL_CLIENT_ID is not configured on the server",
        "PAYPAL_CONFIG_MISSING"
      );
    }

    const authBaseUrl =
      process.env.PAYPAL_AUTH_BASE_URL || "https://www.sandbox.paypal.com";
    const redirectUri =
      process.env.PAYPAL_OAUTH_REDIRECT_URI ||
      `${process.env.APP_BASE_URL || "http://localhost:3000"}/api/auth/paypal/callback`;

    const state = await new SignJWT({
      userId: user.id,
      familyId: family.id,
      purpose: "PAYPAL_OAUTH_STATE",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(getStateSecret());

    const scopes = [
      "openid",
      "profile",
      "email",
      "https://uri.paypal.com/services/paypalattributes",
    ].join(" ");

    const params = new URLSearchParams({
      flowEntry: "static",
      client_id: clientId,
      response_type: "code",
      scope: scopes,
      redirect_uri: redirectUri,
      state,
    });

    const authorizationUrl = `${authBaseUrl}/signin/authorize?${params.toString()}`;

    const mode = req.nextUrl.searchParams.get("mode");
    if (mode === "json") {
      return apiSuccess({
        authorizationUrl,
        redirectUri,
        state,
      });
    }

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    return handleRouteError(error);
  }
}

const sandboxSimulateSchema = z.object({
  paypalEmail: z.string().trim().email("Valid PayPal email required").toLowerCase(),
  paypalPayerId: z.string().trim().min(5).max(64).optional(),
  verifiedAccount: z.boolean().default(true),
});

/**
 * POST /api/auth/paypal/connect
 * Sandbox Simulation Helper (FR-1.3 / FR-1.4):
 * Allows linking and testing a PayPal Sandbox account directly in development/sandbox mode.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req);
    const { ipAddress, userAgent } = getRequestMeta(req);

    if (process.env.PAYPAL_ENV === "live" && process.env.NODE_ENV === "production") {
      throw new ApiError(
        403,
        "Simulated PayPal linking is only permitted in Sandbox mode",
        "SANDBOX_ONLY"
      );
    }

    const input = await validateBody(req, sandboxSimulateSchema);
    const payerId =
      input.paypalPayerId ||
      `SBX_${user.id.slice(-8).toUpperCase()}_${Date.now().toString(36).toUpperCase()}`;

    const existingOwner = await prisma.user.findFirst({
      where: {
        paypalPayerId: payerId,
        NOT: { id: user.id },
      },
      select: { id: true },
    });

    if (existingOwner) {
      throw new ApiError(
        409,
        "This PayPal account is already linked to another user",
        "PAYPAL_ALREADY_LINKED"
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        paypalPayerId: payerId,
        paypalVerifiedEmail: input.paypalEmail,
        paypalIsVerified: input.verifiedAccount,
        isKycSimulatedVerified: input.verifiedAccount,
        paypalLinkedAt: new Date(),
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "PAYPAL_ACCOUNT_LINKED_SANDBOX",
      targetType: "User",
      targetId: user.id,
      details: {
        paypalVerifiedEmail: updatedUser.paypalVerifiedEmail,
        paypalPayerId: updatedUser.paypalPayerId,
        paypalIsVerified: updatedUser.paypalIsVerified,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        paypalPayerId: updatedUser.paypalPayerId,
        paypalVerifiedEmail: updatedUser.paypalVerifiedEmail,
        paypalIsVerified: updatedUser.paypalIsVerified,
        isKycSimulatedVerified: updatedUser.isKycSimulatedVerified,
        paypalLinkedAt: updatedUser.paypalLinkedAt,
      },
      200,
      "PayPal account linked and verified successfully"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
