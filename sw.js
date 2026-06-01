// ═══════════════════════════════════════════════════════════════
// TALKSY — Service Worker (sw.js)
// Handles: FCM push notifications, offline caching, background sync
// ═══════════════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// ─── Firebase Init (must mirror config.js) ───────────────────
firebase.initializeApp({
  apiKey: "AIzaSyAISgt8woyC4DrlbH1Y1LLpy1yJnTs5R8I",
  authDomain: "talksy-app-5e3cd.firebaseapp.com",
  databaseURL: "https://talksy-app-5e3cd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "talksy-app-5e3cd",
  storageBucket: "talksy-app-5e3cd.firebasestorage.app",
  messagingSenderId: "337828548462",
  appId: "1:337828548462:android:11516bd9c4bb1b1acd3b7f"
});

const messaging = firebase.messaging();

// ─── Cache Config ─────────────────────────────────────────────
const CACHE_NAME = 'talksy-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/config.js',
  '/js/utils.js',
  '/js/auth.js',
  '/js/contacts.js',
  '/js/chat.js',
  '/js/calls.js',
  '/js/notifications.js',
  '/js/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ─── Install: Cache static assets ────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        // Non-fatal: some assets may not exist yet during dev
        console.warn('[SW] Cache addAll partial failure:', err);
      });
    })
  );
  self.skipWaiting();
});

// ─── Activate: Purge old caches ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch: Network-first, cache fallback ────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests from our own origin
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses for static assets
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline fallback: serve from cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // For navigation requests, return the cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// ─── FCM Background Messages ─────────────────────────────────
// Fires when the app is in the background or closed
messaging.onBackgroundMessage(payload => {
  console.log('[SW] Background message:', payload);

  const notification = payload.notification || {};
  const data = payload.data || {};

  const title = notification.title || data.title || 'TALKSY';
  const body  = notification.body  || data.body  || 'You have a new message';
  const callType = data.callType || '';
  const isCall = data.type === 'call';

  const options = {
    body,
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag:   isCall ? 'incoming-call' : 'message-' + (data.chatId || Date.now()),
    data:  { url: '/', ...data },
    vibrate: isCall ? [200, 100, 200, 100, 200] : [100],
    requireInteraction: isCall,
    actions: isCall
      ? [
          { action: 'accept', title: '✅ Answer' },
          { action: 'decline', title: '❌ Decline' }
        ]
      : [
          { action: 'open', title: 'Open' }
        ],
    silent: false
  };

  return self.registration.showNotification(title, options);
});

// ─── Notification Click ───────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const action   = event.action;
  const data     = event.notification.data || {};
  const targetUrl = data.url || '/';

  if (action === 'decline') {
    // Optionally send a decline signal back — app handles it via Firestore
    return;
  }

  // Focus existing window or open a new one
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existingClient = clients.find(c => c.url.startsWith(self.location.origin));
      if (existingClient) {
        existingClient.focus();
        // Send a message to the app so it can navigate to the right chat/call
        existingClient.postMessage({ type: 'NOTIFICATION_CLICK', data });
      } else {
        self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ─── Notification Close ───────────────────────────────────────
self.addEventListener('notificationclose', event => {
  // Could log analytics here
  console.log('[SW] Notification closed:', event.notification.tag);
});

// ─── Push event (raw — FCM compat layer handles it above) ────
// Kept here for non-FCM push fallback
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'TALKSY', body: event.data.text() } };
  }

  // FCM compat already handles this; raw push is a safety net
  const notification = payload.notification || {};
  const title = notification.title || 'TALKSY';
  const options = {
    body: notification.body || '',
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag:   'talksy-push'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
