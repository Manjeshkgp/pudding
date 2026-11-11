import { NextRequest } from "next/server";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { requireParent } from "@/lib/auth-guard";
import { processDueAllowances } from "@/jobs/allowance.job";

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const scheduled = secret && req.headers.get("x-cron-secret") === secret;
    const familyId = scheduled
      ? undefined
      : (await requireParent(req, "canManageAllowances")).family.id;
    const ruleId = req.nextUrl.searchParams.get("ruleId") || undefined;
    return apiSuccess(await processDueAllowances({ familyId, ruleId }));
  } catch (error) {
    return handleRouteError(error);
  }
}
