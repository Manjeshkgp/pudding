import { clearParentSignupCookie } from "@/lib/parent-signup";
import { NextRequest } from "next/server";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
import { clearSessionCookie, getSessionFromRequest } from "@/lib/jwt";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    const { ipAddress, userAgent } = getRequestMeta(req);

    if (session) {
      await writeAuditLog({
        familyId: session.familyId,
        actorUserId: session.subjectType === "USER" ? session.sub : null,
        actorChildId: session.subjectType === "CHILD" ? session.sub : null,
        actorRole: session.role,
        action: "LOGOUT",
        targetType: session.subjectType === "USER" ? "User" : "Child",
        targetId: session.sub,
        ipAddress,
        userAgent,
      });
    }

    const response = apiSuccess(
      { loggedOut: true },
      200,
      "Logged out successfully",
    );
    clearSessionCookie(response);
    clearParentSignupCookie(response);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
