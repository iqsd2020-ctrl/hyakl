const firebaseConfig = {
  apiKey: "AIzaSyC6FoHbL8CDTPX1MNaNWyDIA-6xheX0t4s",
  authDomain: "ahl-albayet.firebaseapp.com",
  projectId: "ahl-albayet",
  storageBucket: "ahl-albayet.firebasestorage.app",
  messagingSenderId: "160722124006",
  appId: "1:160722124006:web:1c52066fe8dbbbb8f80f27",
  measurementId: "G-9XJ425S41C"
};

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
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load: ' + relUrl));
    document.head.appendChild(s);
  });
}

function __makeOfflineOnlyAction(message = 'تتطلب هذه العملية الاتصال بالإنترنت.') {
  return async () => {
    throw new Error(message);
  };
}

async function __bootstrap() {
  const [dataMod, achievementsMod, framesMod, refreshCountsMod] = await Promise.all([
    import('./data.js'),
    import('./achievements.js'),
    import('./frames.js'),
    import('./refresh_question_counts.js')
  ]);

  let firebaseApi = {
    initializeApp: () => null,
    getAuth: () => null,
    onAuthStateChanged: (_auth, callback) => {
      try { callback(null); } catch (_) {}
      return () => {};
    },
    getFirestore: () => null,
    collection: () => null,
    doc: () => null,
    setDoc: async () => {},
    getDoc: async () => ({ exists: () => false, data: () => null }),
    updateDoc: async () => {},
    query: () => null,
    where: () => null,
    getDocs: async () => ({ empty: true, docs: [] }),
    serverTimestamp: () => new Date(),
    orderBy: () => null,
    limit: () => null,
    arrayUnion: (...items) => items,
    increment: (value) => value,
    deleteField: () => undefined,
    getDatabase: () => null,
    ref: () => null,
    set: async () => {},
    onDisconnect: () => ({ set: async () => {}, cancel: async () => {} }),
    onValue: () => () => {},
    rtdbTimestamp: () => Date.now()
  };

  let authServices = {
    initAuthServices: () => {},
    startGoogleLoginRedirect: __makeOfflineOnlyAction(),
    startGoogleLoginPopup: __makeOfflineOnlyAction(),
    completeGoogleRedirectResult: async () => null,
    emailLogin: __makeOfflineOnlyAction(),
    emailRegister: __makeOfflineOnlyAction(),
    ensureUserProfileExists: async () => {},
    updatePasswordIfEmailAccount: __makeOfflineOnlyAction(),
    updateUsername: __makeOfflineOnlyAction(),
    signOutUser: async () => {}
  };

  let bindDailyQuestsDeps = () => {};
  let dq_initDailyQuests = () => {};
  let dq_updateQuestProgress = () => {};
  let initMessaging = async () => {};
  let initChallengeSystem = () => {};
  let auth = { currentUser: null };
  let db = null;
  let rtdb = null;

  try {
    const [
      appMod,
      authMod,
      firestoreMod,
      rtdbMod,
      dailyQuestsMod,
      messagingMod,
      challengeMod,
      localAuthMod
    ] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js'),
      import('./daily_quests.js'),
      import('./messaging.js'),
      import('./challenge.js'),
      import('./auth.js')
    ]);

    firebaseApi = {
      initializeApp: appMod.initializeApp,
      getAuth: authMod.getAuth,
      onAuthStateChanged: authMod.onAuthStateChanged,
      getFirestore: firestoreMod.getFirestore,
      collection: firestoreMod.collection,
      doc: firestoreMod.doc,
      setDoc: firestoreMod.setDoc,
      getDoc: firestoreMod.getDoc,
      updateDoc: firestoreMod.updateDoc,
      query: firestoreMod.query,
      where: firestoreMod.where,
      getDocs: firestoreMod.getDocs,
      serverTimestamp: firestoreMod.serverTimestamp,
      orderBy: firestoreMod.orderBy,
      limit: firestoreMod.limit,
      arrayUnion: firestoreMod.arrayUnion,
      increment: firestoreMod.increment,
      deleteField: firestoreMod.deleteField,
      getDatabase: rtdbMod.getDatabase,
      ref: rtdbMod.ref,
      set: rtdbMod.set,
      onDisconnect: rtdbMod.onDisconnect,
      onValue: rtdbMod.onValue,
      rtdbTimestamp: rtdbMod.serverTimestamp
    };

    bindDailyQuestsDeps = dailyQuestsMod.bindDailyQuestsDeps;
    dq_initDailyQuests = dailyQuestsMod.initDailyQuests;
    dq_updateQuestProgress = dailyQuestsMod.updateQuestProgress;
    initMessaging = messagingMod.initMessaging;
    initChallengeSystem = challengeMod.initChallengeSystem;

    authServices = {
      initAuthServices: localAuthMod.initAuthServices,
      startGoogleLoginRedirect: localAuthMod.startGoogleLoginRedirect,
      startGoogleLoginPopup: localAuthMod.startGoogleLoginPopup,
      completeGoogleRedirectResult: localAuthMod.completeGoogleRedirectResult,
      emailLogin: localAuthMod.emailLogin,
      emailRegister: localAuthMod.emailRegister,
      ensureUserProfileExists: localAuthMod.ensureUserProfileExists,
      updatePasswordIfEmailAccount: localAuthMod.updatePasswordIfEmailAccount,
      updateUsername: localAuthMod.updateUsername,
      signOutUser: localAuthMod.signOutUser
    };

    const app = firebaseApi.initializeApp(firebaseConfig);
    db = firestoreMod.initializeFirestore(app, { localCache: firestoreMod.persistentLocalCache() });
    authServices.initAuthServices(app);
    auth = firebaseApi.getAuth(app);
    rtdb = firebaseApi.getDatabase(app);
  } catch (e) {
    console.warn('[Bootstrap] Firebase unavailable, starting in guest mode.', e);
  }

  try {
    Object.assign(window, {
      initializeApp: firebaseApi.initializeApp,
      getAuth: firebaseApi.getAuth,
      onAuthStateChanged: firebaseApi.onAuthStateChanged,
      getFirestore: firebaseApi.getFirestore,
      collection: firebaseApi.collection,
      doc: firebaseApi.doc,
      setDoc: firebaseApi.setDoc,
      getDoc: firebaseApi.getDoc,
      updateDoc: firebaseApi.updateDoc,
      query: firebaseApi.query,
      where: firebaseApi.where,
      getDocs: firebaseApi.getDocs,
      serverTimestamp: firebaseApi.serverTimestamp,
      orderBy: firebaseApi.orderBy,
      limit: firebaseApi.limit,
      arrayUnion: firebaseApi.arrayUnion,
      increment: firebaseApi.increment,
      deleteField: firebaseApi.deleteField,
      getDatabase: firebaseApi.getDatabase,
      ref: firebaseApi.ref,
      set: firebaseApi.set,
      onDisconnect: firebaseApi.onDisconnect,
      onValue: firebaseApi.onValue,
      rtdbTimestamp: firebaseApi.rtdbTimestamp,
      auth,
      db,
      rtdb,
      topicsData: dataMod.topicsData,
      badgesData: dataMod.badgesData,
      badgesMap: dataMod.badgesMap,
      sectionFilesMap: dataMod.sectionFilesMap,
      framesData: framesMod.framesData,
      getFrameById: framesMod.getFrameById,
      getFrameName: framesMod.getFrameName,
      renderAchievementsView: achievementsMod.renderAchievementsView,
      initMessaging,
      initManualQuestionCountsRefresh: refreshCountsMod.initManualQuestionCountsRefresh,
      initChallengeSystem,
      bindDailyQuestsDeps,
      dq_initDailyQuests,
      dq_updateQuestProgress,
      initAuthServices: authServices.initAuthServices,
      startGoogleLoginRedirect: authServices.startGoogleLoginRedirect,
      startGoogleLoginPopup: authServices.startGoogleLoginPopup,
      completeGoogleRedirectResult: authServices.completeGoogleRedirectResult,
      emailLogin: authServices.emailLogin,
      emailRegister: authServices.emailRegister,
      ensureUserProfileExists: authServices.ensureUserProfileExists,
      updatePasswordIfEmailAccount: authServices.updatePasswordIfEmailAccount,
      updateUsername: authServices.updateUsername,
      signOutUser: authServices.signOutUser
    });
  } catch (_) {}

  for (const rel of __MAIN_PARTS__) {
    await __loadClassicScriptPart(rel);
  }
}

__bootstrap().catch((e) => {
  console.error('[SplitLoader] Error while loading parts:', e);
});
