import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

function getStateSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || "goodspend-default-dev-secret-key-32-chars-min"
  );
}

interface PayPalUserInfoResponse {
  user_id?: string;
  payer_id?: string;
  name?: string;
  email?: string;
  verified?: boolean | string;
  verified_account?: boolean | string;
  emails?: Array<{
    value: string;
    primary?: boolean;
    confirmed?: boolean;
  }>;
}

/**
 * GET /api/auth/paypal/callback
 * Handles the OAuth 2.0 callback from "Log in with PayPal" (FR-1.4, INT-1).
 * Exchanges the code for an access token, calls PayPal Identity API, and stores
 * only the verified email, payer_id, and verified_account status.
 */
export async function GET(req: NextRequest) {
  try {
    const { ipAddress, userAgent } = getRequestMeta(req);
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const errorParam = req.nextUrl.searchParams.get("error");

    if (errorParam) {
      throw new ApiError(
        400,
        `PayPal OAuth authorization denied: ${errorParam}`,
        "PAYPAL_OAUTH_DENIED"
      );
    }

    if (!code || !state) {
      throw new ApiError(
        400,
        "Missing authorization code or state parameter",
        "INVALID_OAUTH_CALLBACK"
      );
    }

    let statePayload: { userId: string; familyId: string; purpose: string };
    try {
      const verified = await jwtVerify(state, getStateSecret());
      statePayload = verified.payload as unknown as {
        userId: string;
        familyId: string;
        purpose: string;
      };
    } catch {
      throw new ApiError(
        400,
        "Invalid or expired OAuth state token",
        "INVALID_OAUTH_STATE"
      );
    }

    if (statePayload.purpose !== "PAYPAL_OAUTH_STATE" || !statePayload.userId) {
      throw new ApiError(400, "Invalid OAuth state purpose", "INVALID_OAUTH_STATE");
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const apiBaseUrl =
      process.env.PAYPAL_API_BASE_URL || "https://api-m.sandbox.paypal.com";
    const redirectUri =
      process.env.PAYPAL_OAUTH_REDIRECT_URI ||
      `${process.env.APP_BASE_URL || "http://localhost:3000"}/api/auth/paypal/callback`;

    if (!clientId || !clientSecret) {
      throw new ApiError(
        500,
        "PayPal credentials are not configured",
        "PAYPAL_CONFIG_MISSING"
      );
    }

    // 1. Exchange authorization code for access_token
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    );
    const tokenRes = await fetch(`${apiBaseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      throw new ApiError(
        502,
        "Failed to exchange PayPal authorization code",
        "PAYPAL_TOKEN_EXCHANGE_FAILED",
        errBody
      );
    }

    const tokenData = (await tokenRes.json()) as { access_token: string };

    // 2. Fetch PayPal user profile and verified_account status
    const userInfoRes = await fetch(
      `${apiBaseUrl}/v1/identity/oauth2/userinfo?schema=paypalv1.1`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!userInfoRes.ok) {
      const errBody = await userInfoRes.text();
      throw new ApiError(
        502,
        "Failed to fetch PayPal identity profile",
        "PAYPAL_USERINFO_FAILED",
        errBody
      );
    }

    const profile = (await userInfoRes.json()) as PayPalUserInfoResponse;

    const primaryEmailObj =
      profile.emails?.find((e) => e.primary) || profile.emails?.[0];
    const verifiedEmail = primaryEmailObj?.value || profile.email;

    const rawPayerId =
      profile.payer_id ||
      (profile.user_id ? profile.user_id.split("/").pop() : undefined);

    if (!rawPayerId || !verifiedEmail) {
      throw new ApiError(
        400,
        "PayPal profile did not return a valid payer ID or email address",
        "PAYPAL_PROFILE_INCOMPLETE"
      );
    }

    const isVerified =
      profile.verified_account === true ||
      profile.verified_account === "true" ||
      profile.verified === true ||
      profile.verified === "true";

    // Check if another user already linked this PayPal account
    const conflictingUser = await prisma.user.findFirst({
      where: {
        paypalPayerId: rawPayerId,
        NOT: { id: statePayload.userId },
      },
      select: { id: true },
    });

    if (conflictingUser) {
      throw new ApiError(
        409,
        "This PayPal account is already linked to another GoodSpend user",
        "PAYPAL_ALREADY_LINKED"
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: statePayload.userId },
      data: {
        paypalPayerId: rawPayerId,
        paypalVerifiedEmail: verifiedEmail.toLowerCase(),
        paypalIsVerified: isVerified,
        isKycSimulatedVerified: isVerified,
        paypalLinkedAt: new Date(),
      },
    });

    await writeAuditLog({
      familyId: statePayload.familyId,
      actorUserId: updatedUser.id,
      actorRole: updatedUser.role,
      action: "PAYPAL_OAUTH_LINKED",
      targetType: "User",
      targetId: updatedUser.id,
      details: {
        paypalPayerId: rawPayerId,
        paypalVerifiedEmail: verifiedEmail.toLowerCase(),
        paypalIsVerified: isVerified,
      },
      ipAddress,
      userAgent,
    });

    const format = req.nextUrl.searchParams.get("format");
    const acceptsJson = req.headers
      .get("accept")
      ?.includes("application/json");

    if (format === "json" || acceptsJson) {
      return apiSuccess(
        {
          paypalPayerId: updatedUser.paypalPayerId,
          paypalVerifiedEmail: updatedUser.paypalVerifiedEmail,
          paypalIsVerified: updatedUser.paypalIsVerified,
          paypalLinkedAt: updatedUser.paypalLinkedAt,
        },
        200,
        "PayPal account connected successfully"
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(
      `${appUrl}/parent/settings?paypal_linked=true`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
