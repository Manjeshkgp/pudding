import { getApi, postApi, requestApi } from "@/lib/client-api";
export async function enableWebPush(requestPermission = true) {
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error(
      "This browser does not support web push. You can still use the Pudding inbox.",
    );
  const permission = requestPermission
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== "granted")
    throw new Error(
      "Notifications are not allowed. You can change this in browser settings.",
    );
  const config = await getApi<{ vapidPublicKey: string | null }>(
    "/api/notifications/push-subscribe",
  );
  if (!config.vapidPublicKey || config.vapidPublicKey.startsWith("your-"))
    throw new Error(
      "Push notifications are not configured yet. Your in-app inbox is ready.",
    );
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const encoded = config.vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(
    atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")),
    (c) => c.charCodeAt(0),
  );
  let existing = await registration.pushManager.getSubscription();
  if (
    existing?.options.applicationServerKey &&
    Array.from(new Uint8Array(existing.options.applicationServerKey)).join(
      ",",
    ) !== Array.from(bytes).join(",")
  ) {
    await existing.unsubscribe();
    existing = null;
  }
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  await postApi("/api/notifications/push-subscribe", {
    ...subscription.toJSON(),
    platform: "WEB_VAPID",
    deviceName: "Pudding browser",
  });
}
export async function disableWebPush() {
  boundOwner = null;
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    try {
      await requestApi("/api/notifications/push-subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } finally {
      await subscription.unsubscribe();
    }
  }
}

let boundOwner: string | null = null;
let binding: Promise<void> | null = null;
export async function bindBrowserPush(owner: string) {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    boundOwner === owner
  )
    return;
  if (binding) await binding;
  if (boundOwner === owner) return;
  binding = enableWebPush(false)
    .then(() => {
      boundOwner = owner;
    })
    .catch(() => undefined)
    .finally(() => {
      binding = null;
    });
  await binding;
}
