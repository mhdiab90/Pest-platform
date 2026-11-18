/* Firebase Messaging service worker for Pest Platform web push. */
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBPrzHFEIM3AOFclTzJ1SpG_Nq6BKHgrSo",
  authDomain: "pest-plat-form.firebaseapp.com",
  databaseURL: "https://pest-plat-form-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "pest-plat-form",
  storageBucket: "pest-plat-form.firebasestorage.app",
  messagingSenderId: "237071041951",
  appId: "1:237071041951:web:a501285338ec178a65a9aa"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  // FCM automatically displays a payload.notification message in the background.
  // Only render our own notification if the sender ever sends a data-only message.
  if (payload && payload.notification) return;
  const data = payload && payload.data ? payload.data : {};
  const notification = payload && payload.notification ? payload.notification : {};
  const title = notification.title || "Pest Platform";
  const options = {
    body: notification.body || "لديك تنبيه جديد. افتح التطبيق للاطلاع على التفاصيل.",
    tag: "pest-" + String(data.type || "notification") + "-" + String(data.eventId || Date.now()),
    renotify: false,
    data: {
      type: String(data.type || ""),
      eventId: String(data.eventId || ""),
      route: String(data.route || ""),
      url: String(data.url || self.registration.scope)
    }
  };
  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", event => {
  event.stopImmediatePropagation();
  event.notification.close();
  const raw = event.notification.data || {};
  const fcmMessage = raw.FCM_MSG || raw;
  const payload = fcmMessage.data || fcmMessage;
  const data = {
    type: String(payload.type || raw.type || ""),
    eventId: String(payload.eventId || raw.eventId || ""),
    route: String(payload.route || raw.route || ""),
    url: String(payload.url || raw.url || self.registration.scope)
  };
  const target = new URL(data.url, self.registration.scope);
  if (data.type) target.searchParams.set("pushType", data.type);
  if (data.eventId) target.searchParams.set("pushId", data.eventId);
  if (data.route) target.searchParams.set("pushRoute", data.route);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async windowClients => {
      const existing = windowClients.find(client => {
        try { return new URL(client.url).origin === target.origin; }
        catch (_) { return false; }
      });
      if (existing) {
        await existing.navigate(target.href);
        return existing.focus();
      }
      return self.clients.openWindow(target.href);
    })
  );
});
