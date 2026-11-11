import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, handleRouteError, validateBody } from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { getRequestMeta } from "@/lib/audit";
import { reviewChore } from "@/services/chore-review.service";
const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  parentComment: z.string().trim().max(300).optional(),
  bonusAmount: z.number().min(0).max(100).optional(),
  idempotencyKey: z.string().max(128).optional(),
});
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user, family } = await requireParent(req, "canApproveChores");
    const { id } = await context.params;
    const input = await validateBody(req, schema);
    const meta = getRequestMeta(req);
    return apiSuccess(
      await reviewChore({
        familyId: family.id,
        actorUserId: user.id,
        actorRole: user.role,
        id,
        input,
        meta,
      }),
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
