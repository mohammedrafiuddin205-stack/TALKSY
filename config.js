// ═══════════════════════════════════════════════════════════════
// TALKSY — App Configuration
// ═══════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAISgt8woyC4DrlbH1Y1LLpy1yJnTs5R8I",
  authDomain: "talksy-app-5e3cd.firebaseapp.com",
  databaseURL: "https://talksy-app-5e3cd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "talksy-app-5e3cd",
  storageBucket: "talksy-app-5e3cd.firebasestorage.app",
  messagingSenderId: "337828548462",
  appId: "1:337828548462:android:11516bd9c4bb1b1acd3b7f"
};

const AGORA_APP_ID = "5f091fcf7ce14a8f8f5bc18e4a435657";

const VAPID_PUBLIC_KEY = "BOszWXfHj2c0K10_v3qSB3P4X98nQDEqgDnfzre_3ftO7bBjlUuLUaNOffJBly0vRC9CU_RCN1tetgggUVdHDOs";

// Firestore collection names
const COL = {
  USERS: "users",
  CHATS: "chats",
  GROUPS: "groups",
  CALLS: "calls",
  GROUP_CALLS: "groupCalls",
  MESSAGES: "messages",
  CALL_HISTORY: "callHistory",
  FRIEND_REQUESTS: "friendRequests",
  CONTACTS: "contacts"
};

// Call types
const CALL_TYPE = {
  AUDIO: "audio",
  VIDEO: "video",
  GROUP_AUDIO: "group-audio",
  GROUP_VIDEO: "group-video"
};

// Call statuses
const CALL_STATUS = {
  RINGING: "ringing",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  ENDED: "ended"
};

// Initialize Firebase
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();
const auth = firebase.auth();
const rtdb = firebase.database();

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
