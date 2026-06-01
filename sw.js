// ═══════════════════════════════════════════════════════════════
// TALKSY — Service Worker (sw.js)
// ═══════════════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDvAsuclWA9-yFCYiu74Fg02wqe0psRifI",
  authDomain: "talksy-app-5e3cd.firebaseapp.com",
  databaseURL: "https://talksy-app-5e3cd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "talksy-app-5e3cd",
  storageBucket: "talksy-app-5e3cd.firebasestorage.app",
  messagingSenderId: "337828548462",
  appId: "1:337828548462:web:1ca5c9e6fa0e26b4cd3b7f"
});

const messaging = firebase.messaging();

const CACHE_NAME = 'talksy-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.css',
  '/config.js',
  '/utils.js',
  '/auth.js',
  '/contacts.js',
  '/chat.js',
  '/calls.js',
  '/notifications.js',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Cache partial failure:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match('/index.html');
      }))
  );
});

messaging.onBackgroundMessage(payload => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'TALKSY';
  const body  = notification.body  || data.body  || 'You have a new message';
  const isCall = data.type === 'call';

  return self.registration.showNotification(title, {
    body,
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag:   isCall ? 'incoming-call' : 'message-' + (data.chatId || Date.now()),
    data:  { url: '/', ...data },
    vibrate: isCall ? [200, 100, 200, 100, 200] : [100],
    requireInteraction: isCall,
    actions: isCall
      ? [{ action: 'accept', title: '✅ Answer' }, { action: 'decline', title: '❌ Decline' }]
      : [{ action: 'open', title: 'Open' }]
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'decline') return;
  const data = event.notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'NOTIFICATION_CLICK', data });
      } else {
        self.clients.openWindow(data.url || '/');
      }
    })
  );
});

self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { notification: { title: 'TALKSY', body: event.data.text() } }; }
  const n = payload.notification || {};
  event.waitUntil(
    self.registration.showNotification(n.title || 'TALKSY', {
      body: n.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'talksy-push'
    })
  );
});
