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
import { requireParent } from "@/lib/auth-guard";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";
import { verifyParentPin } from "@/lib/parent-pin";
import { childPinSchema } from "@/lib/child-credentials";

const resetPinSchema = z.object({
  newPin: childPinSchema,
  parentPin: childPinSchema,
});

/**
 * POST /api/children/[id]/reset-pin
 * Allows a parent to reset a child's login PIN and immediately clears any PIN lockout (FR-10.5, NFR-3).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { user, family } = await requireParent(req, "canManageChildren");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, resetPinSchema);

    await verifyParentPin(user.id, input.parentPin);
    const child = await prisma.child.findUnique({
      where: { id },
      select: { id: true, name: true, familyId: true, pinHash: true },
    });

    if (!child || child.familyId !== family.id) {
      throw new ApiError(
        404,
        "Child not found in your family",
        "CHILD_NOT_FOUND",
      );
    }

    const payer = await prisma.user.findFirst({
      where: { familyId: family.id, role: "PRIMARY_PARENT" },
      select: { paypalVaultId: true },
    });
    if (!payer?.paypalVaultId) {
      throw new ApiError(
        403,
        "Connect and verify PayPal before setting or resetting a child's PIN",
        "PAYPAL_VERIFICATION_REQUIRED",
      );
    }

    const pinHash = await bcrypt.hash(input.newPin, 10);

    await prisma.child.update({
      where: { id: child.id },
      data: {
        pinHash,
        failedPinAttempts: 0,
        pinLockedUntil: null,
      },
    });

    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: child.pinHash ? "CHILD_PIN_RESET" : "CHILD_PIN_SET",
      targetType: "Child",
      targetId: child.id,
      details: { childName: child.name },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      { childId: child.id, pinSet: true, canLogin: true, unlocked: true },
      200,
      child.pinHash
        ? `PIN for ${child.name} has been reset and unlocked`
        : `PIN created for ${child.name}; they can now log in`,
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
