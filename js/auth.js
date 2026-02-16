import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  updatePassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// مهم: لا تستدعِ getAuth()/getFirestore() هنا على مستوى الملف.
// لأن ملفات ES Modules تُنفَّذ مباشرة عند الاستيراد، وقد يتم استيراد هذا الملف
// قبل استدعاء initializeApp() في main.js، مما يسبب الخطأ:
// Firebase: No Firebase App '[DEFAULT]' has been created.
let _auth = null;
let _db = null;

// يُفضّل استدعاؤها من main.js بعد initializeApp(firebaseConfig)
export function initAuthServices(app) {
  _auth = getAuth(app);
  _db = getFirestore(app);

  // اجعل التخزين محلياً قدر الإمكان لضمان بقاء الجلسة بعد إعادة التحميل/الـ Redirect.
  // بعض المتصفحات قد تمنع ذلك (خصوصية عالية)، لذا نتجاهل الخطأ.
  try {
    setPersistence(_auth, browserLocalPersistence);
  } catch (_) {
    // ignore
  }
}

function auth() {
  return _auth || getAuth();
}

function db() {
  return _db || getFirestore();
}

// Set up Google provider for redirect sign-in. Prompt to select account for clarity.
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

/**
 * Start Google sign-in using redirect. This will navigate away from the page and
 * return after authentication is complete.
 */
export async function startGoogleLoginRedirect() {
  // علامة لتشخيص حالة الرجوع من Redirect بدون تسجيل دخول
  // نكتب العلامة في sessionStorage + localStorage (بعض البيئات تمنع أحدهما)
  try { sessionStorage.setItem('__google_redirect_pending', '1'); } catch (_) {}
  try { localStorage.setItem('__google_redirect_pending', '1'); } catch (_) {}
  await signInWithRedirect(auth(), provider);
}

/**
 * محاولة تسجيل الدخول عبر Google باستخدام Popup (أفضل على بعض المتصفحات التي تعطل تدفق Redirect).
 */
export async function startGoogleLoginPopup() {
  // Popup لا يستخدم تدفق Redirect، لذلك لا نضع علامة "redirect pending"
  // حتى لا يظهر تنبيه الرجوع من Google في إعادة تحميل لاحقة بشكل خاطئ.
  return await signInWithPopup(auth(), provider);
}

/**
 * إكمال نتيجة الـ Redirect وإرجاع UserCredential أو null.
 * مهم لإظهار الأخطاء التي لا تظهر تلقائياً.
 */
export async function completeGoogleRedirectResult() {
  return await getRedirectResult(auth());
}

/**
 * Ensure that a user profile document exists in Firestore. If not, this function
 * creates one using the provided display name or the user's `displayName` from
 * the authentication provider. The username is not unique; it simply uses the
 * provided name.
 *
 * @param {object} user - The authenticated Firebase user.
 * @param {string} preferredDisplayName - Optional name supplied during registration.
 */
export async function ensureUserProfileExists(user, preferredDisplayName) {
  if (!user) return;
  const userRef = doc(db(), "users", user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    return;
  }
  const displayName = (preferredDisplayName || user.displayName || "مستخدم").trim();
  const newUser = {
    username: displayName,
    balance: 0,
    highScore: 0,
    createdAt: serverTimestamp(),
    avatar: "account_circle",
    customAvatar: null,
    badges: ["beginner"],
    favorites: [],
    seenQuestions: [],
    stats: {
      quizzesPlayed: 0,
      totalCorrect: 0,
      totalQuestions: 0,
      bestRoundScore: 0,
      topicCorrect: {},
      lastPlayedDates: [],
      totalHardQuizzes: 0,
      noHelperQuizzesCount: 0,
      maxStreak: 0,
      fastAnswerCount: 0
    },
    wrongQuestionsBank: []
  };
  await setDoc(userRef, newUser);
}

/**
 * Sign in a user using email and password. After successful sign-in, it ensures
 * that a user profile exists in Firestore.
 *
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {object} The authenticated user.
 */
export async function emailLogin(email, password) {
  const credential = await signInWithEmailAndPassword(auth(), email, password);
  await ensureUserProfileExists(credential.user);
  return credential.user;
}

/**
 * Register a new user using email and password. Optionally sets the user's
 * display name and creates a profile document in Firestore.
 *
 * @param {string} displayName - The preferred display name.
 * @param {string} email - The user's email.
 * @param {string} password - The user's chosen password.
 * @returns {object} The newly created user.
 */
export async function emailRegister(displayName, email, password) {
  const credential = await createUserWithEmailAndPassword(auth(), email, password);
  if (displayName) {
    try {
      await updateProfile(credential.user, { displayName: displayName });
    } catch (_) {
      // Ignore update profile errors silently.
    }
  }
  await ensureUserProfileExists(credential.user, displayName);
  return credential.user;
}

/**
 * Update the username for the given user ID without enforcing uniqueness.
 *
 * @param {string} uid - The user ID.
 * @param {string} newName - The new username to set.
 */
export async function updateUsername(uid, newName) {
  const name = (newName || "").trim();
  if (!name) {
    throw new Error("الاسم لا يمكن أن يكون فارغاً");
  }
  const userRef = doc(db(), "users", uid);
  await updateDoc(userRef, { username: name });
}

/**
 * Update the password of the currently authenticated user. This works for
 * accounts that were created with email and password. If the user has
 * authenticated with a Google account, this operation will still succeed but
 * will not affect the Google password.
 *
 * @param {string} newPassword - The new password to set.
 */
export async function updatePasswordIfEmailAccount(newPassword) {
  const user = auth().currentUser;
  if (!user) {
    throw new Error("لا يوجد مستخدم مسجل");
  }
  await updatePassword(user, newPassword);
}

/**
 * Sign the current user out of Firebase.
 */
export async function signOutUser() {
  await signOut(auth());
}