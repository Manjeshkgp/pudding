import { NextRequest } from "next/server";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { getSessionFromRequest } from "@/lib/jwt";
import { processSavingsInterest } from "@/jobs/interest.job";

/**
 * POST /api/jobs/run-interest
 * Triggers the parent-funded compounding interest processor on active savings goals (FR-6.4).
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

    const goalId = req.nextUrl.searchParams.get("goalId") || undefined;
    const summary = await processSavingsInterest(goalId);

    return apiSuccess(
      summary,
      200,
      "Savings compounding interest job executed"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
