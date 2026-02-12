// Bootstrap module: Firebase + app module imports, exposed to global scope for split scripts
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, serverTimestamp, orderBy, limit, arrayUnion, increment, enableIndexedDbPersistence, deleteField } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getDatabase, ref, set, onDisconnect, onValue, serverTimestamp as rtdbTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { topicsData, badgesData, badgesMap, sectionFilesMap } from './data.js';
import { bindDailyQuestsDeps, initDailyQuests as dq_initDailyQuests, updateQuestProgress as dq_updateQuestProgress } from './daily_quests.js';
import { renderAchievementsView } from './achievements.js';
import { initMessaging } from './messaging.js';
import { framesData, getFrameById, getFrameName } from './frames.js';
import { initManualQuestionCountsRefresh } from './refresh_question_counts.js';

// استيراد وظائف المصادقة المخصصة من auth.js (بدون تفرد للاسم)
import {
    initAuthServices,
    startGoogleLoginRedirect,
    startGoogleLoginPopup,
    completeGoogleRedirectResult,
    emailLogin,
    emailRegister,
    ensureUserProfileExists,
    updatePasswordIfEmailAccount,
    updateUsername,
    signOutUser
} from './auth.js';


const firebaseConfig = {
  apiKey: "AIzaSyC6FoHbL8CDTPX1MNaNWyDIA-6xheX0t4s",
  authDomain: "ahl-albayet.firebaseapp.com",
  projectId: "ahl-albayet",
  storageBucket: "ahl-albayet.firebasestorage.app",
  messagingSenderId: "160722124006",
  appId: "1:160722124006:web:1c52066fe8dbbbb8f80f27",
  measurementId: "G-9XJ425S41C"
};

const app = initializeApp(firebaseConfig);
// تأكد من تهيئة خدمات المصادقة/Firestore داخل auth.js بعد إنشاء التطبيق
initAuthServices(app);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app); 


// Expose imported modules/functions to the global scope (used by split non-module parts)
try {
  Object.assign(window, {
    // Firebase (Auth/Firestore/RTDB)
    initializeApp,
    getAuth,
    onAuthStateChanged,
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    query,
    where,
    getDocs,
    serverTimestamp,
    orderBy,
    limit,
    arrayUnion,
    increment,
    deleteField,

    getDatabase,
    ref,
    set,
    onDisconnect,
    onValue,
    rtdbTimestamp,

    // App handles
    auth,
    db,
    rtdb,

    // Data/modules
    topicsData,
    badgesData,
    badgesMap,
    sectionFilesMap,
    framesData,
    getFrameById,
    getFrameName,
    renderAchievementsView,
    initMessaging,
    initManualQuestionCountsRefresh,

    // Daily quests (keep names as used in legacy main.js)
    bindDailyQuestsDeps,
    dq_initDailyQuests,
    dq_updateQuestProgress,

    // Auth services (keep names as used in legacy main.js)
    initAuthServices,
    startGoogleLoginRedirect,
    startGoogleLoginPopup,
    completeGoogleRedirectResult,
    emailLogin,
    emailRegister,
    ensureUserProfileExists,
    updatePasswordIfEmailAccount,
    updateUsername,
    signOutUser
  });
} catch (_) {}

// Offline persistence for Firestore (same logic as before)
enableIndexedDbPersistence(db).catch((err) => {
  if (err && err.code == 'failed-precondition') {
    console.log('Persistence failed: Multiple tabs open');
  } else if (err && err.code == 'unimplemented') {
    console.log('Persistence is not available');
  }
});

// __MAIN_SPLIT_LOADER__ : load split parts after bootstrap completes (strict order)
const __MAIN_PARTS__ = [
  './main/part-00-core.js',
  './main/part-01-profile-and-setup.js',
  './main/part-02-quiz-engine.js',
  './main/part-03-ui-nav-leaderboard.js',
  './main/part-04-reset-admin.js',
  './main/part-05-shop-bag.js',
  './main/part-06-settings-misc.js',
  './main/part-07-truefalse.js',
  './main/part-99-init.js'
];

function __loadClassicScriptPart(relUrl) {
  const src = new URL(relUrl, import.meta.url).href;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    // For dynamically injected scripts, enforce ordered execution
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load: ' + relUrl));
    document.head.appendChild(s);
  });
}

(async () => {
  for (const rel of __MAIN_PARTS__) {
    await __loadClassicScriptPart(rel);
  }
})().catch((e) => {
  console.error('[SplitLoader] Error while loading parts:', e);
});
