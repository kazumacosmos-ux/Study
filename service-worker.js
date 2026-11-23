// Study PWA service worker
// オフラインキャッシュは現時点では行わない。
// 将来のWeb Push通知にも使えるよう、Service Workerだけ登録する。
self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});
