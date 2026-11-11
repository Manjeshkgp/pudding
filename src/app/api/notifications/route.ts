import { olderThan, pageCursor, pageSize, takePage } from "@/lib/list-page";
import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { apiSuccess, handleRouteError, validateBody } from "@/lib/api-response";
import { requireAuth, requireParent } from "@/lib/auth-guard";

const markNotificationsReadSchema = z.object({
  notificationIds: z.array(z.string().trim().min(1)).optional(),
  markAllRead: z.boolean().optional().default(false),
});

const updatePreferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  notifyEveryTransaction: z.boolean().optional(),
  notifyThresholdAmount: z.number().min(0).max(10000).nullable().optional(),
  weeklyDigestEnabled: z.boolean().optional(),
});

/**
 * GET /api/notifications
 * Lists in-app notifications for the authenticated Parent or Child (FR-12.1, FR-12.2).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";

    const where =
      session.subjectType === "CHILD"
        ? {
            childId: session.sub,
            ...(unreadOnly ? { isRead: false } : {}),
          }
        : {
            familyId: session.familyId,
            childId: null,
            OR: [{ userId: null }, { userId: session.sub }],
            ...(unreadOnly ? { isRead: false } : {}),
          };

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: {
          AND: [
            where,
            olderThan("createdAt", pageCursor(req.nextUrl.searchParams)),
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: pageSize + 1,
      }),
      prisma.notification.count({
        where: { ...where, isRead: false },
      }),
    ]);

    return apiSuccess({
      unreadCount,
      ...takePage(notifications, "createdAt"),
      notifications: notifications.slice(0, pageSize),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/notifications
 * Marks notifications as read.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    const input = await validateBody(req, markNotificationsReadSchema);

    const baseScope =
      session.subjectType === "CHILD"
        ? { childId: session.sub }
        : {
            familyId: session.familyId,
            childId: null,
            OR: [{ userId: null }, { userId: session.sub }],
          };

    if (input.markAllRead) {
      await prisma.notification.updateMany({
        where: { ...baseScope, isRead: false },
        data: { isRead: true },
      });
    } else if (input.notificationIds && input.notificationIds.length > 0) {
      await prisma.notification.updateMany({
        where: {
          ...baseScope,
          id: { in: input.notificationIds },
        },
        data: { isRead: true },
      });
    }

    return apiSuccess({ updated: true }, 200, "Notifications marked as read");
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PUT /api/notifications
 * Updates parent notification rules: every transaction, over a threshold, weekly digest (FR-10.4, FR-12.3).
 */
export async function PUT(req: NextRequest) {
  try {
    const { user } = await requireParent(req);
    const input = await validateBody(req, updatePreferencesSchema);

    const updated = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        pushEnabled: input.pushEnabled ?? true,
        emailEnabled: input.emailEnabled ?? true,
        smsEnabled: input.smsEnabled ?? false,
        notifyEveryTransaction: input.notifyEveryTransaction ?? true,
        notifyThresholdAmount: input.notifyThresholdAmount ?? null,
        weeklyDigestEnabled: input.weeklyDigestEnabled ?? true,
      },
      update: {
        ...(input.pushEnabled !== undefined
          ? { pushEnabled: input.pushEnabled }
          : {}),
        ...(input.emailEnabled !== undefined
          ? { emailEnabled: input.emailEnabled }
          : {}),
        ...(input.smsEnabled !== undefined
          ? { smsEnabled: input.smsEnabled }
          : {}),
        ...(input.notifyEveryTransaction !== undefined
          ? { notifyEveryTransaction: input.notifyEveryTransaction }
          : {}),
        ...(input.notifyThresholdAmount !== undefined
          ? { notifyThresholdAmount: input.notifyThresholdAmount }
          : {}),
        ...(input.weeklyDigestEnabled !== undefined
          ? { weeklyDigestEnabled: input.weeklyDigestEnabled }
          : {}),
      },
    });

    return apiSuccess(
      {
        ...updated,
        notifyThresholdAmount:
          updated.notifyThresholdAmount?.toString() ?? null,
      },
      200,
      "Notification preferences updated",
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
