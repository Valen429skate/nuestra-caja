// Service worker: permite abrir la app al instante y sin conexión. Los datos siempre vienen de Supabase.
const CACHE = "caja-beae6caf91";
const SHELL = ["./","index.html","app.js","logic.js","supabase-db.js","push.js","shell.js","supabase.js","config.js","manifest.webmanifest","assets/icon-192.png","assets/icon-512.png","assets/apple-touch-icon.png","assets/favicon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // Supabase y fuentes: siempre por red
  // Red primero (para recibir actualizaciones); si no hay conexión, la copia guardada.
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
// Notificaciones: llegan aunque la app esté cerrada.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Nuestra Caja", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: "assets/icon-192.png", badge: "assets/badge-72.png",
    vibrate: [60, 40, 60], data: { url: self.registration.scope },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope) && "focus" in c) return c.focus();
    return self.clients.openWindow(self.registration.scope);
  }));
});
self.addEventListener("pushsubscriptionchange", (e) => { /* el móvil renovó la suscripción: al abrir la app se vuelve a registrar */ });
