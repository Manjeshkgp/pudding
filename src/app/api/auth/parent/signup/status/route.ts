import { refreshSessionNavigation } from "@/lib/refresh-navigation";
import { NextRequest } from "next/server";
import {
  getParentSignupDraft,
  setParentSignupCookie,
  signParentSignupToken,
} from "@/lib/parent-signup";
import { navigationState } from "@/lib/onboarding";
import { apiSuccess, handleRouteError } from "@/lib/api-response";
export async function GET(req: NextRequest) {
  try {
    const state = await navigationState(req);
    const draft =
      state.kind === "DRAFT" ? await getParentSignupDraft(req) : null;
    const questions = Array.isArray(draft?.securityQuestions)
      ? (draft.securityQuestions as {
          questionKey: string;
          questionText: string;
        }[])
      : [];
    const response = apiSuccess({
      signedIn: ["PARENT", "CHILD", "BLOCKED"].includes(state.kind),
      email: draft?.email || "",
      emailVerified: Boolean(draft?.emailVerifiedAt),
      passwordSaved: Boolean(draft?.passwordHash),
      questions: questions.map((q) => ({
        questionKey: q.questionKey,
        questionText: q.questionText,
      })),
      nextRoute: state.nextRoute,
    });
    response.headers.set("Cache-Control", "private, no-store");
    if (draft)
      setParentSignupCookie(
        response,
        await signParentSignupToken(draft.id, draft),
      );
    if (["PARENT", "CHILD", "BLOCKED"].includes(state.kind))
      await refreshSessionNavigation(req, response, state);
    return response;
  } catch (e) {
    return handleRouteError(e);
  }
}
