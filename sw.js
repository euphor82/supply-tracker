const CACHE = "supply-tracker-v12";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== "supply-data").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first for our own files (so updates land), cache fallback when offline; fonts and the scanner library cache as they load.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === location.origin) {
    if (url.pathname.endsWith("/expiring.json")) return;
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html"))));
  } else if (/gstatic\.com$|googleapis\.com$|jsdelivr\.net$|unpkg\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })));
  }
});

// Daily background check (Chrome/Android installed PWA). The page keeps ./expiring.json in the "supply-data" cache up to date.
self.addEventListener("periodicsync", e => {
  if (e.tag === "check-expiring") e.waitUntil(checkExpiring());
});
async function checkExpiring() {
  try {
    const c = await caches.open("supply-data");
    const r = await c.match("./expiring.json");
    if (!r) return;
    const d = await r.json();
    if (!d.on || !d.items || !d.items.length) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = d.items.map(it => ({ name: it.name, days: Math.round((new Date(it.expires + "T00:00:00") - today) / 864e5) })).filter(x => x.days <= (d.days || 30)).sort((a, b) => a.days - b.days);
    if (!due.length) return;
    const body = due.slice(0, 4).map(x => x.name + (x.days < 0 ? " (expired)" : " in " + x.days + " d")).join(", ") + (due.length > 4 ? " +" + (due.length - 4) + " more" : "");
    await self.registration.showNotification("Supplies expiring", { body, icon: "icon-192.png", badge: "icon-192.png", tag: "expiring" });
  } catch (e) {}
}
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(c => "focus" in c);
    return open ? open.focus() : self.clients.openWindow("./");
  }));
});
