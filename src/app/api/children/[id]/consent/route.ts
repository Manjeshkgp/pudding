import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const consentActionSchema = z.object({
  action: z.enum(["GRANT", "WITHDRAW"]),
  consentVersion: z.string().trim().default("1.0"),
  consentText: z
    .string()
    .trim()
    .default(
      "Parental consent record updated for child supervised account under COPPA/GDPR-K compliance."
    ),
});

/**
 * GET /api/children/[id]/consent
 * Retrieves all parental consent records for a child (FR-1.6, NFR-8).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { family } = await requireParent(req);

    const child = await prisma.child.findUnique({
      where: { id },
      select: { id: true, name: true, familyId: true, isFrozen: true },
    });

    if (!child || child.familyId !== family.id) {
      throw new ApiError(404, "Child not found in your family", "CHILD_NOT_FOUND");
    }

    const consentRecords = await prisma.consentRecord.findMany({
      where: { childId: child.id },
      include: {
        parent: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { grantedAt: "desc" },
    });

    return apiSuccess({
      childId: child.id,
      childName: child.name,
      isFrozen: child.isFrozen,
      consentRecords,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/children/[id]/consent
 * Grants or withdraws verifiable parental consent for a child profile (FR-1.6, NFR-8).
 * Withdrawing consent automatically freezes the child's profile and wallet until re-granted or deleted.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, family } = await requireParent(req, "canManageChildren");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, consentActionSchema);

    const child = await prisma.child.findUnique({
      where: { id },
      include: { wallet: true },
    });

    if (!child || child.familyId !== family.id) {
      throw new ApiError(404, "Child not found in your family", "CHILD_NOT_FOUND");
    }

    const result = await prisma.$transaction(async (tx) => {
      if (input.action === "WITHDRAW") {
        await tx.consentRecord.updateMany({
          where: { childId: child.id, status: "GRANTED" },
          data: {
            status: "WITHDRAWN",
            withdrawnAt: new Date(),
          },
        });

        await tx.child.update({
          where: { id: child.id },
          data: { isFrozen: true },
        });

        if (child.wallet) {
          await tx.wallet.update({
            where: { id: child.wallet.id },
            data: { isFrozen: true },
          });
        }

        const withdrawalRecord = await tx.consentRecord.create({
          data: {
            parentId: user.id,
            childId: child.id,
            consentVersion: input.consentVersion,
            consentText: input.consentText,
            ipAddress,
            userAgent,
            status: "WITHDRAWN",
            withdrawnAt: new Date(),
          },
        });

        await writeAuditLog(
          {
            familyId: family.id,
            actorUserId: user.id,
            actorRole: user.role,
            action: "PARENTAL_CONSENT_WITHDRAWN",
            targetType: "Child",
            targetId: child.id,
            details: {
              consentId: withdrawalRecord.id,
              consentVersion: input.consentVersion,
            },
            ipAddress,
            userAgent,
          },
          tx
        );

        return withdrawalRecord;
      }

      // GRANT consent
      const grantRecord = await tx.consentRecord.create({
        data: {
          parentId: user.id,
          childId: child.id,
          consentVersion: input.consentVersion,
          consentText: input.consentText,
          ipAddress,
          userAgent,
          status: "GRANTED",
        },
      });

      await tx.child.update({
        where: { id: child.id },
        data: { isFrozen: false },
      });

      if (child.wallet) {
        await tx.wallet.update({
          where: { id: child.wallet.id },
          data: { isFrozen: false },
        });
      }

      await writeAuditLog(
        {
          familyId: family.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "PARENTAL_CONSENT_GRANTED",
          targetType: "Child",
          targetId: child.id,
          details: {
            consentId: grantRecord.id,
            consentVersion: input.consentVersion,
          },
          ipAddress,
          userAgent,
        },
        tx
      );

      return grantRecord;
    });

    return apiSuccess(
      result,
      200,
      input.action === "WITHDRAW"
        ? "Parental consent withdrawn and child account frozen"
        : "Parental consent recorded and child account active"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
