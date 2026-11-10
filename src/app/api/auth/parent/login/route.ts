import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { setSessionCookie, signSessionToken } from "@/lib/jwt";
import { enforceRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const parentLoginSchema = z.object({
  emailOrPhone: z.string().trim().min(3, "Email or phone is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: NextRequest) {
  try {
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, parentLoginSchema);
    const identifier = input.emailOrPhone.toLowerCase();

    const rateKey = `parent-login:${ipAddress}:${identifier}`;
    enforceRateLimit({
      key: rateKey,
      limit: 8,
      windowMs: 15 * 60 * 1000,
      errorMessage:
        "Too many failed login attempts. Please wait 15 minutes before trying again.",
    });

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: input.emailOrPhone.trim() }],
      },
      include: {
        family: true,
      },
    });

    if (!user) {
      throw new ApiError(401, "Invalid email/phone or password", "INVALID_CREDENTIALS");
    }

    const passwordValid = await bcrypt.compare(
      input.password,
      user.passwordHash
    );
    if (!passwordValid) {
      throw new ApiError(401, "Invalid email/phone or password", "INVALID_CREDENTIALS");
    }

    if (user.isFrozen) {
      throw new ApiError(
        403,
        "Your account has been frozen. Please contact support.",
        "ACCOUNT_FROZEN"
      );
    }

    if (user.family?.isFrozen && user.role !== "ADMIN") {
      throw new ApiError(
        403,
        "Your family account is currently frozen. Please contact support.",
        "FAMILY_FROZEN"
      );
    }

    resetRateLimit(rateKey);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await writeAuditLog({
      familyId: user.familyId,
      actorUserId: user.id,
      actorRole: user.role,
      action: "PARENT_LOGIN",
      targetType: "User",
      targetId: user.id,
      ipAddress,
      userAgent,
    });

    const token = await signSessionToken({
      sub: user.id,
      subjectType: "USER",
      familyId: user.familyId,
      role: user.role,
      permissionLevel: user.permissionLevel,
      email: user.email,
      name: user.name,
    });

    const response = apiSuccess(
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          email: user.email,
          phone: user.phone,
          role: user.role,
          permissionLevel: user.permissionLevel,
          permissions: user.permissions,
          isEmailVerified: user.isEmailVerified,
          isKycSimulatedVerified: user.isKycSimulatedVerified,
          paypalPayerId: user.paypalPayerId,
          paypalVerifiedEmail: user.paypalVerifiedEmail,
          paypalIsVerified: user.paypalIsVerified,
        },
        family: user.family
          ? {
              id: user.family.id,
              name: user.family.name,
              familyCode: user.family.familyCode,
              currency: user.family.currency,
              unallocatedBudget: user.family.unallocatedBudget.toString(),
              isFrozen: user.family.isFrozen,
            }
          : null,
      },
      200,
      "Logged in successfully"
    );

    setSessionCookie(response, token, "USER");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
