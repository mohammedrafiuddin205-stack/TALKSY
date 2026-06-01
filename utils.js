// ═══════════════════════════════════════════════════════════════
// TALKSY — Utility Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Get 1-2 initials from a display name
 */
function getInitials(name) {
  if (!name || typeof name !== 'string') return 'T';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Set avatar text on a DOM element
 */
function setAvatar(el, name, isGroup = false) {
  if (!el) return;
  el.textContent = getInitials(name);
  if (isGroup) {
    el.style.background = 'var(--green)';
  } else {
    el.style.background = 'var(--blue)';
  }
}

/**
 * Format timestamp to human readable
 */
function formatTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

/**
 * Format seconds into MM:SS
 */
function formatDuration(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Generate a random Friend ID like tk-1234
 */
function generateFriendId() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `tk-${num}`;
}

/**
 * Generate a random UUID for call channels
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/**
 * Get consistent chatId for two users (sorted uid pair)
 */
function getChatId(uid1, uid2) {
  return [uid1, uid2].sort().join('_');
}

/**
 * Show a toast message
 */
function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

/**
 * Show/hide error text element
 */
function showError(el, message) {
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

/**
 * Show/hide success text element
 */
function showSuccess(el, message) {
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

/**
 * Navigate to a screen — hides all others
 */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const target = document.getElementById(id);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }
}

/**
 * Show a dialog
 */
function showDialog(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

/**
 * Hide a dialog
 */
function hideDialog(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

/**
 * Safe Firestore timestamp to ms
 */
function tsToMs(ts) {
  if (!ts) return 0;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return Number(ts) || 0;
}

/**
 * Scroll a container to bottom
 */
function scrollToBottom(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}
