import { NextRequest } from "next/server";
import { requireParent } from "@/lib/auth-guard";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { reconcilePendingPurchases } from "@/jobs/purchase-reconciliation.job";
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const cron = Boolean(secret && req.headers.get("x-cron-secret") === secret);
    const scope = cron
      ? undefined
      : (await requireParent(req, "canApproveSpending")).family.id;
    return apiSuccess(await reconcilePendingPurchases(scope));
  } catch (e) {
    return handleRouteError(e);
  }
}
