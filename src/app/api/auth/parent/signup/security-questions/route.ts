import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { ApiError, apiSuccess, handleRouteError, validateBody } from "@/lib/api-response";
import { getParentSignupDraft, refreshDraftExpiry } from "@/lib/parent-signup";

const questionSchema = z.object({
  questionKey: z.string().trim().min(2).max(64),
  questionText: z.string().trim().min(5).max(200),
  answer: z.string().trim().min(2).max(120),
});

/** Saves one hashed security answer per call, so each UI step can persist independently. */
export async function POST(req: NextRequest) {
  try {
    const draft = await getParentSignupDraft(req);
    const input = await validateBody(req, questionSchema);
    if (!draft.emailVerifiedAt || !draft.passwordHash) {
      throw new ApiError(403, "Verify your email and set a password first", "SIGNUP_STEPS_INCOMPLETE");
    }

    const stored = Array.isArray(draft.securityQuestions)
      ? (draft.securityQuestions as Array<{
          questionKey: string;
          questionText: string;
          answerHash: string;
        }>)
      : [];
    const answerHash = await bcrypt.hash(input.answer.trim().toLowerCase(), 10);
    const next = [...stored];
    const existingIndex = next.findIndex((item) => item.questionKey === input.questionKey);
    const record = {
      questionKey: input.questionKey,
      questionText: input.questionText,
      answerHash,
    };
    if (existingIndex >= 0) next[existingIndex] = record;
    else next.push(record);

    if (next.length > 2) {
      throw new ApiError(400, "Signup supports two security questions", "TOO_MANY_SECURITY_QUESTIONS");
    }

    await prisma.parentSignupDraft.update({
      where: { id: draft.id },
      data: {
        securityQuestions: next as Prisma.InputJsonValue,
        expiresAt: refreshDraftExpiry(),
      },
    });
    return apiSuccess({
      saved: true,
      questionCount: next.length,
      questionsRemaining: Math.max(0, 2 - next.length),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
