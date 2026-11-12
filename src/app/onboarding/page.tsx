import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { cookieNavigationState } from "@/lib/cookie-navigation";
export default async function Page() {
  const req = new NextRequest("http://pudding.internal/onboarding", {
    headers: { cookie: (await headers()).get("cookie") || "" },
  });
  const { state, refreshRequired } = await cookieNavigationState(req);
  if (refreshRequired)
    redirect("/api/auth/navigation/refresh?returnTo=%2Fonboarding");
  redirect(
    state.kind === "GUEST" ? "/api/auth/parent/signup/resume" : state.nextRoute,
  );
}
