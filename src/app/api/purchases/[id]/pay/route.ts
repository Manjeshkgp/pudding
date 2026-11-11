import { NextRequest } from "next/server";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { purchaseAccess } from "@/lib/purchase-access";
import { requireParent } from "@/lib/auth-guard";
import { payPurchase, serializePurchase } from "@/services/purchase.service";
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { session, purchase } = await purchaseAccess(
      req,
      (await context.params).id,
    );
    if (session.subjectType === "USER")
      await requireParent(req, "canApproveSpending");
    return apiSuccess({
      purchase: serializePurchase(
        await payPurchase(
          purchase.id,
          session.subjectType === "USER" ? session.sub : undefined,
        ),
      ),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
