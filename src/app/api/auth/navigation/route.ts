import { NextRequest } from "next/server";
import { apiSuccess, handleRouteError, ApiError } from "@/lib/api-response";
import { cookieNavigationState } from "@/lib/cookie-navigation";
import { navigationRedirect } from "@/lib/navigation-policy";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("path") || "/onboarding";
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      path.includes("\\") ||
      path.includes("?") ||
      path.length > 512
    )
      throw new ApiError(400, "Invalid page path.");
    const { state, refreshRequired } = await cookieNavigationState(req);
    const response = apiSuccess({
      ...state,
      redirectTo: refreshRequired
        ? `/api/auth/navigation/refresh?returnTo=${encodeURIComponent(path)}`
        : navigationRedirect(state, path),
    });
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
