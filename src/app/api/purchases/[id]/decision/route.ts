import { NextRequest } from "next/server";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { purchaseAccess } from "@/lib/purchase-access";
import { decideInvoice, serializePurchase } from "@/services/purchase.service";
export const maxDuration = 60;
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { purchase } = await purchaseAccess(req, (await context.params).id);
    return apiSuccess({
      purchase: serializePurchase(await decideInvoice(purchase.id)),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
