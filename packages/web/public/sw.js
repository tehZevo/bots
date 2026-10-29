const CACHE = "bots-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch("./sw-manifest.json")
      .then((r) => r.json())
      .then((urls) => caches.open(CACHE).then((c) => c.addAll(["/", ...urls])))
      .catch(() => caches.open(CACHE)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match("/").then((r) => r || Response.error()),
      ),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => Response.error()),
    ),
  );
});

function pushPayload(event) {
  try {
    return event.data?.json() ?? {};
  } catch {
    return {};
  }
}

async function markNotificationRead(id) {
  if (!id || typeof id !== "string") return;
  try {
    await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* read state retries on the next app load */
  }
}

function notificationHref(target) {
  const path =
    typeof target === "string" && target.startsWith("/") ? target : "/";
  return new URL(path, self.location.origin).href;
}

self.addEventListener("push", (event) => {
  const data = pushPayload(event);
  event.waitUntil(
    self.registration.showNotification(data.title ?? "bots", {
      body: data.body ?? "",
      tag: `bots-${data.id ?? Date.now()}`,
      data: { id: data.id, target: data.target },
      silent: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const payload = notification.data ?? {};
  event.notification.close();
  event.waitUntil(
    markNotificationRead(payload.id).then(async () => {
      const href = notificationHref(payload.target);
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      if (clients.length > 0) {
        for (const client of clients) {
          client.postMessage({
            type: "bots:navigate",
            path: new URL(href).pathname + new URL(href).search,
          });
        }
        const first = clients.find((client) => "focus" in client);
        if (first) return first.focus();
      }
      return self.clients.openWindow(href);
    }),
  );
});
