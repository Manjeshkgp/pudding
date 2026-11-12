import { refreshSessionNavigation } from "@/lib/refresh-navigation";
import { NextRequest, NextResponse } from "next/server";
import {
  getParentSignupDraft,
  signParentSignupToken,
  setParentSignupCookie,
} from "@/lib/parent-signup";
import { navigationState } from "@/lib/onboarding";
export async function GET(req: NextRequest) {
  const state = await navigationState(req);
  const response = NextResponse.redirect(new URL(state.nextRoute, req.url));
  response.headers.set("Cache-Control", "private, no-store");
  if (state.kind === "DRAFT") {
    const draft = await getParentSignupDraft(req);
    setParentSignupCookie(
      response,
      await signParentSignupToken(draft.id, draft),
    );
  }
  if (["PARENT", "CHILD", "BLOCKED"].includes(state.kind))
    await refreshSessionNavigation(req, response, state);
  return response;
}
