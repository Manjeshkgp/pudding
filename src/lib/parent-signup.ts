import { getJwtSecretKey } from "@/lib/auth-secret";
import { draftNextRoute } from "@/lib/navigation-policy";
import type { ParentSignupDraft } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";
import { getSessionFromRequest } from "@/lib/jwt";

export const PARENT_SIGNUP_COOKIE = "pudding_parent_signup";
const SIGNUP_TTL_MS = 60 * 60 * 1000;

export async function signParentSignupToken(
  draftId: string,
  saved?: ParentSignupDraft,
): Promise<string> {
  const draft =
    saved ||
    (await prisma.parentSignupDraft.findUniqueOrThrow({
      where: { id: draftId },
    }));
  return new SignJWT({
    purpose: "PARENT_SIGNUP",
    draftId,
    navigationVersion: 1,
    nextRoute: draftNextRoute(draft),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(draft.expiresAt.getTime() / 1000))
    .sign(getJwtSecretKey());
}

export async function getParentSignupDraft(req: NextRequest) {
  await assertSignupGuest(req);
  const token = req.cookies.get(PARENT_SIGNUP_COOKIE)?.value;
  if (!token) {
    throw new ApiError(
      401,
      "Signup session is missing or expired",
      "SIGNUP_SESSION_REQUIRED",
    );
  }

  let draftId: string;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: ["HS256"],
    });
    if (
      payload.purpose !== "PARENT_SIGNUP" ||
      typeof payload.draftId !== "string"
    ) {
      throw new Error("Invalid signup token");
    }
    draftId = payload.draftId;
  } catch {
    throw new ApiError(
      401,
      "Signup session is missing or expired",
      "SIGNUP_SESSION_INVALID",
    );
  }

  const draft = await prisma.parentSignupDraft.findUnique({
    where: { id: draftId },
  });
  if (!draft || draft.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(
      401,
      "Signup session has expired. Please start again.",
      "SIGNUP_SESSION_EXPIRED",
    );
  }
  return draft;
}

export async function assertSignupGuest(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return;
  const account =
    session.subjectType === "USER"
      ? await prisma.user.findUnique({
          where: { id: session.sub },
          select: { id: true },
        })
      : await prisma.child.findUnique({
          where: { id: session.sub },
          select: { id: true },
        });
  if (account)
    throw new ApiError(
      409,
      "You are already signed in. Sign out before creating another account.",
      "ALREADY_SIGNED_IN",
      { nextRoute: session.subjectType === "CHILD" ? "/home" : "/onboarding" },
    );
}

export function setParentSignupCookie(
  response: NextResponse,
  token: string,
): void {
  response.cookies.set(PARENT_SIGNUP_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SIGNUP_TTL_MS / 1000,
  });
  clearLegacySignupCookie(response);
}

export function clearParentSignupCookie(response: NextResponse): void {
  response.cookies.set(PARENT_SIGNUP_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  clearLegacySignupCookie(response);
}

function clearLegacySignupCookie(response: NextResponse) {
  response.headers.append(
    "Set-Cookie",
    `${PARENT_SIGNUP_COOKIE}=; Path=/api/auth/parent/signup; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}

export function refreshDraftExpiry(): Date {
  return new Date(Date.now() + SIGNUP_TTL_MS);
}

export async function refreshSignupProgressCookie(
  response: NextResponse,
  draft: ParentSignupDraft,
) {
  setParentSignupCookie(response, await signParentSignupToken(draft.id, draft));
}
