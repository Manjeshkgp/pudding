import { assertSignupGuest } from "@/lib/parent-signup";
import { NextRequest } from "next/server";
import { coParentNameFields, validateNameParts } from "@/lib/coparent-name";
import { isInviteExpired } from "@/lib/coparent-invite";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { setSessionCookie, signSessionToken } from "@/lib/jwt";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const acceptInviteSchema = z
  .object({
    inviteToken: z.string().trim().min(10, "Valid invite token is required"),
    ...coParentNameFields,
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{7,15}$/, "Invalid phone number")
      .optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(100),
  })
  .superRefine(validateNameParts);

/**
 * POST /api/family/co-parents/accept
 * Accepts a Co-Parent invitation token, creates the CO_PARENT User account in the family,
 * and logs them in immediately (FR-1.7).
 */
export async function POST(req: NextRequest) {
  try {
    await assertSignupGuest(req);
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, acceptInviteSchema);

    const invite = await prisma.coParentInvite.findUnique({
      where: { inviteToken: input.inviteToken },
      include: { family: true },
    });

    if (!invite) {
      throw new ApiError(404, "Invalid invitation token", "INVITE_NOT_FOUND");
    }

    if (
      invite.status === "EXPIRED" ||
      (invite.status === "PENDING" && isInviteExpired(invite))
    )
      throw new ApiError(
        410,
        "This invitation expired. Ask the primary parent to resend it.",
        "INVITE_EXPIRED",
      );
    if (invite.status !== "PENDING") {
      throw new ApiError(
        409,
        `Invitation is no longer active (status: ${invite.status})`,
        "INVITE_NOT_PENDING",
      );
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email: invite.email },
      select: { id: true },
    });

    if (existingEmail) {
      throw new ApiError(
        409,
        "An account with this email already exists",
        "EMAIL_ALREADY_EXISTS",
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const coParent = await prisma.$transaction(async (tx) => {
      // Match the lock order used by creation and resend.
      await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id" = ${invite.familyId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "CoParentInvite" WHERE "id" = ${invite.id} FOR UPDATE`;
      const fresh = await tx.coParentInvite.findUniqueOrThrow({
        where: { id: invite.id },
      });
      if (fresh.status !== "PENDING")
        throw new ApiError(409, "This invitation is no longer active.");
      if (isInviteExpired(fresh))
        throw new ApiError(
          410,
          "This invitation expired. Ask the primary parent to resend it.",
          "INVITE_EXPIRED",
        );
      const firstName = input.firstName ?? fresh.firstName;
      const lastName = input.lastName ?? fresh.lastName;
      const createdUser = await tx.user.create({
        data: {
          familyId: invite.familyId,
          email: invite.email,
          name:
            firstName && lastName
              ? `${firstName} ${lastName}`
              : input.name || fresh.name,
          firstName,
          lastName,
          phone: input.phone ?? null,
          passwordHash,
          role: "CO_PARENT",
          onboardingCompletedAt: new Date(),
          permissionLevel: invite.permissionLevel,
          permissions: invite.permissions
            ? (invite.permissions as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          isEmailVerified: true,
          lastLoginAt: new Date(),
        },
      });

      await tx.notificationPreference.create({
        data: {
          userId: createdUser.id,
          pushEnabled: true,
          emailEnabled: true,
          smsEnabled: false,
          notifyEveryTransaction: true,
          weeklyDigestEnabled: true,
        },
      });

      await tx.coParentInvite.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
        },
      });

      await writeAuditLog(
        {
          familyId: invite.familyId,
          actorUserId: createdUser.id,
          actorRole: createdUser.role,
          action: "COPARENT_INVITE_ACCEPTED",
          targetType: "User",
          targetId: createdUser.id,
          details: {
            inviteId: invite.id,
            permissionLevel: createdUser.permissionLevel,
          },
          ipAddress,
          userAgent,
        },
        tx,
      );

      return createdUser;
    });

    const token = await signSessionToken({
      sub: coParent.id,
      subjectType: "USER",
      familyId: invite.familyId,
      role: coParent.role,
      permissionLevel: coParent.permissionLevel,
      email: coParent.email,
      name: coParent.name,
    });

    const response = apiSuccess(
      {
        token,
        user: {
          id: coParent.id,
          name: coParent.name,
          email: coParent.email,
          role: coParent.role,
          permissionLevel: coParent.permissionLevel,
          permissions: coParent.permissions,
        },
        family: {
          id: invite.family.id,
          name: invite.family.name,
          familyCode: invite.family.familyCode,
          currency: invite.family.currency,
        },
      },
      201,
      "Co-parent invitation accepted and account created",
    );

    setSessionCookie(response, token, "USER");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token || token.length < 10)
      throw new ApiError(400, "Open a valid invitation link.");
    const invite = await prisma.coParentInvite.findUnique({
      where: { inviteToken: token },
      include: { family: { select: { name: true } } },
    });
    if (!invite) throw new ApiError(404, "Invitation not found.");
    if (
      invite.status === "EXPIRED" ||
      (invite.status === "PENDING" && isInviteExpired(invite))
    )
      throw new ApiError(
        410,
        "This invitation expired. Ask the primary parent to resend it.",
        "INVITE_EXPIRED",
      );
    if (invite.status !== "PENDING")
      throw new ApiError(410, "This invitation is no longer available.");
    return apiSuccess({
      name: invite.name,
      firstName: invite.firstName,
      lastName: invite.lastName,
      familyName: invite.family.name,
      permissionLevel: invite.permissionLevel,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
