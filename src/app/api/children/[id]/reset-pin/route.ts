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
import { childPinSchema } from "@/lib/child-credentials";

const resetPinSchema = z.object({
  newPin: childPinSchema,
});

/**
 * POST /api/children/[id]/reset-pin
 * Allows a parent to reset a child's login PIN and immediately clears any PIN lockout (FR-10.5, NFR-3).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, family } = await requireParent(req);
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, resetPinSchema);

    const child = await prisma.child.findUnique({
      where: { id },
      select: { id: true, name: true, familyId: true },
    });

    if (!child || child.familyId !== family.id) {
      throw new ApiError(404, "Child not found in your family", "CHILD_NOT_FOUND");
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
      action: "CHILD_PIN_RESET",
      targetType: "Child",
      targetId: child.id,
      details: { childName: child.name },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      { childId: child.id, unlocked: true },
      200,
      `PIN for ${child.name} has been reset and unlocked`
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
