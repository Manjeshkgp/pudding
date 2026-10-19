import { SignJWT, jwtVerify } from "jose";

export interface StepUpMfaPayload {
  sub: string;
  familyId: string | null;
  method: "EMAIL_OTP" | "SMS_OTP" | "SECURITY_QUESTION";
  actionScope: string;
}

function getJwtSecretKey(): Uint8Array {
  const secret =
    process.env.JWT_SECRET || "goodspend-default-dev-secret-key-32-chars-min";
  return new TextEncoder().encode(secret);
}

/**
 * Signs a short-lived (15 minute) step-up MFA token (`NFR-2`) after a Parent
 * completes an MFA challenge via Email OTP, SMS OTP, or Security Question.
 */
export async function signStepUpMfaToken(
  payload: StepUpMfaPayload
): Promise<string> {
  return new SignJWT({ ...payload, tokenType: "STEP_UP_MFA" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getJwtSecretKey());
}

export async function verifyStepUpMfaToken(
  token: string
): Promise<StepUpMfaPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    if (payload.tokenType !== "STEP_UP_MFA" || !payload.sub) {
      return null;
    }
    return {
      sub: String(payload.sub),
      familyId: payload.familyId ? String(payload.familyId) : null,
      method: payload.method as StepUpMfaPayload["method"],
      actionScope: String(payload.actionScope || "SENSITIVE_PARENT_ACTION"),
    };
  } catch {
    return null;
  }
}
