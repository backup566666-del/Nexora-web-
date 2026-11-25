/* Nexora Firebase Cloud Messaging Service Worker */
self.addEventListener('push', function (event) {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'Nexora', body: event.data.text() } };
  }
  const notification = payload.notification || {};
  const title = notification.title || 'Nexora';
  const options = {
    body: notification.body || 'You have a new update on Nexora.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: payload.data || { link: '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i += 1) {
        const client = clientList[i];
        if ('focus' in client) {
          client.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
