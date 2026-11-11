self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Pudding", {
      body: payload.body || "You have a new update.",
      icon: "/images/profile/avatar-1.svg",
      data: payload.data || {},
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href;
  const path =
    typeof href === "string" && /^\/(purchases\/|inbox$|approvals$)/.test(href)
      ? href
      : "/inbox";
  event.waitUntil(clients.openWindow(new URL(path, self.location.origin).href));
});
