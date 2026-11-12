import { NextRequest } from "next/server";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { hasParentPermission } from "@/lib/co-parent-permissions";
import { oldestParentApproval } from "@/services/purchase-approval-queue.service";

export async function GET(req: NextRequest) {
  try {
    const { user, family } = await requireParent(req);
    const next = user.onboardingCompletedAt && hasParentPermission(user, "canApproveSpending")
      ? await oldestParentApproval(family.id)
      : null;
    return apiSuccess({ next });
  } catch (error) {
    return handleRouteError(error);
  }
}
