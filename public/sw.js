self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

// A network-only handler makes the app installable without caching private
// family or financial data on the device.
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") {
    event.respondWith(fetch(event.request));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  if (payload.debug) console.info("[Pudding push] Received", payload.debug);
  if (/^\/approve\/[A-Za-z0-9_-]+$/.test(payload.data?.href || "")) {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
        for (const client of windows) {
          client.postMessage({ type: "pudding-purchase-approval" });
        }
      }),
    );
  }
  event.waitUntil(
    self.registration
      .showNotification(payload.title || "Pudding", {
        body: payload.body || "You have a new update.",
        icon: "/images/pudding-app-192.png",
        data: payload.data || {},
      })
      .then(() => {
        if (payload.debug)
          console.info("[Pudding push] Show requested", payload.debug);
      })
      .catch((error) => {
        if (payload.debug)
          console.warn("[Pudding push] Show failed", payload.debug, error.name);
        throw error;
      }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href;
  const path =
    typeof href === "string" &&
    /^\/(?:inbox|approvals|(?:approve|purchases|goals|approvals\/tasks)\/[A-Za-z0-9_-]+)$/.test(
      href,
    )
      ? href
      : "/inbox";
  event.waitUntil(clients.openWindow(new URL(path, self.location.origin).href));
});
