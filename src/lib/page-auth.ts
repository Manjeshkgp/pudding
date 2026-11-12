import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { navigationRedirect } from "@/lib/navigation-policy";
import { cookieNavigationState } from "@/lib/cookie-navigation";
export async function requirePage(path: string) {
  const h = await headers();
  const req = new NextRequest("http://pudding.internal" + path, {
    headers: { cookie: h.get("cookie") || "" },
  });
  const { state, refreshRequired } = await cookieNavigationState(req);
  if (refreshRequired)
    redirect(
      `/api/auth/navigation/refresh?returnTo=${encodeURIComponent(path)}`,
    );
  const target = navigationRedirect(state, path);
  if (target) redirect(target);
  return state;
}

export async function redirectLegacyPage(
  path: string,
  search: Record<string, string | string[] | undefined> = {},
) {
  const h = await headers();
  const req = new NextRequest("http://pudding.internal" + path, {
    headers: { cookie: h.get("cookie") || "" },
  });
  const { state, refreshRequired } = await cookieNavigationState(req);
  if (refreshRequired)
    redirect(
      `/api/auth/navigation/refresh?returnTo=${encodeURIComponent(path)}`,
    );
  const target = navigationRedirect(state, path) || state.nextRoute;
  const params = new URLSearchParams();
  if (["/account/paypal", "/onboarding/paypal"].includes(target))
    for (const key of ["paypal_oauth", "paypal_vault", "code"])
      if (typeof search[key] === "string")
        params.set(key, search[key] as string);
  redirect(target + (params.size ? "?" + params.toString() : ""));
}
