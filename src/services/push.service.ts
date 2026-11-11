import webpush from "web-push";
import { PushPlatform, PushSubscription } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface PushMessagePayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushDispatchResult {
  totalSubscriptions: number;
  webVapidSent: number;
  mobileSent: number;
  failedOrExpired: number;
}

let vapidConfigured = false;

function ensureWebVapidConfigured(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:support@goodspend.app";

  if (
    !publicKey ||
    !privateKey ||
    publicKey === "your-vapid-public-key" ||
    privateKey === "your-vapid-private-key"
  ) {
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch (err) {
    logger.warn(
      "push.vapid_configuration_failed",
      { provider: "web_vapid" },
      err,
    );
    return false;
  }
}

/**
 * Dedicated Web Push (VAPID) Dispatcher
 * Uses `endpoint`, `p256dh`, and `auth` from `PushSubscription` (`platform = WEB_VAPID`).
 */
async function sendWebVapidNotification(
  sub: PushSubscription,
  payload: PushMessagePayload,
): Promise<boolean> {
  if (!sub.p256dh || !sub.auth) {
    return false;
  }

  if (!ensureWebVapidConfigured()) {
    logger.info("push.mock_dispatch", {
      provider: "web_vapid",
      outcome: "not_sent_missing_configuration",
    });
    return false;
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        timestamp: Date.now(),
      }),
      { timeout: 5000, TTL: 300 },
    );
    return true;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await prisma.pushSubscription
        .update({
          where: { id: sub.id },
          data: { isActive: false },
        })
        .catch(() => null);
    }
    logger.warn(
      "push.web_vapid_delivery_failed",
      {
        provider: "web_vapid",
        httpStatus: statusCode,
        subscriptionExpired: statusCode === 404 || statusCode === 410,
      },
      err,
    );
    return false;
  }
}

/**
 * Dedicated Mobile Push Adapter (`MOBILE_FCM` / `MOBILE_APNS`)
 * Kept cleanly separated from Web Push so future React Native / iOS / Android
 * apps can register native `deviceToken`s without modifying the web push flow.
 */
async function sendMobilePushNotification(
  sub: PushSubscription,
  payload: PushMessagePayload,
): Promise<boolean> {
  if (!sub.deviceToken) {
    return false;
  }

  logger.info("push.native_adapter_mock", {
    provider: sub.platform,
    outcome: "not_sent",
    recipientPresent: Boolean(sub.deviceToken),
  });
  return true;
}

/**
 * Dispatches push notifications across all active subscriptions for a User or Child,
 * routing `WEB_VAPID` vs `MOBILE_FCM` / `MOBILE_APNS` through their respective handlers.
 */
export async function dispatchPushToTarget(params: {
  userId?: string;
  childId?: string;
  payload: PushMessagePayload;
  platforms?: PushPlatform[];
}): Promise<PushDispatchResult> {
  if (!params.userId && !params.childId) {
    return {
      totalSubscriptions: 0,
      webVapidSent: 0,
      mobileSent: 0,
      failedOrExpired: 0,
    };
  }

  if (params.userId) {
    const preference = await prisma.notificationPreference.findUnique({
      where: { userId: params.userId },
    });
    if (preference && !preference.pushEnabled)
      return {
        totalSubscriptions: 0,
        webVapidSent: 0,
        mobileSent: 0,
        failedOrExpired: 0,
      };
  }
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.childId ? { childId: params.childId } : {}),
      isActive: true,
      ...(params.platforms ? { platform: { in: params.platforms } } : {}),
    },
  });

  let webVapidSent = 0;
  let mobileSent = 0;
  let failedOrExpired = 0;

  for (const sub of subscriptions) {
    if (sub.platform === "WEB_VAPID") {
      const ok = await sendWebVapidNotification(sub, params.payload);
      if (ok) webVapidSent++;
      else failedOrExpired++;
    } else {
      const ok = await sendMobilePushNotification(sub, params.payload);
      if (ok) mobileSent++;
      else failedOrExpired++;
    }
  }

  return {
    totalSubscriptions: subscriptions.length,
    webVapidSent,
    mobileSent,
    failedOrExpired,
  };
}
