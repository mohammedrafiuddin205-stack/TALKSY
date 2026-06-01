// ═══════════════════════════════════════════════════════════════
// TALKSY — Chat Module
// ═══════════════════════════════════════════════════════════════

const Chat = (() => {
  let _uid = null;
  let _displayName = null;

  // Direct chat state
  let _chatPartnerId = null;
  let _chatPartnerName = null;
  let _chatId = null;
  let _messagesUnsub = null;

  // Group chat state
  let _groupId = null;
  let _groupName = null;
  let _groupMemberCount = 0;
  let _groupMessagesUnsub = null;

  // ─── Init ───
  function init(uid, displayName) {
    _uid = uid;
    _displayName = displayName;

    document.getElementById('chat-back').addEventListener('click', () => {
      closeChat();
      showScreen('screen-main');
    });

    document.getElementById('group-chat-back').addEventListener('click', () => {
      closeGroupChat();
      showScreen('screen-main');
    });

    document.getElementById('btn-send').addEventListener('click', sendMessage);
    document.getElementById('message-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    document.getElementById('btn-group-send').addEventListener('click', sendGroupMessage);
    document.getElementById('group-message-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGroupMessage(); }
    });

    // Voice/video call buttons in chat
    document.getElementById('btn-voice-call').addEventListener('click', () => {
      if (_chatPartnerId) Calls.initiateCall(CALL_TYPE.AUDIO, _chatPartnerId, _chatPartnerName);
    });

    document.getElementById('btn-video-call').addEventListener('click', () => {
      if (_chatPartnerId) Calls.initiateCall(CALL_TYPE.VIDEO, _chatPartnerId, _chatPartnerName);
    });

    document.getElementById('btn-group-voice-call').addEventListener('click', () => {
      if (_groupId) Calls.initiateGroupCall(CALL_TYPE.GROUP_AUDIO, _groupId, _groupName);
    });

    document.getElementById('btn-group-video-call').addEventListener('click', () => {
      if (_groupId) Calls.initiateGroupCall(CALL_TYPE.GROUP_VIDEO, _groupId, _groupName);
    });
  }

  // ─── Open Direct Chat ───
  function openChat(partnerUid, partnerName, chatId) {
    closeChat();
    closeGroupChat();

    _chatPartnerId = partnerUid;
    _chatPartnerName = partnerName;
    _chatId = chatId || getChatId(_uid, partnerUid);

    // Header
    setAvatar(document.getElementById('chat-avatar'), partnerName);
    document.getElementById('chat-name').textContent = partnerName;
    document.getElementById('chat-status').textContent = '';

    // Watch partner online status
    db.collection(COL.USERS).doc(partnerUid).onSnapshot(doc => {
      if (doc.exists) {
        const isOnline = doc.data().isOnline;
        document.getElementById('chat-status').textContent = isOnline ? 'Online' : '';
        document.getElementById('chat-status').style.color = isOnline ? 'var(--green)' : 'var(--secondary-text)';
      }
    });

    document.getElementById('message-input').value = '';
    document.getElementById('messages-list').innerHTML = '';

    showScreen('screen-chat');

    // Attach message listener
    _messagesUnsub = db.collection(COL.CHATS).doc(_chatId)
      .collection(COL.MESSAGES)
      .orderBy('timestamp', 'asc')
      .limit(80)
      .onSnapshot(snap => {
        const container = document.getElementById('messages-list');
        container.innerHTML = '';
        snap.docs.forEach(doc => {
          const msg = doc.data();
          if (msg) container.appendChild(_buildBubble(msg, false));
        });
        scrollToBottom(container);
      });

    // Clear my unread
    db.collection(COL.CHATS).doc(_chatId).update({
      [`unreadCounts.${_uid}`]: 0
    }).catch(() => {});
  }

  // ─── Open Group Chat ───
  function openGroupChat(groupId, groupName, memberCount) {
    closeChat();
    closeGroupChat();

    _groupId = groupId;
    _groupName = groupName;
    _groupMemberCount = memberCount;

    setAvatar(document.getElementById('group-chat-avatar'), groupName, true);
    document.getElementById('group-chat-name').textContent = groupName;
    document.getElementById('group-chat-members').textContent = `${memberCount} members`;
    document.getElementById('group-message-input').value = '';
    document.getElementById('group-messages-list').innerHTML = '';

    showScreen('screen-group-chat');

    _groupMessagesUnsub = db.collection(COL.GROUPS).doc(groupId)
      .collection(COL.MESSAGES)
      .orderBy('timestamp', 'asc')
      .limit(80)
      .onSnapshot(snap => {
        const container = document.getElementById('group-messages-list');
        container.innerHTML = '';
        snap.docs.forEach(doc => {
          const msg = doc.data();
          if (msg) container.appendChild(_buildBubble(msg, true));
        });
        scrollToBottom(container);
      });

    // Clear my unread
    db.collection(COL.GROUPS).doc(groupId).update({
      [`unreadCounts.${_uid}`]: 0
    }).catch(() => {});
  }

  // ─── Build Message Bubble ───
  function _buildBubble(msg, isGroupChat) {
    const isOutgoing = msg.senderId === _uid;
    const row = document.createElement('div');
    row.className = `message-row ${isOutgoing ? 'outgoing' : 'incoming'}`;

    // Sender name for incoming group messages
    if (isGroupChat && !isOutgoing && msg.senderName) {
      const nameEl = document.createElement('div');
      nameEl.className = 'sender-name';
      nameEl.textContent = msg.senderName;
      row.appendChild(nameEl);
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.text || '';

    const time = document.createElement('div');
    time.className = 'bubble-time';
    time.textContent = formatTime(msg.timestamp);

    row.appendChild(bubble);
    row.appendChild(time);
    return row;
  }

  // ─── Send Message ───
  function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !_chatId) return;

    input.value = '';

    const msgData = {
      messageId: generateUUID(),
      senderId: _uid,
      senderName: _displayName,
      text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      isRead: false
    };

    const batch = db.batch();

    // Add message
    const msgRef = db.collection(COL.CHATS).doc(_chatId)
      .collection(COL.MESSAGES).doc(msgData.messageId);
    batch.set(msgRef, msgData);

    // Update chat metadata
    const chatRef = db.collection(COL.CHATS).doc(_chatId);
    batch.set(chatRef, {
      participants: [_uid, _chatPartnerId],
      lastMessage: text,
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
      [`unreadCounts.${_chatPartnerId}`]: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });

    batch.commit().catch(() => showToast('Failed to send.'));
  }

  // ─── Send Group Message ───
  function sendGroupMessage() {
    const input = document.getElementById('group-message-input');
    const text = input.value.trim();
    if (!text || !_groupId) return;

    input.value = '';

    const msgData = {
      messageId: generateUUID(),
      senderId: _uid,
      senderName: _displayName,
      text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      isRead: false
    };

    db.collection(COL.GROUPS).doc(_groupId)
      .collection(COL.MESSAGES).doc(msgData.messageId)
      .set(msgData)
      .catch(() => showToast('Failed to send.'));

    // Update group metadata (increment unread for all other members)
    db.collection(COL.GROUPS).doc(_groupId).get().then(doc => {
      if (!doc.exists) return;
      const members = doc.data().memberUids || [];
      const update = {
        lastMessage: text,
        lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
      };
      members.forEach(m => {
        if (m !== _uid) {
          update[`unreadCounts.${m}`] = firebase.firestore.FieldValue.increment(1);
        }
      });
      db.collection(COL.GROUPS).doc(_groupId).update(update).catch(() => {});
    });
  }

  // ─── Close ───
  function closeChat() {
    if (_messagesUnsub) { _messagesUnsub(); _messagesUnsub = null; }
    _chatPartnerId = null;
    _chatPartnerName = null;
    _chatId = null;
  }

  function closeGroupChat() {
    if (_groupMessagesUnsub) { _groupMessagesUnsub(); _groupMessagesUnsub = null; }
    _groupId = null;
    _groupName = null;
  }

  function cleanup() {
    closeChat();
    closeGroupChat();
  }

  return { init, openChat, openGroupChat, cleanup };
})();
