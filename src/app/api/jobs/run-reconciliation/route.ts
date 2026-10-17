import { NextRequest } from "next/server";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { getSessionFromRequest } from "@/lib/jwt";
import { runPayPalReconciliation } from "@/jobs/reconciliation.job";

/**
 * POST /api/jobs/run-reconciliation
 * Triggers the daily PayPal ledger reconciliation check (INT-4).
 */
export async function POST(req: NextRequest) {
  try {
    const cronHeader = req.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET;

    let authorized = Boolean(
      expectedSecret && cronHeader && cronHeader === expectedSecret
    );

    if (!authorized) {
      const session = await getSessionFromRequest(req);
      if (session && session.subjectType === "USER") {
        authorized = true;
      }
    }

    if (!authorized) {
      throw new ApiError(
        401,
        "Valid x-cron-secret header or Parent/Admin session required",
        "UNAUTHORIZED_CRON"
      );
    }

    const summary = await runPayPalReconciliation();

    return apiSuccess(
      summary,
      200,
      "PayPal ledger reconciliation completed"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
