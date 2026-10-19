import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/jwt";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
} from "@/lib/api-response";

const preferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  notifyEveryTransaction: z.boolean().optional(),
  notifyThresholdAmount: z.number().min(0).nullable().optional(),
  weeklyDigestEnabled: z.boolean().optional(),
});

/**
 * GET /api/notifications/preferences
 * Retrieves the authenticated Parent's notification preferences (`FR-10.4`).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.subjectType !== "USER") {
      throw new ApiError(
        401,
        "Parent authentication required.",
        "UNAUTHORIZED"
      );
    }

    const preference = await prisma.notificationPreference.upsert({
      where: { userId: session.sub },
      update: {},
      create: {
        userId: session.sub,
        pushEnabled: true,
        emailEnabled: true,
        smsEnabled: false,
        notifyEveryTransaction: true,
        weeklyDigestEnabled: true,
      },
    });

    return apiSuccess({
      preferences: {
        ...preference,
        notifyThresholdAmount:
          preference.notifyThresholdAmount?.toString() ?? null,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PUT /api/notifications/preferences
 * Updates the authenticated Parent's notification preferences (`FR-10.4`).
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.subjectType !== "USER") {
      throw new ApiError(
        401,
        "Parent authentication required.",
        "UNAUTHORIZED"
      );
    }

    const body = await req.json();
    const parsed = preferencesSchema.parse(body);

    const updated = await prisma.notificationPreference.upsert({
      where: { userId: session.sub },
      update: {
        ...(parsed.pushEnabled !== undefined
          ? { pushEnabled: parsed.pushEnabled }
          : {}),
        ...(parsed.emailEnabled !== undefined
          ? { emailEnabled: parsed.emailEnabled }
          : {}),
        ...(parsed.smsEnabled !== undefined
          ? { smsEnabled: parsed.smsEnabled }
          : {}),
        ...(parsed.notifyEveryTransaction !== undefined
          ? { notifyEveryTransaction: parsed.notifyEveryTransaction }
          : {}),
        ...(parsed.notifyThresholdAmount !== undefined
          ? { notifyThresholdAmount: parsed.notifyThresholdAmount }
          : {}),
        ...(parsed.weeklyDigestEnabled !== undefined
          ? { weeklyDigestEnabled: parsed.weeklyDigestEnabled }
          : {}),
      },
      create: {
        userId: session.sub,
        pushEnabled: parsed.pushEnabled ?? true,
        emailEnabled: parsed.emailEnabled ?? true,
        smsEnabled: parsed.smsEnabled ?? false,
        notifyEveryTransaction: parsed.notifyEveryTransaction ?? true,
        notifyThresholdAmount: parsed.notifyThresholdAmount ?? null,
        weeklyDigestEnabled: parsed.weeklyDigestEnabled ?? true,
      },
    });

    return apiSuccess({
      preferences: {
        ...updated,
        notifyThresholdAmount:
          updated.notifyThresholdAmount?.toString() ?? null,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
