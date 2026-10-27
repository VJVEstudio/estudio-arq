// Service worker de la app: solo recibe avisos push y abre el proyecto al tocarlos.
// No guarda nada en caché, así cada vez se usa la última versión publicada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  const titulo = d.title || 'VJV Arquitectos';
  event.waitUntil(self.registration.showNotification(titulo, {
    body: d.body || '',
    icon: '/icono-192.png',
    badge: '/insignia-96.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Si la app ya está abierta, se usa esa ventana
    for (const v of ventanas) {
      if (v.url.startsWith(self.location.origin)) {
        await v.focus();
        if ('navigate' in v) return v.navigate(destino);
        return;
      }
    }
    return self.clients.openWindow(destino);
  })());
});
