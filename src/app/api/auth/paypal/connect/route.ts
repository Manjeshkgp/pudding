import { getJwtSecretKey } from "@/lib/auth-secret";
import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
} from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { requireOnboardingSubscription } from "@/lib/onboarding";

function getStateSecret(): Uint8Array {
  return getJwtSecretKey();
}

/**
 * GET /api/auth/paypal/connect
 * Initiates "Log in with PayPal" OAuth flow (FR-1.4, INT-1).
 * Pass ?mode=json to get { authorizationUrl, state } in JSON, or default redirects directly.
 */
export async function GET(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req);
    await requireOnboardingSubscription(user);

    const clientId = process.env.PAYPAL_CLIENT_ID;
    if (!clientId) {
      throw new ApiError(
        500,
        "PAYPAL_CLIENT_ID is not configured on the server",
        "PAYPAL_CONFIG_MISSING",
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
      returnTo:
        req.nextUrl.searchParams.get("returnTo") === "paypal"
          ? "paypal"
          : "settings",
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
    if (
      error instanceof ApiError && error.code === "PAYPAL_TRIAL_REQUIRED" &&
      req.nextUrl.searchParams.get("mode") !== "json"
    )
      return new NextResponse(null, { status: 307, headers: { Location: "/api/auth/navigation/refresh?returnTo=%2Fonboarding%2Fplan" } });
    return handleRouteError(error);
  }
}
