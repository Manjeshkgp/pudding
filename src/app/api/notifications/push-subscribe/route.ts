import { NextRequest } from "next/server";
import { z } from "zod";
import { PushPlatform } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/jwt";
import { getWebPushPublicKey } from "@/services/push.service";
import { logger } from "@/lib/logger";
import {
  ApiError,
  apiSuccess,
  handleRouteError,
} from "@/lib/api-response";

const subscribeSchema = z
  .object({
    platform: z
      .enum(["WEB_VAPID", "MOBILE_FCM", "MOBILE_APNS"])
      .optional()
      .default("WEB_VAPID"),
    // Web Push (VAPID) fields
    endpoint: z.string().min(5).optional(),
    keys: z
      .object({
        p256dh: z.string().min(5),
        auth: z.string().min(4),
      })
      .optional(),
    p256dh: z.string().min(5).optional(),
    auth: z.string().min(4).optional(),
    // Future Mobile App (iOS APNs / Android FCM) fields
    deviceToken: z.string().min(8).optional(),
    deviceName: z.string().max(120).optional(),
    userAgent: z.string().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.platform === "WEB_VAPID") {
        const hasKeys = Boolean(
          (data.keys?.p256dh && data.keys?.auth) || (data.p256dh && data.auth)
        );
        return Boolean(data.endpoint) && hasKeys;
      }
      return Boolean(data.deviceToken);
    },
    {
      message:
        "For WEB_VAPID provide `endpoint` and `keys: { p256dh, auth }`. For MOBILE_FCM / MOBILE_APNS provide `deviceToken`.",
    }
  );

const unsubscribeSchema = z.object({
  endpoint: z.string().optional(),
  deviceToken: z.string().optional(),
  subscriptionId: z.string().optional(),
});

/**
 * GET /api/notifications/push-subscribe
 * Returns the public VAPID key (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`) and the caller's
 * active push subscriptions, grouped cleanly by `webSubscriptions` vs `mobileSubscriptions`.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      throw new ApiError(401, "Authentication required.", "UNAUTHORIZED");
    }

    const whereClause =
      session.subjectType === "CHILD"
        ? { childId: session.sub, isActive: true }
        : { userId: session.sub, isActive: true };

    const subscriptions = await prisma.pushSubscription.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    const webSubscriptions = subscriptions.filter(
      (s) => s.platform === "WEB_VAPID"
    );
    const mobileSubscriptions = subscriptions.filter(
      (s) => s.platform !== "WEB_VAPID"
    );

    return apiSuccess({
      vapidPublicKey: getWebPushPublicKey(),
      totalActive: subscriptions.length,
      webSubscriptions,
      mobileSubscriptions,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/notifications/push-subscribe
 * Registers or updates a Web Push (`WEB_VAPID`) or Mobile Push (`MOBILE_FCM` / `MOBILE_APNS`)
 * subscription for the authenticated Parent or Child.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      throw new ApiError(401, "Authentication required.", "UNAUTHORIZED");
    }

    const body = await req.json();
    const parsed = subscribeSchema.parse(body);

    const userId = session.subjectType === "USER" ? session.sub : null;
    const childId = session.subjectType === "CHILD" ? session.sub : null;
    const userAgent =
      parsed.userAgent || req.headers.get("user-agent") || undefined;

    const p256dh = parsed.keys?.p256dh || parsed.p256dh || null;
    const auth = parsed.keys?.auth || parsed.auth || null;

    const uniqueEndpoint =
      parsed.platform === "WEB_VAPID"
        ? parsed.endpoint!
        : `${parsed.platform.toLowerCase()}://${parsed.deviceToken}`;

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: uniqueEndpoint },
      update: {
        userId,
        childId,
        platform: parsed.platform as PushPlatform,
        p256dh,
        auth,
        deviceToken: parsed.deviceToken || null,
        deviceName: parsed.deviceName || null,
        userAgent,
        isActive: true,
      },
      create: {
        userId,
        childId,
        platform: parsed.platform as PushPlatform,
        endpoint: uniqueEndpoint,
        p256dh,
        auth,
        deviceToken: parsed.deviceToken || null,
        deviceName: parsed.deviceName || null,
        userAgent,
        isActive: true,
      },
    });

    if (process.env.NODE_ENV === "development" && subscription.platform === "WEB_VAPID") {
      logger.debug("push.browser_connected", {
        subscriptionId: subscription.id,
        accountType: session.subjectType === "USER" ? "parent" : "child",
      });
    }

    return apiSuccess(
      {
        subscription,
        platform: subscription.platform,
        isWebPush: subscription.platform === "WEB_VAPID",
      },
      201
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * DELETE /api/notifications/push-subscribe
 * Removes or deactivates a Web Push or Mobile Push subscription.
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      throw new ApiError(401, "Authentication required.", "UNAUTHORIZED");
    }

    const body = await req.json().catch(() => ({}));
    const parsed = unsubscribeSchema.parse(body);

    const ownerFilter =
      session.subjectType === "CHILD"
        ? { childId: session.sub }
        : { userId: session.sub };

    if (parsed.subscriptionId) {
      await prisma.pushSubscription.deleteMany({
        where: { id: parsed.subscriptionId, ...ownerFilter },
      });
    } else if (parsed.endpoint) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: parsed.endpoint, ...ownerFilter },
      });
    } else if (parsed.deviceToken) {
      await prisma.pushSubscription.deleteMany({
        where: { deviceToken: parsed.deviceToken, ...ownerFilter },
      });
    } else {
      throw new ApiError(
        400,
        "Provide `subscriptionId`, `endpoint`, or `deviceToken` to unsubscribe.",
        "VALIDATION_ERROR"
      );
    }

    return apiSuccess({
      unsubscribed: true,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
