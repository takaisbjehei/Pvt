self.addEventListener('push', function(event) {
  let data = { title: 'R.P.A.I', body: 'You have a new message!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'R.P.A.I', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: 'https://cdn-icons-png.flaticon.com/512/8649/8649607.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/8649/8649607.png',
    vibrate: [100, 50, 100],
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const payloadData = event.notification.data || {};
  let targetUrl = '/';
  if (payloadData.senderId && payloadData.chatType) {
    targetUrl = `/#chats`; // redirect to chats list which triggers navigation
  }

  const urlToOpen = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
