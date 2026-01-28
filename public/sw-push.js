// Service Worker for Push Notifications - Colmeia GSTI

self.addEventListener('push', function(event) {
  console.log('[SW Push] Push event received');
  
  let data = {
    title: 'Colmeia GSTI',
    body: 'Nova notificação',
    icon: '/pwa-icons/icon-192x192.png',
    badge: '/pwa-icons/icon-144x144.png',
    tag: 'notification',
    url: '/'
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = {
        ...data,
        ...payload
      };
    }
  } catch (e) {
    console.error('[SW Push] Error parsing push data:', e);
  }

  const options = {
    body: data.body,
    icon: data.icon || '/pwa-icons/icon-192x192.png',
    badge: data.badge || '/pwa-icons/icon-144x144.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'colmeia-notification',
    renotify: true,
    requireInteraction: data.requireInteraction || false,
    data: {
      url: data.url || '/',
      timestamp: Date.now()
    },
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW Push] Notification clicked');
  
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.navigate(urlToOpen);
            return;
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', function(event) {
  console.log('[SW Push] Notification closed');
});

// Handle push subscription change
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('[SW Push] Subscription changed');
  
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: self.VAPID_PUBLIC_KEY
    })
    .then(function(subscription) {
      // Send new subscription to server
      return fetch('/api/push/update-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscription)
      });
    })
  );
});
