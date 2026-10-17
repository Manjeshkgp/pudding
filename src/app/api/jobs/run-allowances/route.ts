import { NextRequest } from "next/server";
import { ApiError, apiSuccess, handleRouteError } from "@/lib/api-response";
import { getSessionFromRequest } from "@/lib/jwt";
import { processDueAllowances } from "@/jobs/allowance.job";

/**
 * POST /api/jobs/run-allowances
 * Triggers the scheduled allowance processor (FR-4.2, FR-4.3, NFR-14).
 * Can be called via CRON_SECRET header, an ADMIN user, or a Parent testing their family's due allowance rule.
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
      if (
        session &&
        session.subjectType === "USER" &&
        (session.role === "ADMIN" ||
          session.role === "PRIMARY_PARENT" ||
          session.role === "CO_PARENT")
      ) {
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

    const ruleId = req.nextUrl.searchParams.get("ruleId") || undefined;
    const summary = await processDueAllowances(ruleId);

    return apiSuccess(summary, 200, "Allowance job executed successfully");
  } catch (error) {
    return handleRouteError(error);
  }
}
