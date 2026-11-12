import { NextRequest } from "next/server";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { purchaseAccess } from "@/lib/purchase-access";
import {
  decidePurchase,
  payPurchase,
  serializePurchase,
} from "@/services/purchase.service";
export const maxDuration = 120;
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { session, purchase } = await purchaseAccess(
      req,
      (await context.params).id,
    );
    if (session.subjectType !== "CHILD")
      throw new ApiError(
        403,
        "Only the child can request payment.",
        "CHILD_REQUIRED",
      );
    const decision = await decidePurchase(purchase.id);
    return apiSuccess({
      purchase: serializePurchase(
        decision.status === "APPROVED" && decision.aiDecision === "APPROVE"
          ? await payPurchase(decision.id)
          : decision,
      ),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
