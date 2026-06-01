// ═══════════════════════════════════════════════════════════════
// TALKSY — Calls Module (Agora RTC Web SDK v4)
// ═══════════════════════════════════════════════════════════════

const Calls = (() => {
  let _uid = null;
  let _displayName = null;

  // Agora client
  let _agoraClient = null;
  let _localAudioTrack = null;
  let _localVideoTrack = null;

  // Call state
  let _isCallActive = false;
  let _isMicMuted = false;
  let _isCamOff = false;
  let _callType = null;
  let _channelName = null;
  let _callPartnerId = null;
  let _callPartnerName = null;
  let _callDocId = null; // Firestore doc id (partnerUid for 1-on-1)
  let _callStartTime = null;
  let _callTimerInterval = null;

  // Group call state
  let _groupId = null;
  let _groupName = null;
  let _groupCallDocId = null;
  let _participants = {}; // uid -> { name, videoTrack, audioTrack, container }

  // Listeners
  let _incomingCallUnsub = null;

  // ─── Init ───
  function init(uid, displayName) {
    _uid = uid;
    _displayName = displayName;

    _bindCallControls();
    _startIncomingCallListener();
  }

  function _bindCallControls() {
    // 1-on-1 call controls
    document.getElementById('btn-call-end').addEventListener('click', endCall);
    document.getElementById('btn-call-accept').addEventListener('click', acceptCall);
    document.getElementById('btn-call-mic').addEventListener('click', toggleMic);
    document.getElementById('btn-call-cam').addEventListener('click', toggleCam);

    // Group call controls
    document.getElementById('btn-group-end').addEventListener('click', endGroupCall);
    document.getElementById('btn-group-mic').addEventListener('click', toggleGroupMic);
    document.getElementById('btn-group-cam').addEventListener('click', toggleGroupCam);
  }

  // ═══════════════════════════════════════════════════════════════
  // INCOMING CALL LISTENER
  // ═══════════════════════════════════════════════════════════════

  function _startIncomingCallListener() {
    if (_incomingCallUnsub) { _incomingCallUnsub(); }

    _incomingCallUnsub = db.collection(COL.CALLS).doc(_uid)
      .onSnapshot(doc => {
        if (!doc.exists || _isCallActive) return;

        const data = doc.data();
        if (!data || data.status !== CALL_STATUS.RINGING) return;

        const callType = data.callType || CALL_TYPE.AUDIO;
        const callerName = data.callerName || 'Someone';
        const channelName = data.channelName;
        const callerUid = data.callerUid;

        // Show incoming call screen
        _showCallScreen(true, callerName, callType, channelName);
        _callPartnerId = callerUid;
        _callPartnerName = callerName;
        _channelName = channelName;
        _callType = callType;
        _callDocId = _uid; // we are the callee, doc is at our uid
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // OUTGOING CALL (1-on-1)
  // ═══════════════════════════════════════════════════════════════

  function initiateCall(callType, partnerUid, partnerName) {
    if (_isCallActive) return;

    const channelName = generateUUID();

    _callType = callType;
    _callPartnerId = partnerUid;
    _callPartnerName = partnerName;
    _channelName = channelName;
    _callDocId = partnerUid;

    // Write call document to partner
    db.collection(COL.CALLS).doc(partnerUid).set({
      callerUid: _uid,
      callerName: _displayName,
      callType,
      channelName,
      status: CALL_STATUS.RINGING,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
      _showCallScreen(false, partnerName, callType, channelName);
      _startAgoraCall(channelName, callType, false);

      // Listen for status changes (accepted/rejected)
      const unsub = db.collection(COL.CALLS).doc(partnerUid).onSnapshot(doc => {
        if (!doc.exists) {
          // Call was deleted (rejected or ended)
          if (_isCallActive) {
            unsub();
            endCall();
          }
          return;
        }
        const status = doc.data()?.status;
        if (status === CALL_STATUS.ACCEPTED) {
          unsub();
          _onCallAccepted();
        } else if (status === CALL_STATUS.REJECTED) {
          unsub();
          _onCallRejected();
        }
      });
    })
    .catch(() => showToast('Could not start call.'));
  }

  function _onCallAccepted() {
    document.getElementById('call-status').textContent = 'Connected';
    _callStartTime = Date.now();
    _startCallTimer('call-timer');
  }

  function _onCallRejected() {
    showToast('Call declined.');
    endCall();
  }

  function acceptCall() {
    if (!_channelName) return;
    document.getElementById('btn-call-accept').classList.add('hidden');
    document.getElementById('call-status').textContent = 'Connecting...';

    db.collection(COL.CALLS).doc(_uid).update({
      status: CALL_STATUS.ACCEPTED
    }).then(() => {
      _callStartTime = Date.now();
      _startCallTimer('call-timer');
      _startAgoraCall(_channelName, _callType, true);
    });
  }

  function endCall() {
    if (!_isCallActive && !_callDocId && !_channelName) return;
    _isCallActive = false;

    _saveCallHistory();
    _stopCallTimer();

    // Clean up Agora
    _stopLocalTracks();
    if (_agoraClient) {
      _agoraClient.leave().then(() => {
        _agoraClient = null;
      }).catch(() => { _agoraClient = null; });
    }

    // Delete call documents
    if (_callDocId) {
      db.collection(COL.CALLS).doc(_callDocId).delete().catch(() => {});
    }
    // Also delete from our own doc (if we were callee)
    db.collection(COL.CALLS).doc(_uid).delete().catch(() => {});

    _resetCallState();
    showScreen('screen-main');
  }

  // ═══════════════════════════════════════════════════════════════
  // GROUP CALLS
  // ═══════════════════════════════════════════════════════════════

  function initiateGroupCall(callType, groupId, groupName) {
    if (_isCallActive) return;

    _groupId = groupId;
    _groupName = groupName;
    _callType = callType;
    const channelName = generateUUID();
    _channelName = channelName;

    // Get group members
    db.collection(COL.GROUPS).doc(groupId).get().then(doc => {
      if (!doc.exists) return;
      const members = doc.data().memberUids || [];

      // Write group call doc
      db.collection(COL.GROUP_CALLS).doc(groupId).set({
        initiatorUid: _uid,
        initiatorName: _displayName,
        callType,
        channelName,
        participants: [_uid],
        status: CALL_STATUS.RINGING,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Notify each member
      const batch = db.batch();
      members.forEach(memberUid => {
        if (memberUid === _uid) return;
        batch.set(db.collection(COL.CALLS).doc(memberUid), {
          callerUid: _uid,
          callerName: _displayName,
          callType,
          channelName,
          groupId,
          groupName,
          status: CALL_STATUS.RINGING,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      batch.commit();

      _showGroupCallScreen(groupName, callType);
      _startAgoraGroupCall(channelName, callType);
    });
  }

  function endGroupCall() {
    _isCallActive = false;
    _stopCallTimer();
    _stopLocalTracks();

    if (_agoraClient) {
      _agoraClient.leave().then(() => { _agoraClient = null; }).catch(() => { _agoraClient = null; });
    }

    if (_groupId) {
      db.collection(COL.GROUP_CALLS).doc(_groupId).delete().catch(() => {});
    }
    db.collection(COL.CALLS).doc(_uid).delete().catch(() => {});

    _saveGroupCallHistory();
    _resetGroupCallState();
    showScreen('screen-main');
  }

  // ═══════════════════════════════════════════════════════════════
  // AGORA ENGINE
  // ═══════════════════════════════════════════════════════════════

  async function _startAgoraCall(channelName, callType, isCallee) {
    _isCallActive = true;

    try {
      _agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      _agoraClient.on('user-published', async (remoteUser, mediaType) => {
        await _agoraClient.subscribe(remoteUser, mediaType);
        if (mediaType === 'video') {
          _showRemoteVideo(remoteUser.videoTrack);
          document.getElementById('remote-video-placeholder').style.display = 'none';
        }
        if (mediaType === 'audio') {
          remoteUser.audioTrack.play();
        }
      });

      _agoraClient.on('user-unpublished', (remoteUser, mediaType) => {
        if (mediaType === 'video') {
          document.getElementById('remote-video-container').innerHTML = '';
          document.getElementById('remote-video-container').appendChild(
            document.getElementById('remote-video-placeholder')
          );
          document.getElementById('remote-video-placeholder').style.display = 'flex';
        }
      });

      _agoraClient.on('user-left', () => {
        if (_isCallActive) endCall();
      });

      await _agoraClient.join(AGORA_APP_ID, channelName, null, null);

      // Create and publish tracks
      const isVideo = callType === CALL_TYPE.VIDEO;
      if (isVideo) {
        [_localAudioTrack, _localVideoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        _showLocalVideo(_localVideoTrack);
        document.getElementById('local-video-container').classList.remove('hidden');
      } else {
        _localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      }

      const tracksToPublish = [_localAudioTrack];
      if (_localVideoTrack) tracksToPublish.push(_localVideoTrack);
      await _agoraClient.publish(tracksToPublish);

    } catch (err) {
      console.error('Agora error:', err);
      showToast('Could not access camera/microphone.');
      endCall();
    }
  }

  async function _startAgoraGroupCall(channelName, callType) {
    _isCallActive = true;
    _participants = {};

    try {
      _agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

      _agoraClient.on('user-published', async (remoteUser, mediaType) => {
        await _agoraClient.subscribe(remoteUser, mediaType);
        const uidStr = String(remoteUser.uid);

        if (mediaType === 'video') {
          _addParticipantTile(uidStr, remoteUser.videoTrack);
        }
        if (mediaType === 'audio') {
          remoteUser.audioTrack.play();
        }
      });

      _agoraClient.on('user-unpublished', (remoteUser, mediaType) => {
        if (mediaType === 'video') {
          const tile = document.getElementById(`tile-${remoteUser.uid}`);
          if (tile) {
            const vid = tile.querySelector('video');
            if (vid) vid.remove();
            const avatar = tile.querySelector('.participant-tile-avatar');
            if (avatar) avatar.style.display = 'flex';
          }
        }
      });

      _agoraClient.on('user-left', (remoteUser) => {
        _removeParticipantTile(String(remoteUser.uid));
      });

      await _agoraClient.join(AGORA_APP_ID, channelName, null, null);

      const isVideo = callType === CALL_TYPE.GROUP_VIDEO;
      if (isVideo) {
        [_localAudioTrack, _localVideoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        // Local PiP
        const pipEl = document.getElementById('group-local-pip');
        pipEl.classList.remove('hidden');
        const placeholder = document.getElementById('group-local-placeholder');
        const videoEl = _localVideoTrack.play(placeholder);
      } else {
        _localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      }

      const tracksToPublish = [_localAudioTrack];
      if (_localVideoTrack) tracksToPublish.push(_localVideoTrack);
      await _agoraClient.publish(tracksToPublish);

      // Add self tile (audio only)
      if (!isVideo) _addSelfAudioTile();

      _callStartTime = Date.now();
      _startCallTimer('group-call-timer');

    } catch (err) {
      console.error('Agora group error:', err);
      showToast('Could not access camera/microphone.');
      endGroupCall();
    }
  }

  // ─── Video rendering ───
  function _showLocalVideo(track) {
    const container = document.getElementById('local-video-container');
    const placeholder = document.getElementById('local-video-placeholder');
    container.classList.remove('hidden');
    track.play(placeholder);
  }

  function _showRemoteVideo(track) {
    const container = document.getElementById('remote-video-container');
    container.innerHTML = '';
    const videoDiv = document.createElement('div');
    videoDiv.style.cssText = 'width:100%;height:100%;';
    container.appendChild(videoDiv);
    track.play(videoDiv);
  }

  // ─── Participant tiles ───
  function _addParticipantTile(uid, videoTrack) {
    const grid = document.getElementById('participants-grid');

    let tile = document.getElementById(`tile-${uid}`);
    if (!tile) {
      tile = document.createElement('div');
      tile.id = `tile-${uid}`;
      tile.className = 'participant-tile';

      const avatar = document.createElement('div');
      avatar.className = 'participant-tile-avatar';
      setAvatar(avatar, uid.substring(0, 2));
      avatar.style.display = 'none';

      const nameEl = document.createElement('div');
      nameEl.className = 'participant-tile-name';
      nameEl.textContent = uid.substring(0, 8);

      tile.appendChild(avatar);
      tile.appendChild(nameEl);
      grid.appendChild(tile);
      _updateGridLayout();
    }

    if (videoTrack) {
      const videoDiv = document.createElement('div');
      videoDiv.style.cssText = 'width:100%;height:100%;position:absolute;inset:0;';
      tile.insertBefore(videoDiv, tile.firstChild);
      videoTrack.play(videoDiv);
    }

    _updateParticipantCount();
  }

  function _addSelfAudioTile() {
    const grid = document.getElementById('participants-grid');
    const tile = document.createElement('div');
    tile.id = `tile-self`;
    tile.className = 'participant-tile';

    const avatar = document.createElement('div');
    avatar.className = 'participant-tile-avatar';
    setAvatar(avatar, _displayName);

    const nameEl = document.createElement('div');
    nameEl.className = 'participant-tile-name';
    nameEl.textContent = _displayName + ' (you)';

    tile.appendChild(avatar);
    tile.appendChild(nameEl);
    grid.appendChild(tile);
    _updateGridLayout();
    _updateParticipantCount();
  }

  function _removeParticipantTile(uid) {
    const tile = document.getElementById(`tile-${uid}`);
    if (tile) tile.remove();
    _updateGridLayout();
    _updateParticipantCount();
  }

  function _updateGridLayout() {
    const grid = document.getElementById('participants-grid');
    const count = grid.children.length;
    grid.className = 'participants-grid';
    if (count <= 1) grid.classList.add('grid-1');
    else if (count <= 2) grid.classList.add('grid-2');
    else if (count <= 4) grid.classList.add('grid-4');
    else grid.classList.add('grid-many');
  }

  function _updateParticipantCount() {
    const grid = document.getElementById('participants-grid');
    const count = grid.children.length;
    document.getElementById('group-call-count').textContent = `${count} participant${count !== 1 ? 's' : ''}`;
  }

  // ═══════════════════════════════════════════════════════════════
  // CALL SCREENS
  // ═══════════════════════════════════════════════════════════════

  function _showCallScreen(isIncoming, name, callType, channelName) {
    showScreen('screen-call');

    setAvatar(document.getElementById('call-remote-avatar'), name);
    setAvatar(document.getElementById('call-local-avatar'), _displayName);
    document.getElementById('call-remote-name').textContent = name;

    if (isIncoming) {
      document.getElementById('call-status').textContent = `Incoming ${callType.includes('video') ? 'Video' : 'Voice'} Call`;
      document.getElementById('btn-call-accept').classList.remove('hidden');
      document.getElementById('btn-call-accept').className = 'call-btn btn-green';
    } else {
      document.getElementById('call-status').textContent = 'Ringing...';
      document.getElementById('btn-call-accept').classList.add('hidden');
    }

    document.getElementById('call-timer').classList.add('hidden');

    // Hide video containers initially
    document.getElementById('local-video-container').classList.add('hidden');
    document.getElementById('remote-video-placeholder').style.display = 'flex';
  }

  function _showGroupCallScreen(groupName, callType) {
    showScreen('screen-group-call');

    document.getElementById('group-call-title').textContent = groupName;
    document.getElementById('group-call-count').textContent = '1 participant';
    document.getElementById('participants-grid').innerHTML = '';
    document.getElementById('group-call-timer').textContent = '00:00';
    document.getElementById('group-local-pip').classList.add('hidden');

    _addSelfAudioTile();

    setAvatar(document.getElementById('group-local-avatar'), _displayName);
  }

  // ═══════════════════════════════════════════════════════════════
  // MIC / CAM TOGGLES
  // ═══════════════════════════════════════════════════════════════

  function toggleMic() {
    _isMicMuted = !_isMicMuted;
    if (_localAudioTrack) _localAudioTrack.setMuted(_isMicMuted);
    const btn = document.getElementById('btn-call-mic');
    btn.classList.toggle('muted', _isMicMuted);
    if (_isMicMuted) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v4M8 23h8"/><line x1="2" y1="2" x2="22" y2="22" stroke="var(--red)" stroke-width="2"/></svg>`;
    } else {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v4M8 23h8"/></svg>`;
    }
  }

  function toggleCam() {
    _isCamOff = !_isCamOff;
    if (_localVideoTrack) _localVideoTrack.setMuted(_isCamOff);
    const btn = document.getElementById('btn-call-cam');
    btn.classList.toggle('muted', _isCamOff);
  }

  function toggleGroupMic() {
    _isMicMuted = !_isMicMuted;
    if (_localAudioTrack) _localAudioTrack.setMuted(_isMicMuted);
    const btn = document.getElementById('btn-group-mic');
    btn.classList.toggle('muted', _isMicMuted);
  }

  function toggleGroupCam() {
    _isCamOff = !_isCamOff;
    if (_localVideoTrack) _localVideoTrack.setMuted(_isCamOff);
    const btn = document.getElementById('btn-group-cam');
    btn.classList.toggle('muted', _isCamOff);
  }

  // ═══════════════════════════════════════════════════════════════
  // TIMER
  // ═══════════════════════════════════════════════════════════════

  function _startCallTimer(elId) {
    const timerEl = document.getElementById(elId);
    if (!timerEl) return;
    timerEl.classList.remove('hidden');
    _stopCallTimer();
    _callTimerInterval = setInterval(() => {
      if (!_callStartTime) return;
      const secs = Math.floor((Date.now() - _callStartTime) / 1000);
      timerEl.textContent = formatDuration(secs);
    }, 1000);
  }

  function _stopCallTimer() {
    if (_callTimerInterval) { clearInterval(_callTimerInterval); _callTimerInterval = null; }
  }

  // ═══════════════════════════════════════════════════════════════
  // CALL HISTORY
  // ═══════════════════════════════════════════════════════════════

  function _saveCallHistory() {
    if (!_callPartnerId && !_groupId) return;
    const durationSeconds = _callStartTime ? Math.floor((Date.now() - _callStartTime) / 1000) : 0;
    db.collection(COL.USERS).doc(_uid)
      .collection(COL.CALL_HISTORY).add({
        callType: _callType,
        participantNames: [_callPartnerName || _groupName || 'Unknown'],
        channelName: _channelName,
        durationSeconds,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        wasIncoming: !!_callDocId && _callDocId === _uid
      }).catch(() => {});
  }

  function _saveGroupCallHistory() {
    const durationSeconds = _callStartTime ? Math.floor((Date.now() - _callStartTime) / 1000) : 0;
    db.collection(COL.USERS).doc(_uid)
      .collection(COL.CALL_HISTORY).add({
        callType: _callType,
        participantNames: [_groupName || 'Group Call'],
        channelName: _channelName,
        durationSeconds,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        wasIncoming: false
      }).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════

  function _stopLocalTracks() {
    if (_localAudioTrack) {
      _localAudioTrack.close();
      _localAudioTrack = null;
    }
    if (_localVideoTrack) {
      _localVideoTrack.close();
      _localVideoTrack = null;
    }
  }

  function _resetCallState() {
    _isCallActive = false;
    _isMicMuted = false;
    _isCamOff = false;
    _callType = null;
    _channelName = null;
    _callPartnerId = null;
    _callPartnerName = null;
    _callDocId = null;
    _callStartTime = null;
  }

  function _resetGroupCallState() {
    _isCallActive = false;
    _isMicMuted = false;
    _isCamOff = false;
    _groupId = null;
    _groupName = null;
    _channelName = null;
    _callType = null;
    _callStartTime = null;
    _participants = {};
  }

  function cleanup() {
    if (_incomingCallUnsub) { _incomingCallUnsub(); _incomingCallUnsub = null; }
    _stopLocalTracks();
    _stopCallTimer();
    if (_agoraClient) {
      _agoraClient.leave().catch(() => {});
      _agoraClient = null;
    }
  }

  return {
    init,
    initiateCall,
    initiateGroupCall,
    endCall,
    endGroupCall,
    cleanup
  };
})();
