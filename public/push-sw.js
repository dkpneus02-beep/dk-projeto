self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "DK Auto Center", body: event.data?.text?.() || "Há uma nova notificação." };
  }

  const title = data.title || "DK Auto Center";
  const options = {
    body: data.body || "Há uma nova notificação da oficina.",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: data.tag || data.notification_id || "dk-auto-center",
    renotify: Boolean(data.renotify),
    data: { url: data.url || "/notificacoes-internas", notification_id: data.notification_id || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/notificacoes-internas", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
