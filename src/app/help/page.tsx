import HelpScreen from "@/components/help-screen";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";

export default async function Page() {
  const request = new NextRequest("http://pudding.internal/help", {
    headers: { cookie: (await headers()).get("cookie") || "" },
  });
  const session = await getSessionFromRequest(request);
  return <HelpScreen signedIn={Boolean(session)} />;
}
