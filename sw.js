// Minimal service worker: makes the app installable and shows the last app shell when offline.
// It never touches other origins (the database host, fonts), never caches API or photo requests, and always tries the
// network first for pages so a new deploy is picked up straight away.
const CACHE = 'iiitd-market-shell-v1'
const BASE = new URL('./', self.location).pathname // e.g. /iiitd-black-market/

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(new Request(BASE, { cache: 'reload' }))).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    if (url.pathname.endsWith('.html') && url.pathname !== BASE) return // privacy.html, terms.html: plain network
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.pathname === BASE) { const copy = response.clone(); caches.open(CACHE).then((c) => c.put(BASE, copy)) }
          return response
        })
        .catch(() => caches.match(BASE)),
    )
    return
  }
  if (url.pathname.startsWith(BASE + 'assets/')) {
    // Build files have content hashes in their names, so a cached copy is never stale.
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((c) => c.put(request, copy)) }
        return response
      })),
    )
  }
})

// Push notifications (docs/push-notifications.md). The message is {title, body, url, tag}; `url` is an app path
// such as /inbox/<id>. The tag matches the in-page alert so one event never shows two notifications.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }
  const path = typeof data.url === 'string' ? data.url : ''
  event.waitUntil(self.registration.showNotification(data.title || 'The Smugglr', {
    body: data.body || 'You have a new notification',
    icon: BASE + 'pwa/icon-192.png',
    badge: BASE + 'pwa/icon-192.png',
    tag: path || 'notice',
    renotify: true, // A newer grouped message should alert again, not silently replace the tray entry.
    data: { url: new URL(path.replace(/^\//, ''), self.registration.scope).href },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data && event.notification.data.url
  const url = typeof target === 'string' && target.startsWith(self.registration.scope) ? target : self.registration.scope
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((w) => w.url.startsWith(self.registration.scope))
    if (open) return open.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : undefined))
    return self.clients.openWindow(url)
  }))
})
