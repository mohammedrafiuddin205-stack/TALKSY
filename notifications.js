// ═══════════════════════════════════════════════════════════════
// TALKSY — Push Notifications (Firebase Cloud Messaging)
// ═══════════════════════════════════════════════════════════════

const Notifications = (() => {
  let _uid = null;
  let _messaging = null;

  async function init(uid) {
    _uid = uid;

    // Check browser support
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (!firebase.messaging.isSupported()) return;

    try {
      _messaging = firebase.messaging();

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // Get FCM token
      const swReg = await navigator.serviceWorker.ready;
      const token = await _messaging.getToken({
        vapidKey: VAPID_PUBLIC_KEY,
        serviceWorkerRegistration: swReg
      });

      if (token) {
        // Save token to Firestore user doc
        await db.collection(COL.USERS).doc(uid).update({ fcmToken: token });
      }

      // Handle foreground messages
      _messaging.onMessage(payload => {
        const { title, body } = payload.notification || {};
        if (document.hidden) return; // let service worker handle background
        _showInAppBanner(title || 'TALKSY', body || '');
      });

    } catch (err) {
      console.warn('Notifications init failed:', err);
    }
  }

  function _showInAppBanner(title, body) {
    showToast(`${title}: ${body}`, 4000);
  }

  // Send a local notification (when receiving a call via Firestore listener)
  function showCallNotification(callerName, callType) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return; // only when in background

    const isVideo = callType && callType.includes('video');
    new Notification(`Incoming ${isVideo ? 'Video' : 'Voice'} Call`, {
      body: `${callerName} is calling you`,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'incoming-call',
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200]
    });
  }

  function cleanup() {
    _uid = null;
    _messaging = null;
  }

  return { init, showCallNotification, cleanup };
})();
