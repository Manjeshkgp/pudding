import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { requirePrimaryParent } from "@/lib/auth-guard";
import { generateSecureToken } from "@/lib/codes";
import { inviteExpiresAt, isInviteExpired } from "@/lib/coparent-invite";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";
import { deliverCoParentInvite } from "@/services/coparent-invite.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, family } = await requirePrimaryParent(req);
    const { id } = await params;
    const meta = getRequestMeta(req);
    const invite = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Family" WHERE "id" = ${family.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "CoParentInvite" WHERE "id" = ${id} AND "familyId" = ${family.id} FOR UPDATE`;
      const old = await tx.coParentInvite.findFirst({
        where: { id, familyId: family.id },
      });
      if (!old)
        throw new ApiError(404, "Invitation not found.", "INVITE_NOT_FOUND");
      if (!["PENDING", "EXPIRED"].includes(old.status) || !isInviteExpired(old))
        throw new ApiError(
          409,
          "Only expired invitations can be resent.",
          "INVITE_NOT_EXPIRED",
        );
      if (
        await tx.user.findUnique({
          where: { email: old.email },
          select: { id: true },
        })
      )
        throw new ApiError(
          409,
          "This email already has a Pudding account.",
          "EMAIL_ALREADY_REGISTERED",
        );
      await tx.coParentInvite.updateMany({
        where: {
          familyId: family.id,
          email: old.email,
          status: { in: ["PENDING", "EXPIRED"] },
        },
        data: { status: "REVOKED" },
      });
      const createdAt = new Date();
      const replacement = await tx.coParentInvite.create({
        data: {
          familyId: family.id,
          invitedByUserId: user.id,
          email: old.email,
          name: old.name,
          firstName: old.firstName,
          lastName: old.lastName,
          permissionLevel: old.permissionLevel,
          permissions: old.permissions ?? undefined,
          inviteToken: generateSecureToken(24),
          createdAt,
          expiresAt: inviteExpiresAt(createdAt),
        },
      });
      await writeAuditLog(
        {
          ...meta,
          familyId: family.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "COPARENT_INVITE_RESENT",
          targetType: "CoParentInvite",
          targetId: replacement.id,
          details: { replacedInviteId: old.id },
        },
        tx,
      );
      return replacement;
    });
    return apiSuccess(
      await deliverCoParentInvite(invite),
      201,
      "New invitation created.",
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
