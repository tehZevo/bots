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

self.addEventListener("push", (event) => {
  event.waitUntil(
    fetch("/api/notifications?limit=1")
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then(([n]) =>
        self.registration.showNotification(n?.title ?? "bots", {
          body: n?.body ?? "",
          tag: `bots-${n?.id ?? Date.now()}`,
          silent: true,
        }),
      ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      for (const client of list) if ("focus" in client) return client.focus();
      return self.clients.openWindow("/");
    }),
  );
});
