const APP_URL = '/canes-rivalry-app/';

function normalizeUrl(url) {
  if (!url || url === '/') return APP_URL;
  return url;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};

  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'Canes Rivalry',
      body: event.data.text()
    };
  }

  const title = payload.title || 'Canes Rivalry';
  const body = payload.body || payload.message || '';
  const tag = payload.tag || 'canes-rivalry';
  const url = normalizeUrl(payload.url);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      icon: 'assets/app-icon.png',
      badge: 'assets/app-icon.png'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = normalizeUrl(event.notification?.data?.url);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
