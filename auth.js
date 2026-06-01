// ═══════════════════════════════════════════════════════════════
// TALKSY — Authentication Module
// ═══════════════════════════════════════════════════════════════

const Auth = (() => {
  let _pendingUser = null; // holds user after signup before name entry

  function init() {
    const btnLogin = document.getElementById('btn-login');
    const btnSignup = document.getElementById('btn-signup');
    const btnSaveName = document.getElementById('btn-save-name');

    btnLogin.addEventListener('click', handleLogin);
    btnSignup.addEventListener('click', handleSignup);
    btnSaveName.addEventListener('click', handleSaveName);

    // Allow Enter key on auth inputs
    document.getElementById('auth-email').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('auth-password').focus();
    });
    document.getElementById('auth-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleLogin();
    });
    document.getElementById('input-display-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSaveName();
    });
  }

  function handleLogin() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');

    showError(errEl, '');

    if (!email) { showError(errEl, 'Please enter your email.'); return; }
    if (!password) { showError(errEl, 'Please enter your password.'); return; }

    const btn = document.getElementById('btn-login');
    btn.textContent = 'Signing in...';
    btn.disabled = true;

    auth.signInWithEmailAndPassword(email, password)
      .then(() => {
        btn.textContent = 'Sign In';
        btn.disabled = false;
      })
      .catch(err => {
        btn.textContent = 'Sign In';
        btn.disabled = false;
        showError(errEl, friendlyAuthError(err.code));
      });
  }

  function handleSignup() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');

    showError(errEl, '');

    if (!email) { showError(errEl, 'Please enter your email.'); return; }
    if (password.length < 6) { showError(errEl, 'Password must be at least 6 characters.'); return; }

    const btn = document.getElementById('btn-signup');
    btn.textContent = 'Creating...';
    btn.disabled = true;

    auth.createUserWithEmailAndPassword(email, password)
      .then(cred => {
        btn.textContent = 'Create Account';
        btn.disabled = false;
        _pendingUser = cred.user;
        // Show name dialog
        document.getElementById('input-display-name').value = '';
        showError(document.getElementById('name-error'), '');
        showDialog('dialog-name');
      })
      .catch(err => {
        btn.textContent = 'Create Account';
        btn.disabled = false;
        showError(errEl, friendlyAuthError(err.code));
      });
  }

  function handleSaveName() {
    const name = document.getElementById('input-display-name').value.trim();
    const errEl = document.getElementById('name-error');

    showError(errEl, '');

    if (!name || name.length < 2) {
      showError(errEl, 'Name must be at least 2 characters.');
      return;
    }

    if (!_pendingUser) {
      hideDialog('dialog-name');
      return;
    }

    const btn = document.getElementById('btn-save-name');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    const uid = _pendingUser.uid;
    const email = _pendingUser.email;
    const friendId = generateFriendId();

    db.collection(COL.USERS).doc(uid).set({
      uid,
      displayName: name,
      friendId,
      email,
      isOnline: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
      btn.textContent = 'Continue';
      btn.disabled = false;
      hideDialog('dialog-name');
      _pendingUser = null;
      // Auth state listener will fire and load main
    })
    .catch(err => {
      btn.textContent = 'Continue';
      btn.disabled = false;
      showError(errEl, 'Failed to save: ' + err.message);
    });
  }

  function logout() {
    Presence.setOffline();
    App.cleanup();
    auth.signOut().then(() => {
      showScreen('screen-auth');
    });
  }

  function friendlyAuthError(code) {
    switch (code) {
      case 'auth/user-not-found': return 'No account with that email.';
      case 'auth/wrong-password': return 'Incorrect password.';
      case 'auth/invalid-email': return 'Invalid email address.';
      case 'auth/email-already-in-use': return 'Email already in use.';
      case 'auth/weak-password': return 'Password is too weak.';
      case 'auth/invalid-credential': return 'Invalid email or password.';
      case 'auth/too-many-requests': return 'Too many attempts. Try again later.';
      default: return 'Authentication failed. Please try again.';
    }
  }

  return { init, logout, handleSaveName };
})();

// ─── Online Presence ───
const Presence = (() => {
  let _uid = null;

  function init(uid) {
    _uid = uid;
    setOnline();

    // Realtime Database presence
    const presenceRef = rtdb.ref(`presence/${uid}`);
    const connectedRef = rtdb.ref('.info/connected');

    connectedRef.on('value', snap => {
      if (snap.val() === true) {
        presenceRef.onDisconnect().set({ isOnline: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
        presenceRef.set({ isOnline: true });
        // Mirror to Firestore
        db.collection(COL.USERS).doc(uid).update({ isOnline: true }).catch(() => {});
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        setOffline();
      } else {
        setOnline();
      }
    });
  }

  function setOnline() {
    if (!_uid) return;
    db.collection(COL.USERS).doc(_uid).update({ isOnline: true }).catch(() => {});
  }

  function setOffline() {
    if (!_uid) return;
    db.collection(COL.USERS).doc(_uid).update({ isOnline: false }).catch(() => {});
  }

  return { init, setOnline, setOffline };
})();
