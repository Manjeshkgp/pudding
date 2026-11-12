import { NextRequest, NextResponse } from "next/server";
import { navigationState } from "@/lib/onboarding";
import { navigationRedirect } from "@/lib/navigation-policy";
import { refreshSessionNavigation } from "@/lib/refresh-navigation";
import { clearSessionCookie } from "@/lib/jwt";
import {
  clearParentSignupCookie,
  getParentSignupDraft,
  refreshSignupProgressCookie,
} from "@/lib/parent-signup";
import { handleRouteError, ApiError } from "@/lib/api-response";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("returnTo") || "/onboarding";
    if (
      !/^\/(?!\/)/.test(path) ||
      /[\\?#\r\n]/.test(path) ||
      path.startsWith("/api/") ||
      path.length > 512
    )
      throw new ApiError(400, "Invalid return path.");
    const state = await navigationState(req);
    const destination =
      path === "/onboarding"
        ? state.nextRoute
        : navigationRedirect(state, path) || path;
    // A relative Location keeps the browser on the public origin behind proxies.
    const response = new NextResponse(null, { status: 307, headers: { Location: destination } });
    response.headers.set("Cache-Control", "private, no-store");
    if (["PARENT", "CHILD", "BLOCKED"].includes(state.kind))
      await refreshSessionNavigation(req, response, state);
    else {
      clearSessionCookie(response);
      if (state.kind === "DRAFT")
        await refreshSignupProgressCookie(
          response,
          await getParentSignupDraft(req),
        );
      else clearParentSignupCookie(response);
    }
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
