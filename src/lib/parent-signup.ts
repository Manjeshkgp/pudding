import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError } from "@/lib/api-response";

export const PARENT_SIGNUP_COOKIE = "pudding_parent_signup";
const SIGNUP_TTL_MS = 60 * 60 * 1000;

function secretKey(): Uint8Array {
  const secret =
    process.env.JWT_SECRET || "goodspend-default-dev-secret-key-32-chars-min";
  return new TextEncoder().encode(secret);
}

export async function signParentSignupToken(draftId: string): Promise<string> {
  return new SignJWT({ purpose: "PARENT_SIGNUP", draftId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secretKey());
}

export async function getParentSignupDraft(req: NextRequest) {
  const token = req.cookies.get(PARENT_SIGNUP_COOKIE)?.value;
  if (!token) {
    throw new ApiError(401, "Signup session is missing or expired", "SIGNUP_SESSION_REQUIRED");
  }

  let draftId: string;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== "PARENT_SIGNUP" || typeof payload.draftId !== "string") {
      throw new Error("Invalid signup token");
    }
    draftId = payload.draftId;
  } catch {
    throw new ApiError(401, "Signup session is missing or expired", "SIGNUP_SESSION_INVALID");
  }

  const draft = await prisma.parentSignupDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(401, "Signup session has expired. Please start again.", "SIGNUP_SESSION_EXPIRED");
  }
  return draft;
}

export function setParentSignupCookie(response: NextResponse, token: string): void {
  response.cookies.set(PARENT_SIGNUP_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/parent/signup",
    maxAge: SIGNUP_TTL_MS / 1000,
  });
}

export function clearParentSignupCookie(response: NextResponse): void {
  response.cookies.set(PARENT_SIGNUP_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/parent/signup",
    maxAge: 0,
  });
}

export function refreshDraftExpiry(): Date {
  return new Date(Date.now() + SIGNUP_TTL_MS);
}
