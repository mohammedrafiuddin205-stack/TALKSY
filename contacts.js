// ═══════════════════════════════════════════════════════════════
// TALKSY — Contacts & Friend Requests Module
// ═══════════════════════════════════════════════════════════════

const Contacts = (() => {
  let _uid = null;
  let _contacts = []; // array of UserModel
  let _groups = [];   // array of GroupModel
  let _chatsUnsub = null;
  let _groupsUnsub = null;
  let _updatesUnsub = null;
  let _callHistoryUnsub = null;

  // ─── Init ───
  function init(uid) {
    _uid = uid;
    _bindDialogEvents();
  }

  // ─── Bind dialog UI events ───
  function _bindDialogEvents() {
    document.getElementById('btn-add-friend').addEventListener('click', () => {
      document.getElementById('input-friend-id').value = '';
      showError(document.getElementById('add-friend-error'), '');
      showSuccess(document.getElementById('add-friend-success'), '');
      showDialog('dialog-add-friend');
    });

    document.getElementById('btn-cancel-add-friend').addEventListener('click', () => {
      hideDialog('dialog-add-friend');
    });

    document.getElementById('btn-confirm-add-friend').addEventListener('click', sendFriendRequest);

    document.getElementById('input-friend-id').addEventListener('keydown', e => {
      if (e.key === 'Enter') sendFriendRequest();
    });

    document.getElementById('btn-create-group').addEventListener('click', openCreateGroupDialog);

    document.getElementById('btn-cancel-create-group').addEventListener('click', () => {
      hideDialog('dialog-create-group');
    });

    document.getElementById('btn-confirm-create-group').addEventListener('click', createGroup);

    // Profile
    document.getElementById('btn-profile').addEventListener('click', () => {
      const user = App.getCurrentUser();
      if (!user) return;
      const el = document.getElementById('profile-avatar');
      setAvatar(el, user.displayName);
      document.getElementById('profile-name').textContent = user.displayName || '';
      document.getElementById('profile-friend-id').textContent = `Friend ID: ${user.friendId || ''}`;
      document.getElementById('profile-email').textContent = user.email || '';
      showDialog('dialog-profile');
    });

    document.getElementById('btn-close-profile').addEventListener('click', () => hideDialog('dialog-profile'));
    document.getElementById('btn-logout').addEventListener('click', () => {
      hideDialog('dialog-profile');
      Auth.logout();
    });
  }

  // ─── Load Chats Tab ───
  function loadChatsTab() {
    if (_chatsUnsub) { _chatsUnsub(); _chatsUnsub = null; }
    if (_groupsUnsub) { _groupsUnsub(); _groupsUnsub = null; }

    let directItems = [];
    let groupItems = [];

    function renderMerged() {
      const merged = [
        ...directItems.map(i => ({ ...i, _type: 'direct' })),
        ...groupItems.map(i => ({ ...i, _type: 'group' }))
      ].sort((a, b) => tsToMs(b.lastMessageTime) - tsToMs(a.lastMessageTime));

      const container = document.getElementById('chats-list');
      const empty = document.getElementById('chats-empty');
      container.innerHTML = '';

      if (merged.length === 0) {
        empty.classList.remove('hidden');
        return;
      }
      empty.classList.add('hidden');

      merged.forEach(item => {
        const el = _buildChatListItem(item);
        container.appendChild(el);
      });
    }

    // Direct chats
    _chatsUnsub = db.collection(COL.CHATS)
      .where('participants', 'array-contains', _uid)
      .orderBy('lastMessageTime', 'desc')
      .limit(50)
      .onSnapshot(snap => {
        const promises = snap.docs.map(doc => {
          const data = doc.data();
          const partnerId = (data.participants || []).find(p => p !== _uid);
          if (!partnerId) return Promise.resolve(null);
          return db.collection(COL.USERS).doc(partnerId).get().then(u => {
            if (!u.exists) return null;
            const user = u.data();
            return {
              id: doc.id,
              uid: partnerId,
              name: user.displayName || 'Unknown',
              isOnline: user.isOnline || false,
              lastMessage: data.lastMessage || '',
              lastMessageTime: data.lastMessageTime,
              unread: (data.unreadCounts && data.unreadCounts[_uid]) || 0
            };
          });
        });
        Promise.all(promises).then(items => {
          directItems = items.filter(Boolean);
          _contacts = directItems;
          renderMerged();
        });
      }, () => {});

    // Group chats
    _groupsUnsub = db.collection(COL.GROUPS)
      .where('memberUids', 'array-contains', _uid)
      .orderBy('lastMessageTime', 'desc')
      .limit(30)
      .onSnapshot(snap => {
        groupItems = snap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            groupId: doc.id,
            name: data.groupName || 'Group',
            memberCount: (data.memberUids || []).length,
            lastMessage: data.lastMessage || '',
            lastMessageTime: data.lastMessageTime,
            unread: (data.unreadCounts && data.unreadCounts[_uid]) || 0,
            memberUids: data.memberUids || []
          };
        });
        _groups = groupItems;
        renderMerged();
      }, () => {});
  }

  function _buildChatListItem(item) {
    const isGroup = item._type === 'group';
    const div = document.createElement('div');
    div.className = 'list-item';

    const avatarWrapper = document.createElement('div');
    avatarWrapper.className = 'avatar-wrapper';

    const avatar = document.createElement('div');
    avatar.className = 'avatar' + (isGroup ? ' group-avatar' : '');
    setAvatar(avatar, item.name, isGroup);
    avatarWrapper.appendChild(avatar);

    if (!isGroup && item.isOnline) {
      const dot = document.createElement('div');
      dot.className = 'online-dot';
      avatarWrapper.appendChild(dot);
    }

    const info = document.createElement('div');
    info.className = 'list-item-info';

    const name = document.createElement('div');
    name.className = 'list-item-name';
    name.textContent = item.name;

    const sub = document.createElement('div');
    sub.className = 'list-item-subtitle';
    sub.textContent = item.lastMessage || (isGroup ? `${item.memberCount} members` : 'Tap to chat');

    info.appendChild(name);
    info.appendChild(sub);

    const right = document.createElement('div');
    right.className = 'list-item-right';

    if (item.lastMessageTime) {
      const ts = document.createElement('div');
      ts.className = 'timestamp-text';
      ts.textContent = formatTime(item.lastMessageTime);
      right.appendChild(ts);
    }

    if (item.unread > 0) {
      const badge = document.createElement('div');
      badge.className = 'unread-badge';
      badge.textContent = item.unread > 99 ? '99+' : item.unread;
      right.appendChild(badge);
    }

    div.appendChild(avatarWrapper);
    div.appendChild(info);
    div.appendChild(right);

    div.addEventListener('click', () => {
      if (isGroup) {
        Chat.openGroupChat(item.groupId, item.name, item.memberCount);
      } else {
        Chat.openChat(item.uid, item.name, item.id);
      }
    });

    return div;
  }

  // ─── Load Updates Tab ───
  function loadUpdatesTab() {
    if (_updatesUnsub) { _updatesUnsub(); _updatesUnsub = null; }

    _updatesUnsub = db.collection(COL.USERS).doc(_uid)
      .collection(COL.FRIEND_REQUESTS)
      .orderBy('timestamp', 'desc')
      .onSnapshot(snap => {
        const container = document.getElementById('updates-list');
        const empty = document.getElementById('updates-empty');
        const badge = document.getElementById('updates-badge');
        container.innerHTML = '';

        const docs = snap.docs;
        if (docs.length === 0) {
          empty.classList.remove('hidden');
          badge.classList.add('hidden');
        } else {
          empty.classList.add('hidden');
          badge.textContent = docs.length;
          badge.classList.remove('hidden');

          docs.forEach(doc => {
            const req = doc.data();
            const el = _buildRequestCard(doc.id, req);
            container.appendChild(el);
          });
        }
      }, () => {});
  }

  function _buildRequestCard(reqId, req) {
    const div = document.createElement('div');
    div.className = 'request-card';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    setAvatar(avatar, req.fromName || 'U');

    const info = document.createElement('div');
    info.className = 'list-item-info';

    const name = document.createElement('div');
    name.className = 'list-item-name';
    name.textContent = req.fromName || 'Unknown';

    const sub = document.createElement('div');
    sub.className = 'list-item-subtitle';
    sub.textContent = `${req.fromFriendId || ''} wants to connect`;

    info.appendChild(name);
    info.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'request-actions';

    const btnAccept = document.createElement('button');
    btnAccept.className = 'btn-sm btn-accept';
    btnAccept.textContent = 'Accept';
    btnAccept.addEventListener('click', () => acceptFriendRequest(reqId, req));

    const btnReject = document.createElement('button');
    btnReject.className = 'btn-sm btn-reject';
    btnReject.textContent = 'Decline';
    btnReject.addEventListener('click', () => rejectFriendRequest(reqId, req.fromUid));

    actions.appendChild(btnReject);
    actions.appendChild(btnAccept);

    div.appendChild(avatar);
    div.appendChild(info);
    div.appendChild(actions);
    return div;
  }

  // ─── Load Calls Tab ───
  function loadCallsTab() {
    if (_callHistoryUnsub) { _callHistoryUnsub(); _callHistoryUnsub = null; }

    _callHistoryUnsub = db.collection(COL.USERS).doc(_uid)
      .collection(COL.CALL_HISTORY)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .onSnapshot(snap => {
        const container = document.getElementById('calls-list');
        const empty = document.getElementById('calls-empty');
        container.innerHTML = '';

        if (snap.empty) {
          empty.classList.remove('hidden');
          return;
        }
        empty.classList.add('hidden');

        snap.docs.forEach(doc => {
          const data = doc.data();
          const el = _buildCallHistoryItem(data);
          container.appendChild(el);
        });
      }, () => {});
  }

  function _buildCallHistoryItem(data) {
    const div = document.createElement('div');
    div.className = 'call-history-item';

    const iconDiv = document.createElement('div');
    const isIncoming = data.wasIncoming;
    const isMissed = data.wasMissed;
    iconDiv.className = `call-type-icon ${isMissed ? 'missed' : isIncoming ? 'incoming' : 'outgoing'}`;

    const isVideo = (data.callType || '').includes('video');
    if (isVideo) {
      iconDiv.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
    } else {
      iconDiv.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.81a19.79 19.79 0 01-3.07-8.72A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>`;
    }

    const info = document.createElement('div');
    info.className = 'list-item-info';

    const name = document.createElement('div');
    name.className = 'list-item-name';
    name.textContent = (data.participantNames || []).join(', ') || 'Unknown';
    if (isMissed) name.style.color = 'var(--red)';

    const sub = document.createElement('div');
    sub.className = 'list-item-subtitle';
    const typeLabel = isVideo ? 'Video' : 'Voice';
    const duration = data.durationSeconds ? formatDuration(data.durationSeconds) : (isMissed ? 'Missed' : '');
    sub.textContent = `${typeLabel} call${duration ? ' · ' + duration : ''}`;

    info.appendChild(name);
    info.appendChild(sub);

    const ts = document.createElement('div');
    ts.className = 'timestamp-text';
    ts.textContent = formatTime(data.timestamp);

    div.appendChild(iconDiv);
    div.appendChild(info);
    div.appendChild(ts);
    return div;
  }

  // ─── Send Friend Request ───
  function sendFriendRequest() {
    const friendId = document.getElementById('input-friend-id').value.trim().toLowerCase();
    const errEl = document.getElementById('add-friend-error');
    const succEl = document.getElementById('add-friend-success');
    showError(errEl, '');
    showSuccess(succEl, '');

    if (!friendId) { showError(errEl, 'Please enter a Friend ID.'); return; }
    if (friendId === App.getCurrentUser()?.friendId) {
      showError(errEl, "That's your own Friend ID.");
      return;
    }

    const btn = document.getElementById('btn-confirm-add-friend');
    btn.textContent = 'Sending...';
    btn.disabled = true;

    db.collection(COL.USERS).where('friendId', '==', friendId).limit(1).get()
      .then(snap => {
        if (snap.empty) {
          showError(errEl, 'No user found with that ID.');
          btn.textContent = 'Send Request';
          btn.disabled = false;
          return;
        }
        const targetDoc = snap.docs[0];
        const targetUid = targetDoc.id;
        const targetData = targetDoc.data();
        const currentUser = App.getCurrentUser();

        return db.collection(COL.USERS).doc(targetUid)
          .collection(COL.FRIEND_REQUESTS).doc(_uid).set({
            requestId: _uid,
            fromUid: _uid,
            fromName: currentUser?.displayName || 'Someone',
            fromFriendId: currentUser?.friendId || '',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          })
          .then(() => {
            showSuccess(succEl, `Request sent to ${targetData.displayName}!`);
            btn.textContent = 'Send Request';
            btn.disabled = false;
            setTimeout(() => hideDialog('dialog-add-friend'), 1500);
          });
      })
      .catch(err => {
        showError(errEl, 'Failed: ' + err.message);
        btn.textContent = 'Send Request';
        btn.disabled = false;
      });
  }

  // ─── Accept Friend Request ───
  function acceptFriendRequest(reqId, req) {
    const currentUser = App.getCurrentUser();
    const batch = db.batch();

    // Remove request
    const reqRef = db.collection(COL.USERS).doc(_uid)
      .collection(COL.FRIEND_REQUESTS).doc(reqId);
    batch.delete(reqRef);

    // Create chat document so they appear in chats
    const chatId = getChatId(_uid, req.fromUid);
    const chatRef = db.collection(COL.CHATS).doc(chatId);
    batch.set(chatRef, {
      participants: [_uid, req.fromUid],
      lastMessage: '',
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      unreadCounts: { [_uid]: 0, [req.fromUid]: 0 }
    }, { merge: true });

    batch.commit().then(() => {
      showToast(`Connected with ${req.fromName}!`);
    }).catch(() => showToast('Failed to accept.'));
  }

  // ─── Reject Friend Request ───
  function rejectFriendRequest(reqId, fromUid) {
    db.collection(COL.USERS).doc(_uid)
      .collection(COL.FRIEND_REQUESTS).doc(reqId)
      .delete()
      .catch(() => {});
  }

  // ─── Create Group ───
  function openCreateGroupDialog() {
    document.getElementById('input-group-name').value = '';
    showError(document.getElementById('create-group-error'), '');

    // Load contacts for checklist
    const listEl = document.getElementById('group-members-list');
    listEl.innerHTML = '';

    if (_contacts.length === 0) {
      listEl.innerHTML = '<div style="padding:12px;color:var(--secondary-text);font-size:14px;text-align:center">Add friends first to create a group</div>';
    } else {
      _contacts.forEach(contact => {
        const item = document.createElement('div');
        item.className = 'member-check-item';
        item.dataset.uid = contact.uid;

        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        setAvatar(avatar, contact.name);

        const name = document.createElement('div');
        name.className = 'member-check-name';
        name.textContent = contact.name;

        const check = document.createElement('div');
        check.className = 'member-check-box';

        item.appendChild(avatar);
        item.appendChild(name);
        item.appendChild(check);

        item.addEventListener('click', () => {
          check.classList.toggle('checked');
        });

        listEl.appendChild(item);
      });
    }

    showDialog('dialog-create-group');
  }

  function createGroup() {
    const groupName = document.getElementById('input-group-name').value.trim();
    const errEl = document.getElementById('create-group-error');
    showError(errEl, '');

    if (!groupName) { showError(errEl, 'Please enter a group name.'); return; }

    const checked = document.querySelectorAll('#group-members-list .member-check-box.checked');
    if (checked.length < 1) { showError(errEl, 'Select at least one member.'); return; }

    const memberUids = [_uid];
    checked.forEach(el => {
      const uid = el.closest('.member-check-item').dataset.uid;
      if (uid) memberUids.push(uid);
    });

    const btn = document.getElementById('btn-confirm-create-group');
    btn.textContent = 'Creating...';
    btn.disabled = true;

    db.collection(COL.GROUPS).add({
      groupName,
      adminUid: _uid,
      memberUids,
      lastMessage: '',
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      unreadCounts: {}
    })
    .then(() => {
      btn.textContent = 'Create';
      btn.disabled = false;
      hideDialog('dialog-create-group');
      showToast(`Group "${groupName}" created!`);
    })
    .catch(err => {
      btn.textContent = 'Create';
      btn.disabled = false;
      showError(errEl, 'Failed: ' + err.message);
    });
  }

  // ─── Cleanup ───
  function cleanup() {
    if (_chatsUnsub) { _chatsUnsub(); _chatsUnsub = null; }
    if (_groupsUnsub) { _groupsUnsub(); _groupsUnsub = null; }
    if (_updatesUnsub) { _updatesUnsub(); _updatesUnsub = null; }
    if (_callHistoryUnsub) { _callHistoryUnsub(); _callHistoryUnsub = null; }
  }

  function getContacts() { return _contacts; }
  function getGroups() { return _groups; }

  return { init, loadChatsTab, loadUpdatesTab, loadCallsTab, cleanup, getContacts, getGroups };
})();
