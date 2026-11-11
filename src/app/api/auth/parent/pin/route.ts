import { refreshSessionNavigation } from "@/lib/refresh-navigation";
import { completeOnboardingIfReady, navigationState } from "@/lib/onboarding";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireParent } from "@/lib/auth-guard";
import { hasParentPermission } from "@/lib/co-parent-permissions";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { verifyParentPin } from "@/lib/parent-pin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
const schema = z.object({
  newPin: z.string().regex(/^\d{6}$/),
  currentPin: z.string().optional(),
  password: z.string().optional(),
});
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireParent(req);
    return apiSuccess({
      pinSet: Boolean(user.pinHash),
      canTopUp: hasParentPermission(user, "canManageBudget"),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req);
    const input = await validateBody(req, schema);
    enforceRateLimit({
      key: `parent-pin-change:${user.id}`,
      limit: 8,
      windowMs: 900000,
    });
    if (user.pinHash) {
      if (input.password) {
        if (!(await bcrypt.compare(input.password, user.passwordHash)))
          throw new ApiError(403, "Incorrect password.", "INVALID_PASSWORD");
      } else await verifyParentPin(user.id, input.currentPin || "");
    }
    const hash = await bcrypt.hash(input.newPin, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: hash, failedPinAttempts: 0, pinLockedUntil: null },
    });
    await writeAuditLog({
      familyId: family.id,
      actorUserId: user.id,
      actorRole: user.role,
      action: "PARENT_PIN_UPDATED",
      targetType: "User",
      targetId: user.id,
    });
    await completeOnboardingIfReady(user.id);
    const state = await navigationState(req);
    const response = apiSuccess({
      pinSet: true,
      nextRoute: state.nextRoute,
    });
    await refreshSessionNavigation(req, response, state);
    return response;
  } catch (e) {
    return handleRouteError(e);
  }
}
