import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
} from "@/lib/api-response";
import { runWeeklyDigestJob } from "@/jobs/weekly-digest.job";

/**
 * POST /api/jobs/run-weekly-digest
 * Triggers the Weekly Parent Digest (`FR-10.4`).
 * Can be called via `x-cron-secret` header OR by an authenticated Parent/Admin.
 */
export async function POST(req: NextRequest) {
  try {
    const cronSecretHeader = req.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET;
    const isCronAuthorized =
      Boolean(expectedSecret) && cronSecretHeader === expectedSecret;

    const session = await getSessionFromRequest(req);
    if (!isCronAuthorized && (!session || session.subjectType !== "USER")) {
      throw new ApiError(
        401,
        "Unauthorized to trigger weekly digest job.",
        "UNAUTHORIZED"
      );
    }

    const body = await req.json().catch(() => ({}));
    const familyId =
      body.familyId ||
      (!isCronAuthorized && session?.familyId ? session.familyId : undefined);

    const result = await runWeeklyDigestJob({
      familyId,
    });

    return apiSuccess({
      job: "WEEKLY_PARENT_DIGEST",
      ...result,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
