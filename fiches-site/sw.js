/* Carnet : reçoit les rappels (notifications) même quand le site est fermé. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Carnet', {
    body: d.body || 'C’est l’heure de réviser un peu.',
    icon: 'icon-192.png', badge: 'icon-192.png', tag: 'rappel', data: { url: d.url || '/progres.html' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  let u = (e.notification.data && e.notification.data.url) || '/';
  if (typeof u !== 'string' || u.charAt(0) !== '/' || u.charAt(1) === '/') u = '/';   // uniquement une page du site
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { if ('navigate' in c) c.navigate(u); return c.focus(); } }
    return self.clients.openWindow(u);
  }));
});
