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
import { generateUniqueFamilyCode } from "@/lib/codes";
import { setSessionCookie, signSessionToken } from "@/lib/jwt";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";
import { FULL_COPARENT_PERMISSIONS } from "@/lib/auth-guard";

const parentSignupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  avatar: z.enum(["avatar-1", "avatar-2", "avatar-3", "avatar-4", "avatar-5", "avatar-6"]).default("avatar-1"),
  email: z.string().trim().email("Valid email address is required").toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,15}$/, "Invalid phone number")
    .optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100),
  familyName: z
    .string()
    .trim()
    .min(2, "Family name must be at least 2 characters")
    .max(100)
    .optional(),
  currency: z.string().trim().length(3).default("USD"),
});

export async function POST(req: NextRequest) {
  try {
    const { ipAddress, userAgent } = getRequestMeta(req);

    enforceRateLimit({
      key: `signup:${ipAddress}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
      errorMessage: "Too many signup attempts from this IP. Please wait 15 minutes.",
    });

    const input = await validateBody(req, parentSignupSchema);

    const existingEmail = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existingEmail) {
      throw new ApiError(
        409,
        "An account with this email already exists",
        "EMAIL_ALREADY_EXISTS"
      );
    }

    if (input.phone) {
      const existingPhone = await prisma.user.findUnique({
        where: { phone: input.phone },
        select: { id: true },
      });
      if (existingPhone) {
        throw new ApiError(
          409,
          "An account with this phone number already exists",
          "PHONE_ALREADY_EXISTS"
        );
      }
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const familyCode = await generateUniqueFamilyCode();
    const derivedFamilyName =
      input.familyName || `${input.name.split(" ")[0]}'s Family`;

    const result = await prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: {
          name: derivedFamilyName,
          familyCode,
          currency: input.currency.toUpperCase(),
          unallocatedBudget: 0,
        },
      });

      const user = await tx.user.create({
        data: {
          familyId: family.id,
          name: input.name,
          avatar: input.avatar,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          role: "PRIMARY_PARENT",
          permissionLevel: "EQUAL",
          permissions: FULL_COPARENT_PERMISSIONS,
          isEmailVerified: false,
          isKycSimulatedVerified: false,
          lastLoginAt: new Date(),
        },
      });

      await tx.notificationPreference.create({
        data: {
          userId: user.id,
          pushEnabled: true,
          emailEnabled: true,
          smsEnabled: false,
          notifyEveryTransaction: true,
          weeklyDigestEnabled: true,
        },
      });

      await writeAuditLog(
        {
          familyId: family.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "PARENT_SIGNUP",
          targetType: "User",
          targetId: user.id,
          details: {
            email: user.email,
            familyCode: family.familyCode,
          },
          ipAddress,
          userAgent,
        },
        tx
      );

      return { user, family };
    });

    const token = await signSessionToken({
      sub: result.user.id,
      subjectType: "USER",
      familyId: result.family.id,
      role: result.user.role,
      permissionLevel: result.user.permissionLevel,
      email: result.user.email,
      name: result.user.name,
    });

    const response = apiSuccess(
      {
        token,
        user: {
          id: result.user.id,
          name: result.user.name,
          avatar: result.user.avatar,
          email: result.user.email,
          phone: result.user.phone,
          role: result.user.role,
          permissionLevel: result.user.permissionLevel,
          isEmailVerified: result.user.isEmailVerified,
          paypalIsVerified: result.user.paypalIsVerified,
          paypalVerifiedEmail: result.user.paypalVerifiedEmail,
        },
        family: {
          id: result.family.id,
          name: result.family.name,
          familyCode: result.family.familyCode,
          currency: result.family.currency,
          unallocatedBudget: result.family.unallocatedBudget.toString(),
        },
      },
      201,
      "Parent account and family created successfully"
    );

    setSessionCookie(response, token, "USER");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
