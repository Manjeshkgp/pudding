import { NextRequest, NextResponse } from "next/server";
import {
  getSessionFromRequest,
  setSessionCookie,
  signSessionToken,
} from "@/lib/jwt";
import type { NavigationState } from "@/lib/navigation-policy";
/** Used after authoritative state changes, never on ordinary page navigation. */
export async function refreshSessionNavigation(
  req: NextRequest,
  response: NextResponse,
  state?: NavigationState,
) {
  const session = await getSessionFromRequest(req);
  if (!session) return;
  const token = await signSessionToken(session, session.exp, state);
  setSessionCookie(response, token, session.subjectType, session.exp);
}
