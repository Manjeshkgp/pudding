import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { dispatchPushToTarget } from "@/services/push.service";
import { sendAlertEmail } from "@/services/email.service";
import { sendSms } from "@/services/sms.service";

export interface DispatchNotificationInput {
  familyId?: string | null;
  userId?: string;
  childId?: string;
  type?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  transactionAmount?: number;
  ctaLabel?: string;
  ctaUrl?: string;
  currentTimeHHMM?: string; // Optional override for testing Child Quiet Hours (`FR-12.2`)
}

/**
 * Evaluates whether the current `HH:MM` time falls inside a `[start, end]` window.
 * Handles both same-day windows (e.g. `13:00` to `15:00`) and overnight windows
 * that cross midnight (e.g. `20:00` to `07:00`).
 */
export function isWithinQuietHours(
  quietStart?: string | null,
  quietEnd?: string | null,
  nowHHMM?: string,
): boolean {
  if (!quietStart || !quietEnd) return false;

  const parseMinutes = (hhmm: string): number | null => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  };

  const startMin = parseMinutes(quietStart);
  const endMin = parseMinutes(quietEnd);
  if (startMin === null || endMin === null) return false;

  const currentStr =
    nowHHMM ||
    (() => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes(),
      ).padStart(2, "0")}`;
    })();

  const currentMin = parseMinutes(currentStr);
  if (currentMin === null) return false;

  if (startMin <= endMin) {
    return currentMin >= startMin && currentMin < endMin;
  }
  return currentMin >= startMin || currentMin < endMin;
}

/**
 * Multi-Channel Notification Dispatcher (`FR-10.4` & `FR-12.2`)
 * 1. Always creates an `IN_APP` notification row in PostgreSQL.
 * 2. For Child targets: checks `quietHoursStart` / `quietHoursEnd` (`FR-12.2`) before firing Push.
 * 3. For Parent targets: checks `NotificationPreference` (`pushEnabled`, `emailEnabled`, `smsEnabled`,
 *    `notifyEveryTransaction`, `notifyThresholdAmount`) before firing Web/Mobile Push, Resend Email, or SMS.
 */
export async function dispatchNotification(input: DispatchNotificationInput) {
  const inAppNotification = await prisma.notification.create({
    data: {
      familyId: input.familyId || null,
      userId: input.userId || null,
      childId: input.childId || null,
      type: input.type || "GENERAL_ALERT",
      channel: "IN_APP",
      title: input.title,
      message: input.body,
      metadata: (input.data ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
  });

  // Child Notification Path (with FR-12.2 Quiet Hours Guard)
  if (input.childId) {
    const child = await prisma.child.findUnique({
      where: { id: input.childId },
      select: {
        id: true,
        quietHoursStart: true,
        quietHoursEnd: true,
      },
    });

    const quietActive = isWithinQuietHours(
      child?.quietHoursStart,
      child?.quietHoursEnd,
      input.currentTimeHHMM,
    );

    if (quietActive) {
      return {
        notification: inAppNotification,
        quietHoursSuppressedPush: true,
        channelsDispatched: ["IN_APP"],
      };
    }

    const pushResult = await dispatchPushToTarget({
      childId: input.childId,
      payload: {
        title: input.title,
        body: input.body,
        data: input.data,
      },
    });

    return {
      notification: inAppNotification,
      quietHoursSuppressedPush: false,
      pushResult,
      channelsDispatched:
        pushResult.webVapidSent + pushResult.mobileSent > 0
          ? ["IN_APP", "PUSH"]
          : ["IN_APP"],
    };
  }

  // Parent Notification Path (with FR-10.4 NotificationPreference Guard)
  if (input.userId) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      include: { notificationPreference: true },
    });

    if (!user) {
      return {
        notification: inAppNotification,
        channelsDispatched: ["IN_APP"],
      };
    }

    const pref = user.notificationPreference;
    const pushEnabled = pref ? pref.pushEnabled : true;
    const emailEnabled = pref ? pref.emailEnabled : true;
    const smsEnabled = pref ? pref.smsEnabled : false;

    if (typeof input.transactionAmount === "number" && pref) {
      const threshold = pref.notifyThresholdAmount
        ? Number(pref.notifyThresholdAmount)
        : 0;
      const meetsCriteria =
        pref.notifyEveryTransaction ||
        (threshold > 0 && input.transactionAmount >= threshold);

      if (!meetsCriteria) {
        return {
          notification: inAppNotification,
          suppressedByThreshold: true,
          channelsDispatched: ["IN_APP"],
        };
      }
    }

    const channelsDispatched: string[] = ["IN_APP"];

    if (pushEnabled) {
      const pushResult = await dispatchPushToTarget({
        userId: user.id,
        payload: {
          title: input.title,
          body: input.body,
          data: input.data,
        },
      });
      if (pushResult.webVapidSent + pushResult.mobileSent > 0) {
        channelsDispatched.push("PUSH");
      }
    }

    if (emailEnabled && user.email) {
      const emailRes = await sendAlertEmail({
        to: user.email,
        recipientName: user.name,
        title: input.title,
        body: input.body,
        ctaLabel: input.ctaLabel,
        ctaUrl: input.ctaUrl,
      });
      if (emailRes.delivered) {
        channelsDispatched.push("EMAIL");
      }
    }

    if (smsEnabled && user.phone) {
      const smsRes = await sendSms({
        toPhone: user.phone,
        message: `Pudding: ${input.title} - ${input.body}`,
      });
      if (smsRes.delivered) {
        channelsDispatched.push("SMS");
      }
    }

    return {
      notification: inAppNotification,
      channelsDispatched,
    };
  }

  return {
    notification: inAppNotification,
    channelsDispatched: ["IN_APP"],
  };
}

/** Maps new UI notifications through the existing preferences/quiet-hours dispatcher. */
export async function notifyWithPush(
  input: Prisma.NotificationUncheckedCreateInput,
) {
  const data =
    input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>)
      : undefined;
  const metadata = data as
    | { purchaseId?: string; submissionId?: string; goalId?: string }
    | undefined;
  const href = metadata?.purchaseId
    ? `/purchases/${metadata.purchaseId}`
    : metadata?.goalId
      ? `/goals/${metadata.goalId}`
      : "/inbox";
  const common = {
    familyId: input.familyId,
    type: input.type,
    title: input.title,
    body: input.message,
    data: { ...data, href },
  };
  if (input.childId)
    return (await dispatchNotification({ ...common, childId: input.childId }))
      .notification;
  if (input.userId)
    return (await dispatchNotification({ ...common, userId: input.userId }))
      .notification;
  const parents = input.familyId
    ? await prisma.user.findMany({
        where: { familyId: input.familyId },
        select: { id: true },
      })
    : [];
  if (!parents.length) return (await dispatchNotification(common)).notification;
  let first:
    | Awaited<ReturnType<typeof dispatchNotification>>["notification"]
    | null = null;
  for (const parent of parents) {
    try {
      const result = await dispatchNotification({
        ...common,
        userId: parent.id,
      });
      first ||= result.notification;
    } catch (error) {
      logger.warn(
        "notification.dispatch_failed",
        { provider: "notifications" },
        error,
      );
    }
  }
  return first;
}
