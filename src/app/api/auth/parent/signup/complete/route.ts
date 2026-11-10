import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError, validateBody } from "@/lib/api-response";
import { clearParentSignupCookie, getParentSignupDraft } from "@/lib/parent-signup";
import { generateUniqueFamilyCode } from "@/lib/codes";
import { FULL_COPARENT_PERMISSIONS } from "@/lib/auth-guard";
import { setSessionCookie, signSessionToken } from "@/lib/jwt";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const completeSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  avatar: z.enum(["avatar-1", "avatar-2", "avatar-3", "avatar-4", "avatar-5", "avatar-6"]).default("avatar-1"),
  familyName: z.string().trim().min(2).max(100).optional(),
  currency: z.string().trim().length(3).default("USD"),
});

/** Creates the parent and family after the UI has completed its staged signup screens. */
export async function POST(req: NextRequest) {
  try {
    const draft = await getParentSignupDraft(req);
    const input = await validateBody(req, completeSchema);
    if (!draft.emailVerifiedAt || !draft.passwordHash) {
      throw new ApiError(403, "Email verification and password setup are required", "SIGNUP_STEPS_INCOMPLETE");
    }

    const securityQuestions = Array.isArray(draft.securityQuestions)
      ? (draft.securityQuestions as Array<{
          questionKey: string;
          questionText: string;
          answerHash: string;
        }>)
      : [];
    if (securityQuestions.length !== 2) {
      throw new ApiError(403, "Complete both security questions before finishing signup", "SECURITY_QUESTIONS_INCOMPLETE");
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: draft.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ApiError(409, "An account with this email already exists", "EMAIL_ALREADY_EXISTS");
    }

    const familyCode = await generateUniqueFamilyCode();
    const familyName = input.familyName || `${input.name.split(" ")[0]}'s Family`;
    const { ipAddress, userAgent } = getRequestMeta(req);
    const result = await prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: {
          name: familyName,
          familyCode,
          currency: input.currency.toUpperCase(),
          unallocatedBudget: new Prisma.Decimal(0),
        },
      });
      const user = await tx.user.create({
        data: {
          family: { connect: { id: family.id } },
          name: input.name,
          avatar: input.avatar,
          email: draft.email,
          passwordHash: draft.passwordHash!,
          role: "PRIMARY_PARENT",
          permissionLevel: "EQUAL",
          permissions: FULL_COPARENT_PERMISSIONS,
          isEmailVerified: true,
          isKycSimulatedVerified: false,
          lastLoginAt: new Date(),
        },
      });

      await tx.userSecurityQuestion.createMany({
        data: securityQuestions.map((question) => ({
          userId: user.id,
          questionKey: question.questionKey,
          questionText: question.questionText,
          answerHash: question.answerHash,
        })),
      });
      await tx.notificationPreference.create({ data: { userId: user.id } });
      await writeAuditLog(
        {
          familyId: family.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "PARENT_SIGNUP",
          targetType: "User",
          targetId: user.id,
          details: { email: user.email, familyCode: family.familyCode },
          ipAddress,
          userAgent,
        },
        tx
      );
      await tx.parentSignupDraft.delete({ where: { id: draft.id } });
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
    clearParentSignupCookie(response);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
