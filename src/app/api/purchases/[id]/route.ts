import { NextRequest } from "next/server";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { purchaseAccess } from "@/lib/purchase-access";
import { serializePurchase } from "@/services/purchase.service";
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { purchase } = await purchaseAccess(req, (await context.params).id);
    return apiSuccess({
      purchase: { ...serializePurchase(purchase), child: purchase.child },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
