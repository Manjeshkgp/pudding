import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/jwt";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
} from "@/lib/api-response";
import { getRequestMeta, writeAuditLog } from "@/lib/audit";

const STANDARD_SECURITY_QUESTIONS = [
  {
    key: "FIRST_PET_NAME",
    text: "What was the name of your first pet?",
  },
  {
    key: "ELEMENTARY_SCHOOL",
    text: "What was the name of the first school you attended?",
  },
  {
    key: "BIRTH_CITY",
    text: "In what city or town were you born?",
  },
  {
    key: "CHILDHOOD_BEST_FRIEND",
    text: "What was the first name of your childhood best friend?",
  },
  {
    key: "FAVORITE_TEACHER",
    text: "What was the last name of your favorite teacher?",
  },
  {
    key: "FIRST_CAR_MODEL",
    text: "What was the make or model of your first car?",
  },
] as const;

const saveQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        questionKey: z.string().min(2).max(64),
        questionText: z.string().min(5).max(200).optional(),
        answer: z
          .string()
          .min(2, "Security answer must be at least 2 characters")
          .max(120),
      })
    )
    .min(1, "Please provide at least 1 security question")
    .max(3, "Maximum 3 security questions allowed"),
});

const verifyQuestionSchema = z.object({
  email: z.string().email().optional(),
  questionKey: z.string().min(2),
  answer: z.string().min(1),
});

/**
 * GET /api/auth/security-questions
 * - Returns the catalog of standard security questions.
 * - If authenticated as a Parent (`USER`) or given `?email=...`, also returns
 *   which questions the parent has configured (without exposing answer hashes).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    const emailParam = req.nextUrl.searchParams
      .get("email")
      ?.trim()
      .toLowerCase();

    let configuredQuestions: Array<{
      id: string;
      questionKey: string;
      questionText: string;
      updatedAt: Date;
    }> = [];

    if (session && session.subjectType === "USER") {
      configuredQuestions = await prisma.userSecurityQuestion.findMany({
        where: { userId: session.sub },
        select: {
          id: true,
          questionKey: true,
          questionText: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "asc" },
      });
    } else if (emailParam) {
      const user = await prisma.user.findUnique({
        where: { email: emailParam },
        select: { id: true },
      });
      if (user) {
        configuredQuestions = await prisma.userSecurityQuestion.findMany({
          where: { userId: user.id },
          select: {
            id: true,
            questionKey: true,
            questionText: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "asc" },
        });
      }
    }

    return apiSuccess({
      availableQuestions: STANDARD_SECURITY_QUESTIONS,
      configuredQuestions,
      hasConfiguredSecurityQuestions: configuredQuestions.length > 0,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/auth/security-questions
 * Sets or replaces the authenticated Parent's security questions (with bcrypt-hashed answers).
 */
export async function POST(req: NextRequest) {
  try {
    const { ipAddress, userAgent } = getRequestMeta(req);
    const session = await getSessionFromRequest(req);
    if (!session || session.subjectType !== "USER") {
      throw new ApiError(
        401,
        "Parent authentication required to configure security questions.",
        "UNAUTHORIZED"
      );
    }

    const body = await req.json();
    const parsed = saveQuestionsSchema.parse(body);

    const uniqueKeys = new Set(parsed.questions.map((q) => q.questionKey));
    if (uniqueKeys.size !== parsed.questions.length) {
      throw new ApiError(
        400,
        "Each security question must be unique.",
        "DUPLICATE_QUESTIONS"
      );
    }

    const preparedRecords = await Promise.all(
      parsed.questions.map(async (item) => {
        const catalogMatch = STANDARD_SECURITY_QUESTIONS.find(
          (q) => q.key === item.questionKey
        );
        const questionText =
          item.questionText?.trim() ||
          catalogMatch?.text ||
          item.questionKey;
        const normalizedAnswer = item.answer.trim().toLowerCase();
        const answerHash = await bcrypt.hash(normalizedAnswer, 10);

        return {
          userId: session.sub,
          questionKey: item.questionKey,
          questionText,
          answerHash,
        };
      })
    );

    const saved = await prisma.$transaction(async (tx) => {
      await tx.userSecurityQuestion.deleteMany({
        where: { userId: session.sub },
      });

      await tx.userSecurityQuestion.createMany({
        data: preparedRecords,
      });

      return tx.userSecurityQuestion.findMany({
        where: { userId: session.sub },
        select: {
          id: true,
          questionKey: true,
          questionText: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    await writeAuditLog({
      familyId: session.familyId,
      actorUserId: session.sub,
      actorRole: String(session.role),
      action: "SECURITY_QUESTIONS_CONFIGURED",
      targetType: "User",
      targetId: session.sub,
      details: {
        count: saved.length,
        questionKeys: saved.map((q) => q.questionKey),
      },
      ipAddress,
      userAgent,
    });

    return apiSuccess(
      {
        message: "Security questions saved successfully.",
        configuredQuestions: saved,
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PUT /api/auth/security-questions
 * Verifies a Parent's answer to a configured security question.
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    const body = await req.json();
    const parsed = verifyQuestionSchema.parse(body);

    let userId: string | null =
      session?.subjectType === "USER" ? session.sub : null;

    if (!userId && parsed.email) {
      const user = await prisma.user.findUnique({
        where: { email: parsed.email.trim().toLowerCase() },
        select: { id: true },
      });
      userId = user?.id || null;
    }

    if (!userId) {
      throw new ApiError(
        400,
        "Parent session or email is required to verify a security question.",
        "VALIDATION_ERROR"
      );
    }

    const questionRecord = await prisma.userSecurityQuestion.findUnique({
      where: {
        userId_questionKey: {
          userId,
          questionKey: parsed.questionKey,
        },
      },
    });

    if (!questionRecord) {
      throw new ApiError(
        404,
        "Security question not found for this account.",
        "SECURITY_QUESTION_NOT_FOUND"
      );
    }

    const normalizedAnswer = parsed.answer.trim().toLowerCase();
    const isMatch = await bcrypt.compare(
      normalizedAnswer,
      questionRecord.answerHash
    );

    if (!isMatch) {
      throw new ApiError(
        401,
        "Incorrect security question answer.",
        "INVALID_SECURITY_ANSWER"
      );
    }

    return apiSuccess({
      verified: true,
      questionKey: questionRecord.questionKey,
      questionText: questionRecord.questionText,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
