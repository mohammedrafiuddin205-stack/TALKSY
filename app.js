// ═══════════════════════════════════════════════════════════════
// TALKSY — Main App Orchestrator
// ═══════════════════════════════════════════════════════════════

const App = (() => {
  let _currentUser = null; // { uid, displayName, friendId, email }
  let _isAppInForeground = true;

  // ─── Boot ───
  function boot() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/TALKSY/sw.js').catch(err => {
        console.warn('SW registration failed:', err);
      });
    }

    // Init auth module UI
    Auth.init();

    // Listen for auth state changes
    auth.onAuthStateChanged(async user => {
      if (user) {
        await _onSignIn(user);
      } else {
        _onSignOut();
      }
    });

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        _switchTab(tab);
      });
    });

    // Page visibility
    document.addEventListener('visibilitychange', () => {
      _isAppInForeground = !document.hidden;
    });

    // Back button / keyboard Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') _handleBack();
    });

    window.addEventListener('popstate', _handleBack);
  }

  async function _onSignIn(user) {
    const uid = user.uid;

    // Fetch user document
    try {
      const doc = await db.collection(COL.USERS).doc(uid).get();
      if (!doc.exists) {
        // New user — name dialog should be showing
        return;
      }
      const data = doc.data();
      _currentUser = {
        uid,
        displayName: data.displayName || '',
        friendId: data.friendId || '',
        email: data.email || user.email || ''
      };
    } catch (err) {
      showToast('Failed to load profile.');
      return;
    }

    // Init all modules with uid
    Presence.init(uid);
    Contacts.init(uid);
    Chat.init(uid, _currentUser.displayName);
    Calls.init(uid, _currentUser.displayName);
    Notifications.init(uid);

    // Show main screen
    showScreen('screen-main');
    _switchTab('chats');
  }

  function _onSignOut() {
    cleanup();
    _currentUser = null;
    showScreen('screen-auth');
  }

  function _switchTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(el => {
      el.classList.remove('active');
      el.classList.add('hidden');
    });

    const tabEl = document.getElementById(`tab-${tab}`);
    if (tabEl) {
      tabEl.classList.remove('hidden');
      tabEl.classList.add('active');
    }

    // Load data
    if (tab === 'chats') Contacts.loadChatsTab();
    else if (tab === 'updates') Contacts.loadUpdatesTab();
    else if (tab === 'calls') Contacts.loadCallsTab();
  }

  function _handleBack() {
    const activeScreen = document.querySelector('.screen.active');
    if (!activeScreen) return;
    const id = activeScreen.id;

    if (id === 'screen-chat' || id === 'screen-group-chat') {
      Chat.cleanup();
      showScreen('screen-main');
    }
    // Call screens: must use end button
  }

  function getCurrentUser() { return _currentUser; }

  function cleanup() {
    Contacts.cleanup();
    Chat.cleanup();
    Calls.cleanup();
    Notifications.cleanup();
  }

  function isInForeground() { return _isAppInForeground; }

  return { boot, getCurrentUser, cleanup, isInForeground };
})();

// ─── Start the app ───
document.addEventListener('DOMContentLoaded', () => App.boot());
