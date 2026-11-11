import { olderThan, pageCursor, pageSize, takePage } from "@/lib/list-page";
import { deliverCoParentInvite } from "@/services/coparent-invite.service";
import { inviteExpiresAt, pendingInviteView } from "@/lib/coparent-invite";
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
import { coParentNameFields, validateNameParts } from "@/lib/coparent-name";

const inviteCoParentSchema = z
  .object({
    ...coParentNameFields,
    email: z
      .string()
      .trim()
      .email("Valid email address is required")
      .toLowerCase(),
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
  })
  .superRefine(validateNameParts);

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
    const { family, user: viewer } = await requireParent(req);

    const view = req.nextUrl.searchParams.get("view");
    const now = new Date();
    if (view === "invites") {
      if (viewer.role !== "PRIMARY_PARENT")
        return apiSuccess({ items: [], nextCursor: null });
      const rows = await prisma.coParentInvite.findMany({
        where: {
          familyId: family.id,
          status: { in: ["PENDING", "EXPIRED"] },
          ...olderThan("createdAt", pageCursor(req.nextUrl.searchParams)),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
      });
      const page = takePage(rows, "createdAt");
      return apiSuccess({
        ...page,
        items: page.items.map((invite) => pendingInviteView(invite, now)),
      });
    }
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
      view === "parents" || viewer.role !== "PRIMARY_PARENT"
        ? Promise.resolve([])
        : prisma.coParentInvite.findMany({
            where: {
              familyId: family.id,
              status: { in: ["PENDING", "EXPIRED"] },
            },
            orderBy: { createdAt: "desc" },
          }),
    ]);

    return apiSuccess({
      parents,
      invites: invites.map((invite) => pendingInviteView(invite, now)),
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
    const name =
      input.firstName && input.lastName
        ? `${input.firstName} ${input.lastName}`
        : input.name;
    if (!name)
      throw new ApiError(400, "Enter the co-parent’s first and last name.");

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
          "ALREADY_IN_FAMILY",
        );
      }
      throw new ApiError(
        409,
        "This email is already registered to another account",
        "EMAIL_ALREADY_REGISTERED",
      );
    }

    const resolvedPermissions =
      input.permissionLevel === "EQUAL"
        ? FULL_COPARENT_PERMISSIONS
        : {
            ...DEFAULT_LIMITED_COPARENT_PERMISSIONS,
            ...(input.permissions ?? {}),
          };

    const inviteToken = generateSecureToken(24);
    const invite = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id" = ${family.id} FOR UPDATE`;
      await tx.coParentInvite.updateMany({
        where: {
          familyId: family.id,
          email: input.email,
          status: { in: ["PENDING", "EXPIRED"] },
        },
        data: { status: "REVOKED" },
      });
      const createdAt = new Date();
      return tx.coParentInvite.create({
        data: {
          familyId: family.id,
          invitedByUserId: user.id,
          email: input.email,
          name,
          firstName: input.firstName,
          lastName: input.lastName,
          permissionLevel: input.permissionLevel,
          permissions: resolvedPermissions as Prisma.InputJsonValue,
          inviteToken,
          status: "PENDING",
          createdAt,
          expiresAt: inviteExpiresAt(createdAt),
        },
      });
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

    return apiSuccess(
      await deliverCoParentInvite(invite),
      201,
      "Co-parent invitation created",
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
        "COPARENT_NOT_FOUND",
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

      const revoked = await prisma.coParentInvite.updateMany({
        where: { id: invite.id, status: { in: ["PENDING", "EXPIRED"] } },
        data: { status: "REVOKED" },
      });
      if (!revoked.count)
        throw new ApiError(
          409,
          "This invitation has already been accepted or removed.",
        );

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
        "Co-parent invitation revoked",
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
        "Co-parent removed from family",
      );
    }

    throw new ApiError(
      400,
      "Provide either inviteId or coParentUserId query parameter",
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
