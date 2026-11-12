import { refreshSignupProgressCookie } from "@/lib/parent-signup";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
  validateBody,
} from "@/lib/api-response";
import { getParentSignupDraft, refreshDraftExpiry } from "@/lib/parent-signup";

const questionSchema = z.object({
  questionKey: z.string().trim().min(2).max(64),
  questionText: z.string().trim().min(5).max(200),
  answer: z.string().trim().min(2).max(120).optional(),
  slot: z.number().int().min(0).max(1).optional(),
});

/** Saves one hashed security answer per call, so each UI step can persist independently. */
export async function POST(req: NextRequest) {
  try {
    const draft = await getParentSignupDraft(req);
    const input = await validateBody(req, questionSchema);
    if (!draft.emailVerifiedAt || !draft.passwordHash) {
      throw new ApiError(
        403,
        "Verify your email and set a password first",
        "SIGNUP_STEPS_INCOMPLETE",
      );
    }

    if (
      !draft.notificationsCompletedAt &&
      !(
        Array.isArray(draft.securityQuestions) && draft.securityQuestions.length
      )
    )
      throw new ApiError(
        403,
        "Complete or skip the notifications step first.",
        "SIGNUP_STEPS_INCOMPLETE",
      );

    const stored = Array.isArray(draft.securityQuestions)
      ? (draft.securityQuestions as Array<{
          questionKey: string;
          questionText: string;
          answerHash: string;
        }>)
      : [];
    if (input.slot !== undefined && input.slot > stored.length)
      throw new ApiError(400, "Complete the first security question first.");
    const next = [...stored];
    const existingIndex =
      input.slot ??
      next.findIndex((item) => item.questionKey === input.questionKey);
    const previous = existingIndex >= 0 ? next[existingIndex] : undefined;
    if (
      !input.answer &&
      (!previous || previous.questionKey !== input.questionKey)
    )
      throw new ApiError(400, "Enter an answer for this question.");
    if (
      next.some(
        (item, index) =>
          index !== existingIndex && item.questionKey === input.questionKey,
      )
    )
      throw new ApiError(400, "Choose a different second question.");
    const record = {
      questionKey: input.questionKey,
      questionText: input.questionText,
      answerHash: input.answer
        ? await bcrypt.hash(input.answer.trim().toLowerCase(), 10)
        : previous!.answerHash,
    };
    if (existingIndex >= 0) next[existingIndex] = record;
    else next.push(record);
    if (next.some((item) => !item))
      throw new ApiError(400, "Complete the first security question first.");

    if (next.length > 2) {
      throw new ApiError(
        400,
        "Signup supports two security questions",
        "TOO_MANY_SECURITY_QUESTIONS",
      );
    }

    const updatedDraft = await prisma.parentSignupDraft.update({
      where: { id: draft.id },
      data: {
        securityQuestions: next as Prisma.InputJsonValue,
        expiresAt: refreshDraftExpiry(),
      },
    });
    const response = apiSuccess({
      saved: true,
      questionCount: next.length,
      questionsRemaining: Math.max(0, 2 - next.length),
    });
    await refreshSignupProgressCookie(response, updatedDraft);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
