self.addEventListener('push', event => {
  let payload = { title: 'Aura', body: 'Something happened on Aura', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {}

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Aura', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: payload.tag || undefined,
      data: { url: payload.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow ? clients.openWindow(url) : undefined
    })
  )
})
