import { getJwtSecretKey } from "@/lib/auth-secret";
import {
  claimFromState,
  parseNavigationClaim,
  SessionNavigationClaim,
} from "@/lib/navigation-claims";
import type { NavigationState } from "@/lib/navigation-policy";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { CoParentPermissionLevel, UserRole } from "@prisma/client";

export const SESSION_COOKIE_NAME = "goodspend_session";

export type SessionSubjectType = "USER" | "CHILD";

export interface SessionPayload {
  sub: string;
  subjectType: SessionSubjectType;
  familyId: string | null;
  role: UserRole | "CHILD";
  permissionLevel?: CoParentPermissionLevel;
  email?: string;
  name: string;
  navigation?: SessionNavigationClaim;
  exp?: number;
}

export async function signSessionToken(
  payload: SessionPayload,
  expiresIn?: string | number,
  currentState?: NavigationState,
): Promise<string> {
  const { accountNavigationState } = await import("@/lib/onboarding");
  const state = currentState || (await accountNavigationState(payload));
  if (!state) throw new Error("Cannot create a session for a missing account.");
  const navigation = claimFromState(state);
  const defaultExpiry =
    payload.subjectType === "CHILD"
      ? process.env.CHILD_SESSION_EXPIRES_IN || "30d"
      : process.env.PARENT_SESSION_EXPIRES_IN || "7d";

  return new SignJWT({ ...payload, purpose: "SESSION", navigation })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn || defaultExpiry)
    .sign(getJwtSecretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  const key = getJwtSecretKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (
      !payload.sub ||
      !["USER", "CHILD"].includes(String(payload.subjectType)) ||
      !Number.isFinite(payload.exp) ||
      (payload.subjectType === "CHILD"
        ? payload.role !== "CHILD"
        : !["PRIMARY_PARENT", "CO_PARENT", "ADMIN"].includes(
            String(payload.role),
          )) ||
      (payload.purpose && payload.purpose !== "SESSION")
    ) {
      return null;
    }
    return {
      sub: String(payload.sub),
      subjectType: payload.subjectType as SessionSubjectType,
      familyId: payload.familyId ? String(payload.familyId) : null,
      role: payload.role as UserRole | "CHILD",
      permissionLevel: payload.permissionLevel as
        | CoParentPermissionLevel
        | undefined,
      email: payload.email ? String(payload.email) : undefined,
      name: String(payload.name || ""),
      exp: payload.exp,
      navigation: parseNavigationClaim(
        payload.navigation,
        payload.subjectType as SessionSubjectType,
      ),
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  subjectType: SessionSubjectType,
  expiresAt?: number,
): void {
  const maxAgeSeconds =
    subjectType === "CHILD" ? 60 * 60 * 24 * 30 : 60 * 60 * 24 * 7;

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: expiresAt
      ? Math.max(
          0,
          Math.min(maxAgeSeconds, expiresAt - Math.floor(Date.now() / 1000)),
        )
      : maxAgeSeconds,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionFromRequest(
  req: NextRequest,
): Promise<SessionPayload | null> {
  // Check Authorization Bearer header first, then HTTP-only cookie
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      return verifySessionToken(token);
    }
  }

  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookieToken) {
    return null;
  }

  return verifySessionToken(cookieToken);
}
