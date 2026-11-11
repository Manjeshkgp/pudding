import { refreshSessionNavigation } from "@/lib/refresh-navigation";
import { getJwtSecretKey } from "@/lib/auth-secret";
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { linkPayPalIdentity } from "@/lib/paypal-link";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

function getStateSecret(): Uint8Array {
  return getJwtSecretKey();
}

interface PayPalUserInfoResponse {
  user_id?: string;
  sub?: string;
  payer_id?: string;
  account_id?: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
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
        "PAYPAL_OAUTH_DENIED",
      );
    }

    if (!code || !state) {
      throw new ApiError(
        400,
        "Missing authorization code or state parameter",
        "INVALID_OAUTH_CALLBACK",
      );
    }

    let statePayload: {
      userId: string;
      familyId: string;
      purpose: string;
      returnTo?: string;
    };
    try {
      const verified = await jwtVerify(state, getStateSecret(), {
        algorithms: ["HS256"],
      });
      statePayload = verified.payload as unknown as {
        userId: string;
        familyId: string;
        purpose: string;
        returnTo?: string;
      };
    } catch {
      throw new ApiError(
        400,
        "Invalid or expired OAuth state token",
        "INVALID_OAUTH_STATE",
      );
    }

    if (statePayload.purpose !== "PAYPAL_OAUTH_STATE" || !statePayload.userId) {
      throw new ApiError(
        400,
        "Invalid OAuth state purpose",
        "INVALID_OAUTH_STATE",
      );
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
        "PAYPAL_CONFIG_MISSING",
      );
    }

    // 1. Exchange authorization code for access_token
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64",
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
      logger.error("paypal.oauth.code_exchange_failed", {
        provider: "paypal",
        operation: "exchange_authorization_code",
        httpStatus: tokenRes.status,
        paypalDebugId: tokenRes.headers.get("paypal-debug-id"),
        providerError: errBody,
      });
      throw new ApiError(
        502,
        "Failed to exchange PayPal authorization code",
        "PAYPAL_TOKEN_EXCHANGE_FAILED",
        {
          httpStatus: tokenRes.status,
          paypalDebugId: tokenRes.headers.get("paypal-debug-id"),
        },
      );
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      scope?: string;
    };

    if (!tokenData.refresh_token) {
      throw new ApiError(
        502,
        "PayPal did not return a refresh token for the identity flow",
        "PAYPAL_REFRESH_TOKEN_MISSING",
        { grantedScopes: tokenData.scope },
      );
    }

    // PayPal's Log in with PayPal guide recommends refreshing this token
    // before requesting the user's profile.
    const refreshRes = await fetch(`${apiBaseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokenData.refresh_token,
      }),
    });

    if (!refreshRes.ok) {
      const errBody = await refreshRes.text();
      logger.error("paypal.oauth.token_refresh_failed", {
        provider: "paypal",
        operation: "refresh_identity_token",
        httpStatus: refreshRes.status,
        paypalDebugId: refreshRes.headers.get("paypal-debug-id"),
        providerError: errBody,
      });
      throw new ApiError(
        502,
        "Failed to refresh PayPal identity access token",
        "PAYPAL_TOKEN_REFRESH_FAILED",
        {
          status: refreshRes.status,
          statusText: refreshRes.statusText,
          paypalDebugId: refreshRes.headers.get("paypal-debug-id"),
        },
      );
    }

    const refreshedToken = (await refreshRes.json()) as {
      access_token: string;
      scope?: string;
    };

    // 2. Fetch the profile using the endpoint specified by PayPal's
    // Log in with PayPal integration guide.
    const userInfoRes = await fetch(
      `${apiBaseUrl}/v1/identity/oauth2/userinfo`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${refreshedToken.access_token}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!userInfoRes.ok) {
      const errBody = await userInfoRes.text();
      let paypalError: unknown = errBody || undefined;
      if (errBody) {
        try {
          const parsed = JSON.parse(errBody) as Record<string, unknown>;
          paypalError = {
            error: parsed.error,
            error_description: parsed.error_description,
          };
        } catch {
          // Keep a short response excerpt only; never include OAuth credentials.
          paypalError = errBody.slice(0, 300);
        }
      }
      logger.error("paypal.oauth.userinfo_failed", {
        provider: "paypal",
        operation: "get_userinfo",
        httpStatus: userInfoRes.status,
        paypalDebugId: userInfoRes.headers.get("paypal-debug-id"),
        providerError: paypalError,
      });
      throw new ApiError(
        502,
        "Failed to fetch PayPal identity profile",
        "PAYPAL_USERINFO_FAILED",
        {
          status: userInfoRes.status,
          statusText: userInfoRes.statusText,
          paypalDebugId: userInfoRes.headers.get("paypal-debug-id"),
          grantedScopes: refreshedToken.scope || tokenData.scope,
          paypalError,
        },
      );
    }

    const profile = (await userInfoRes.json()) as PayPalUserInfoResponse;

    const primaryEmailObj =
      profile.emails?.find((e) => e.primary) || profile.emails?.[0];
    const verifiedEmail = primaryEmailObj?.value || profile.email;

    const rawPayerId =
      profile.payer_id ||
      profile.account_id ||
      (profile.user_id || profile.sub
        ? (profile.user_id || profile.sub)!.split("/").pop()
        : undefined);

    if (!rawPayerId || !verifiedEmail) {
      throw new ApiError(
        400,
        "PayPal profile did not return a valid payer ID or email address",
        "PAYPAL_PROFILE_INCOMPLETE",
      );
    }

    const isVerified =
      profile.verified_account === true ||
      profile.verified_account === "true" ||
      profile.verified === true ||
      profile.verified === "true";

    const updatedUser = await linkPayPalIdentity(
      statePayload.userId,
      rawPayerId,
      {
        paypalVerifiedEmail: verifiedEmail.toLowerCase(),
        paypalIsVerified: isVerified,
        isKycSimulatedVerified: isVerified,
        paypalLinkedAt: new Date(),
      },
    );

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
    const acceptsJson = req.headers.get("accept")?.includes("application/json");

    if (format === "json" || acceptsJson) {
      const response = apiSuccess(
        {
          paypalPayerId: updatedUser.paypalPayerId,
          paypalVerifiedEmail: updatedUser.paypalVerifiedEmail,
          paypalIsVerified: updatedUser.paypalIsVerified,
          paypalLinkedAt: updatedUser.paypalLinkedAt,
        },
        200,
        "PayPal account connected successfully",
      );
      await refreshSessionNavigation(req, response);
      return response;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const returnPath =
      statePayload.returnTo === "paypal"
        ? "/paypal?paypal_oauth=connected"
        : "/account/paypal?paypal_oauth=connected";
    const response = NextResponse.redirect(`${appUrl}${returnPath}`);
    await refreshSessionNavigation(req, response);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
