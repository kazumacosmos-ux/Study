// Study PWA service worker
// オフラインキャッシュは使用しない。Web Pushを受信して即時表示する。
self.addEventListener("install", event => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { payload = { body: event.data ? event.data.text() : "Studyからのお知らせです。" }; }
  const title = payload.title || "Study";
  const options = {
    body: payload.body || "Studyからのお知らせです。",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: { url: payload.url || "./" },
    tag: payload.tag || undefined,
    renotify: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "./", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) return client.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  }));
});
