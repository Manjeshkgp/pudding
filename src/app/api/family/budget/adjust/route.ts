import { NextRequest } from "next/server";
import { z } from "zod";
import {
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { reduceVirtualFamilyBudget } from "@/services/ledger.service";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const adjustBudgetSchema = z.object({
  amount: z.number().positive("Reduction amount must be greater than 0"),
  reason: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().trim().min(4).max(128).optional(),
});

/**
 * POST /api/family/budget/adjust
 * Reduces or adjusts the Parent's unused Virtual Family Budget (replaces FR-2.4 withdrawal).
 */
export async function POST(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req, "canManageBudget");
    const { ipAddress, userAgent } = getRequestMeta(req);
    const input = await validateBody(req, adjustBudgetSchema);

    const headerIdempotencyKey = req.headers.get("x-idempotency-key");
    const idempotencyKey =
      input.idempotencyKey ||
      headerIdempotencyKey ||
      `budget-adjust:${family.id}:${user.id}:${Date.now()}`;

    const result = await reduceVirtualFamilyBudget({
      familyId: family.id,
      amount: input.amount,
      idempotencyKey,
      actorUserId: user.id,
      reason: input.reason,
    });

    if (!result.idempotentReplay) {
      await writeAuditLog({
        familyId: family.id,
        actorUserId: user.id,
        actorRole: user.role,
        action: "FAMILY_BUDGET_REDUCED",
        targetType: "Family",
        targetId: family.id,
        details: {
          amountReduced: input.amount,
          newUnallocatedBudget: result.family.unallocatedBudget.toString(),
          reason: input.reason,
        },
        ipAddress,
        userAgent,
      });
    }

    return apiSuccess(
      {
        unallocatedBudget: result.family.unallocatedBudget.toString(),
        ledgerEntry: {
          ...result.ledgerEntry,
          amount: result.ledgerEntry.amount.toString(),
        },
        idempotentReplay: result.idempotentReplay,
      },
      200,
      "Unused virtual family budget reduced"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
