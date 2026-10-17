import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import {
  DEFAULT_LIMITED_COPARENT_PERMISSIONS,
  FULL_COPARENT_PERMISSIONS,
  requireParent,
  requirePrimaryParent,
} from "@/lib/auth-guard";
import { generateSecureToken } from "@/lib/codes";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const inviteCoParentSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().email("Valid email address is required").toLowerCase(),
  permissionLevel: z.enum(["EQUAL", "LIMITED"]).default("EQUAL"),
  permissions: z
    .object({
      canManageBudget: z.boolean().optional(),
      canManageAllowances: z.boolean().optional(),
      canApproveChores: z.boolean().optional(),
      canApproveSpending: z.boolean().optional(),
      canManageChildren: z.boolean().optional(),
      canManageSpendingRules: z.boolean().optional(),
    })
    .optional(),
});

const updateCoParentSchema = z.object({
  coParentUserId: z.string().trim().min(1),
  permissionLevel: z.enum(["EQUAL", "LIMITED"]),
  permissions: z
    .object({
      canManageBudget: z.boolean().optional(),
      canManageAllowances: z.boolean().optional(),
      canApproveChores: z.boolean().optional(),
      canApproveSpending: z.boolean().optional(),
      canManageChildren: z.boolean().optional(),
      canManageSpendingRules: z.boolean().optional(),
    })
    .optional(),
});

/**
 * GET /api/family/co-parents
 * Lists all active guardians/parents in the family plus pending co-parent invitations (FR-1.7).
 */
export async function GET(req: NextRequest) {
  try {
    const { family } = await requireParent(req);

    const [parents, invites] = await Promise.all([
      prisma.user.findMany({
        where: { familyId: family.id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          permissionLevel: true,
          permissions: true,
          paypalIsVerified: true,
          paypalVerifiedEmail: true,
          isFrozen: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.coParentInvite.findMany({
        where: { familyId: family.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return apiSuccess({
      parents,
      invites,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/family/co-parents
 * Primary Parent invites a Co-Parent with EQUAL or LIMITED permissions (FR-1.7).
 */
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requirePrimaryParent(req);
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, inviteCoParentSchema);

    if (input.email === user.email) {
      throw new ApiError(400, "You cannot invite yourself as a co-parent");
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, familyId: true },
    });

    if (existingUser) {
      if (existingUser.familyId === family.id) {
        throw new ApiError(
          409,
          "This person is already a guardian in your family",
          "ALREADY_IN_FAMILY"
        );
      }
      throw new ApiError(
        409,
        "This email is already registered to another account",
        "EMAIL_ALREADY_REGISTERED"
      );
    }

    // Expire any previous pending invites for the same email in this family
    await prisma.coParentInvite.updateMany({
      where: {
        familyId: family.id,
        email: input.email,
        status: "PENDING",
      },
      data: {
        status: "REVOKED",
      },
    });

    const resolvedPermissions =
      input.permissionLevel === "EQUAL"
        ? FULL_COPARENT_PERMISSIONS
        : {
            ...DEFAULT_LIMITED_COPARENT_PERMISSIONS,
            ...(input.permissions ?? {}),
          };

    const inviteToken = generateSecureToken(24);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await prisma.coParentInvite.create({
      data: {
        familyId: family.id,
        invitedByUserId: user.id,
        email: input.email,
        name: input.name,
        permissionLevel: input.permissionLevel,
        permissions: resolvedPermissions as Prisma.InputJsonValue,
        inviteToken,
        status: "PENDING",
        expiresAt,
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "COPARENT_INVITED",
      targetType: "CoParentInvite",
      targetId: invite.id,
      details: {
        invitedEmail: invite.email,
        permissionLevel: invite.permissionLevel,
        permissions: resolvedPermissions,
      },
      ipAddress,
      userAgent,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    return apiSuccess(
      {
        invite: {
          id: invite.id,
          email: invite.email,
          name: invite.name,
          permissionLevel: invite.permissionLevel,
          permissions: invite.permissions,
          inviteToken: invite.inviteToken,
          inviteAcceptUrl: `${appUrl}/accept-invite?token=${invite.inviteToken}`,
          status: invite.status,
          expiresAt: invite.expiresAt,
        },
      },
      201,
      "Co-parent invitation created"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/family/co-parents
 * Primary Parent updates an existing Co-Parent's permission level or granular permissions (FR-1.7).
 */
export async function PATCH(req: NextRequest) {
  try {
    const { user, family } = await requirePrimaryParent(req);
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, updateCoParentSchema);

    const coParent = await prisma.user.findUnique({
      where: { id: input.coParentUserId },
    });

    if (
      !coParent ||
      coParent.familyId !== family.id ||
      coParent.role !== "CO_PARENT"
    ) {
      throw new ApiError(
        404,
        "Co-parent not found in your family",
        "COPARENT_NOT_FOUND"
      );
    }

    const resolvedPermissions =
      input.permissionLevel === "EQUAL"
        ? FULL_COPARENT_PERMISSIONS
        : {
            ...DEFAULT_LIMITED_COPARENT_PERMISSIONS,
            ...(input.permissions ?? {}),
          };

    const updated = await prisma.user.update({
      where: { id: coParent.id },
      data: {
        permissionLevel: input.permissionLevel,
        permissions: resolvedPermissions as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        permissionLevel: true,
        permissions: true,
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "COPARENT_PERMISSIONS_UPDATED",
      targetType: "User",
      targetId: coParent.id,
      details: {
        permissionLevel: updated.permissionLevel,
        permissions: resolvedPermissions,
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(updated, 200, "Co-parent permissions updated");
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/family/co-parents?inviteId=... or ?coParentUserId=...
 * Primary Parent revokes a pending invite or removes a co-parent from the family.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { user, family } = await requirePrimaryParent(req);
    const { ipAddress, userAgent } = getRequestMeta(req);

    const inviteId = req.nextUrl.searchParams.get("inviteId");
    const coParentUserId = req.nextUrl.searchParams.get("coParentUserId");

    if (inviteId) {
      const invite = await prisma.coParentInvite.findUnique({
        where: { id: inviteId },
      });

      if (!invite || invite.familyId !== family.id) {
        throw new ApiError(404, "Invite not found", "INVITE_NOT_FOUND");
      }

      await prisma.coParentInvite.update({
        where: { id: invite.id },
        data: { status: "REVOKED" },
      });

      await writeAuditLog({
        familyId: family.id,
        actorUserId: user.id,
        actorRole: user.role,
        action: "COPARENT_INVITE_REVOKED",
        targetType: "CoParentInvite",
        targetId: invite.id,
        ipAddress,
        userAgent,
      });

      return apiSuccess(
        { revokedInviteId: invite.id },
        200,
        "Co-parent invitation revoked"
      );
    }

    if (coParentUserId) {
      const coParent = await prisma.user.findUnique({
        where: { id: coParentUserId },
      });

      if (
        !coParent ||
        coParent.familyId !== family.id ||
        coParent.role !== "CO_PARENT"
      ) {
        throw new ApiError(404, "Co-parent not found", "COPARENT_NOT_FOUND");
      }

      await prisma.user.delete({
        where: { id: coParent.id },
      });

      await writeAuditLog({
        familyId: family.id,
        actorUserId: user.id,
        actorRole: user.role,
        action: "COPARENT_REMOVED",
        targetType: "User",
        targetId: coParent.id,
        details: { email: coParent.email },
        ipAddress,
        userAgent,
      });

      return apiSuccess(
        { removedCoParentId: coParent.id },
        200,
        "Co-parent removed from family"
      );
    }

    throw new ApiError(
      400,
      "Provide either inviteId or coParentUserId query parameter"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
