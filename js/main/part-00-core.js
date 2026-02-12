// Part 00: Core globals, guest mode, anti-repeat, UI helpers
// تنظيف أي إعدادات قديمة متعلقة بالذكاء الاصطناعي (تمت إزالة الميزة نهائياً)
try {
    localStorage.removeItem('ai_api_key');
    localStorage.removeItem('ai_model');
} catch (e) {
    // قد يفشل localStorage في بعض البيئات (وضع التصفح الخاص)، ولا مشكلة.
}




// (moved) authErrorToArabic: required early for redirect/popup error toasts
function authErrorToArabic(err) {
    const code = err && err.code ? String(err.code) : '';
    if (code === 'auth/web-storage-unsupported' || code === 'auth/storage-unavailable') {
        return 'المتصفح يمنع التخزين (Web Storage) لذلك لا يكتمل تسجيل الدخول عبر Google. جرّب متصفح آخر أو عطّل وضع/حماية الخصوصية الصارمة.';
    }
    if (code === 'auth/redirect-cancelled-by-user') {
        return 'تم إلغاء عملية تسجيل الدخول عبر Google.';
    }
    if (code === 'auth/redirect-operation-pending') {
        return 'هناك عملية تسجيل دخول عبر Google قيد التنفيذ. انتظر لحظات ثم أعد المحاولة.';
    }
    if (code === 'auth/unauthorized-domain') {
        return 'هذا النطاق غير مصرح به في Firebase. افتح Firebase Console → Authentication → Settings → Authorized domains وأضف: localhost (وأيضاً 127.0.0.1 إن لزم) ثم أعد المحاولة.';
    }
    if (code === 'auth/operation-not-allowed') {
        return 'طريقة تسجيل الدخول عبر Google غير مفعّلة في Firebase (Authentication → Sign-in method).';
    }
    if (code === 'auth/network-request-failed') {
        return 'فشل الاتصال بالشبكة أثناء تسجيل الدخول. تحقق من الإنترنت ثم أعد المحاولة.';
    }
    if (code === 'auth/invalid-api-key') {
        return 'مفتاح Firebase API غير صحيح في firebaseConfig.';
    }
    if (code === 'auth/invalid-continue-uri' || code === 'auth/invalid-redirect-uri') {
        return 'إعدادات رابط الإرجاع (Redirect) غير صحيحة. تحقق من authDomain و Authorized domains.';
    }
    if (code) {
        return `خطأ Firebase: ${code}`;
    }
    return (err && err.message) ? err.message : 'حدث خطأ غير معروف أثناء تسجيل الدخول عبر Google.';
}

// طابور رسائل (Toast) مبكر: لأن toast يتم تعريفه لاحقاً في الملف.
function queueAuthToast(msg, type = 'error') {
    try {
        if (typeof toast === 'function') {
            toast(msg, type);
            return;
        }
    } catch (_) {}

    try {
        // توافق مع الكود الأصلي: { msg, type }
        window.__pendingAuthToast = { msg, type };
    } catch (_) {
        // ignore
    }
}


// محاولة إكمال نتيجة Google Redirect (لتشخيص/إظهار الأخطاء التي قد تجعل المستخدم يعود بدون تسجيل دخول)
(async () => {
    try {
        const res = await completeGoogleRedirectResult();
        // إن تم الرجوع من Redirect ولم ينتج مستخدم، فهذا غالباً بسبب حظر تخزين المتصفح لتدفق Redirect.
        let pending = false;
        // قد يمنع بعض المتصفحات localStorage بينما يسمح sessionStorage (أو العكس)
        try {
            const s = sessionStorage.getItem('__google_redirect_pending') === '1';
            if (s) pending = true;
            if (s) sessionStorage.removeItem('__google_redirect_pending');
        } catch (_) {}
        try {
            const l = localStorage.getItem('__google_redirect_pending') === '1';
            if (l) pending = true;
            if (l) localStorage.removeItem('__google_redirect_pending');
        } catch (_) {}

        if (pending && (!res || !res.user) && !auth.currentUser) {
            queueAuthToast('تم الرجوع من Google لكن لم يكتمل تسجيل الدخول. غالباً المتصفح يمنع إكمال تدفق Redirect (حظر ملفات تعريف الارتباط/التخزين عبر النطاقات). جرّب متصفح Chrome/Edge أو عطّل الحماية الصارمة/حظر 3rd-party cookies، أو استخدم استضافة تدعم /__/auth/ مثل Firebase Hosting.', 'error');
        }

        // لا حاجة لعمل شيء إضافي عند النجاح: onAuthStateChanged سيتولى التوجيه.
    } catch (e) {
        console.error('Redirect result error:', e);
        queueAuthToast(authErrorToArabic(e), 'error');
        try { sessionStorage.removeItem('__google_redirect_pending'); } catch (_) {}
        try { localStorage.removeItem('__google_redirect_pending'); } catch (_) {}
    }
})();
let currentUser = null;
let effectiveUserId = null;
let userProfile = null;
let dbTopicCounts = {};

// =========================================
// Guest Mode (Browser-only points)
// =========================================
const GUEST_SESSION_KEY = 'hn_guest_session_active_v1';
const GUEST_PROFILE_KEY = 'hn_guest_profile_v1';
const GUEST_MIGRATE_PENDING_KEY = 'hn_guest_migrate_pending_v1';

let isGuest = false;
let guestSaveTimer = null;

// =========================================
// Strict Anti-Repeat (Seen Questions)
// =========================================
// الهدف: منع تكرار أي سؤال في الأوضاع (العشوائي/المخصص) إلا بعد فك الختم
// (بالدفع أو بانقضاء فترة الانتظار). السبب الرئيسي لظهور التكرار سابقاً:
// - الاعتماد على قائمة seenQuestions ضمن البروفايل فقط (تُقص أحياناً/لا تُحفظ عند الانسحاب)
// - إمكانية التحايل عبر إعادة التحميل قبل نهاية الجولة.
//
// الحل: مزج مصدرين للـ seenIds:
// 1) userProfile.seenQuestions (سيرفر/محلي)
// 2) مخزن محلي دائم لكل مستخدم/ضيف داخل المتصفح.
//
// ملاحظة: هذا القسم لا يغيّر منطق اللعبة أو النقاط، فقط يغلق ثغرة تكرار الأسئلة.

const SEEN_LOCAL_PREFIX = 'hn_seen_ids_v2_';
let __seenLocalKey = null;
let __seenLocalSet = new Set();
let __seenLocalSaveTimer = null;

function getSeenLocalKey() {
    const who = isGuestMode() ? 'guest' : (effectiveUserId || 'anon');
    return `${SEEN_LOCAL_PREFIX}${who}`;
}

function loadSeenLocalSet(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return new Set();
        return new Set(arr.map(String));
    } catch (_) {
        return new Set();
    }
}

function saveSeenLocalSet(force = false) {
    try {
        if (!__seenLocalKey) return;
        if (__seenLocalSaveTimer) clearTimeout(__seenLocalSaveTimer);
        const doSave = () => {
            try {
                // احتفاظ محلي كبير لمنع فقدان الذاكرة (بدون الضغط على Firestore)
                const arr = Array.from(__seenLocalSet);
                // سقف محلي احترازي عالي (منع تضخم غير منطقي)
                const MAX_LOCAL = 50000;
                const trimmed = arr.length > MAX_LOCAL ? arr.slice(-MAX_LOCAL) : arr;
                localStorage.setItem(__seenLocalKey, JSON.stringify(trimmed));
            } catch (_) {}
        };
        if (force) doSave();
        else __seenLocalSaveTimer = setTimeout(doSave, 350);
    } catch (_) {}
}

function ensureSeenLocalLoaded() {
    const key = getSeenLocalKey();
    if (key === __seenLocalKey) return;
    __seenLocalKey = key;
    __seenLocalSet = loadSeenLocalSet(key);
}

function hydrateSeenFromLocalIntoProfile() {
    if (!userProfile) return;
    ensureSeenLocalLoaded();
    const p = Array.isArray(userProfile.seenQuestions) ? userProfile.seenQuestions.map(String) : [];
    const merged = new Set([...p, ...__seenLocalSet]);
    userProfile.seenQuestions = Array.from(merged);
    // سقف السيرفر/البروفايل: مرتفع بما يكفي لمنع التكرار، مع حماية حجم الوثيقة
    const MAX_PROFILE = 12000;
    if (userProfile.seenQuestions.length > MAX_PROFILE) {
        userProfile.seenQuestions = userProfile.seenQuestions.slice(-10000);
    }
    // تأكد أن المخزن المحلي يضم كل ما في البروفايل أيضاً
    userProfile.seenQuestions.forEach(id => __seenLocalSet.add(String(id)));
    // كاش سريع لمنع O(n) المتكرر أثناء اللعب
    try { userProfile.__seenQuestionsSet = new Set(userProfile.seenQuestions.map(String)); } catch (_) {}
    saveSeenLocalSet(false);
}

function getCombinedSeenSet() {
    ensureSeenLocalLoaded();
    const p = new Set((userProfile && Array.isArray(userProfile.seenQuestions) ? userProfile.seenQuestions : []).map(String));
    __seenLocalSet.forEach(id => p.add(String(id)));
    return p;
}

function markQuestionAsSeen(questionId) {
    if (!questionId) return;
    ensureSeenLocalLoaded();
    const id = String(questionId);
    if (!__seenLocalSet.has(id)) {
        __seenLocalSet.add(id);
        saveSeenLocalSet(false);
    }
    if (userProfile) {
        if (!Array.isArray(userProfile.seenQuestions)) userProfile.seenQuestions = [];
        // تجنب التكرار داخل المصفوفة (باستخدام Set سريع)
        if (!userProfile.__seenQuestionsSet) {
            try { userProfile.__seenQuestionsSet = new Set(userProfile.seenQuestions.map(String)); } catch (_) { userProfile.__seenQuestionsSet = null; }
        }

        if (!userProfile.__seenQuestionsSet || !userProfile.__seenQuestionsSet.has(id)) {
            userProfile.seenQuestions.push(id);
            try { userProfile.__seenQuestionsSet && userProfile.__seenQuestionsSet.add(id); } catch (_) {}
            // سقف البروفايل فقط (لا يؤثر على المخزن المحلي)
            const MAX_PROFILE = 12000;
            if (userProfile.seenQuestions.length > MAX_PROFILE) {
                userProfile.seenQuestions = userProfile.seenQuestions.slice(-10000);
                try { userProfile.__seenQuestionsSet = new Set(userProfile.seenQuestions.map(String)); } catch (_) {}
            }
        }
        // Guest: حفظ محلي
        if (isGuestMode()) scheduleGuestSave(false);
    }
}

function removeSeenIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    ensureSeenLocalLoaded();
    const setToRemove = new Set(ids.map(String));
    // 1) محلي
    setToRemove.forEach(id => __seenLocalSet.delete(id));
    saveSeenLocalSet(true);
    // 2) بروفايل
    if (userProfile && Array.isArray(userProfile.seenQuestions)) {
        userProfile.seenQuestions = userProfile.seenQuestions.filter(id => !setToRemove.has(String(id)));
        try { userProfile.__seenQuestionsSet = new Set(userProfile.seenQuestions.map(String)); } catch (_) {}
    }
}

function isGuestMode() {
    return isGuest === true;
}

function scheduleGuestSave(force = false) {
    if (!isGuestMode()) return;
    try {
        if (guestSaveTimer) clearTimeout(guestSaveTimer);
        const doSave = () => {
            try { localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(userProfile || {})); } catch (_) {}
        };
        if (force) {
            doSave();
        } else {
            guestSaveTimer = setTimeout(doSave, 400);
        }
    } catch (_) {}
}

function getDefaultGuestProfile() {
    return {
        username: 'ضيف',
        balance: 0,
        highScore: 0,
        createdAt: null,
        avatar: 'account_circle',
        customAvatar: null,
        equippedFrame: 'default',
        badges: ['beginner'],
        favorites: [],
        seenQuestions: [],
        seenMarathonIds: [],
        wrongQuestionsBank: [],
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
        inventory: { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'], frames: ['default'] },

        // 🎁 دورة المكافأة اليومية (Streak Cycle)
        lastDailyRewardDate: '',
        dailyRewardStreakDay: 0
    };
}

function getStoredGuestProfile() {
    try {
        const raw = localStorage.getItem(GUEST_PROFILE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        // إعادة استخدام دالة التنظيف الحالية لضمان عدم وجود حقول ناقصة
        const { cleanData } = sanitizeUserData({ ...getDefaultGuestProfile(), ...parsed });
        return cleanData;
    } catch (_) {
        return null;
    }
}

function setGuestSessionActive(active) {
    try {
        if (active) localStorage.setItem(GUEST_SESSION_KEY, '1');
        else localStorage.removeItem(GUEST_SESSION_KEY);
    } catch (_) {}
}

function clearGuestData() {
    try { localStorage.removeItem(GUEST_SESSION_KEY); } catch (_) {}
    try { localStorage.removeItem(GUEST_PROFILE_KEY); } catch (_) {}
    try { localStorage.removeItem(GUEST_MIGRATE_PENDING_KEY); } catch (_) {}
}

function enterGuestMode({ silent = false } = {}) {
    isGuest = true;
    currentUser = null;
    effectiveUserId = null;
    // حمّل بيانات الضيف (إن وُجدت) وإلا أنشئ افتراضية
    const stored = getStoredGuestProfile();
    userProfile = stored || getDefaultGuestProfile();
    // ✅ دمج ذاكرة الأسئلة المحلية (لمنع تكرار الأسئلة حتى بعد إعادة التحميل)
    try { hydrateSeenFromLocalIntoProfile(); } catch (_) {}
    setGuestSessionActive(true);
    scheduleGuestSave(true);
    // تهيئة الأنظمة التي تعتمد على وجود userProfile
    try {
    bindDailyQuestsDeps({
        db,
        effectiveUserId,
        userProfile,
        toast,
        openBag,
        switchBagTab,
        isGuestMode,
        scheduleGuestSave,
        playSound,
        updateProfileUI,
        launchConfetti,
        addLocalNotification,
        getCurrentWeekKey,
        getCurrentMonthKey
    });
    dq_initDailyQuests();
} catch (_) {}
    try { updateProfileUI(); } catch (_) {}

    hide('auth-loading');
    hide('login-area');
    show('bottom-nav');
    navToHome();

    if (!silent) {
        try {
            if (typeof toast === 'function') toast('تم الدخول كضيف. سيتم حفظ النقاط محلياً فقط.', 'success');
            else queueAuthToast('تم الدخول كضيف. سيتم حفظ النقاط محلياً فقط.', 'success');
        } catch (_) {}
    }
}

function guestSafeToast(msg, type = 'success') {
    try {
        if (typeof toast === 'function') toast(msg, type);
        else queueAuthToast(msg, type);
    } catch (_) {}
}

function mergeGuestIntoRemoteProfile(remote, guest) {
    const r = remote && typeof remote === 'object' ? remote : {};
    const g = guest && typeof guest === 'object' ? guest : {};

    // توحيد/تنظيف
    const { cleanData: rClean } = sanitizeUserData({ ...getDefaultGuestProfile(), ...r });
    const { cleanData: gClean } = sanitizeUserData({ ...getDefaultGuestProfile(), ...g });

    const merged = { ...rClean };

    // 1) الرصيد: إضافة رصيد الضيف إلى رصيد الحساب
    const rBal = Number(rClean.balance ?? rClean.highScore ?? 0) || 0;
    const gBal = Number(gClean.balance ?? gClean.highScore ?? 0) || 0;
    merged.balance = Math.max(0, rBal + gBal);
    merged.highScore = merged.balance;

    // 2) الإحصائيات
    merged.stats = merged.stats || {};
    const rStats = rClean.stats || {};
    const gStats = gClean.stats || {};

    const sumFields = ['quizzesPlayed', 'totalCorrect', 'totalQuestions', 'totalHardQuizzes', 'noHelperQuizzesCount', 'fastAnswerCount'];
    sumFields.forEach(f => {
        merged.stats[f] = (Number(rStats[f]) || 0) + (Number(gStats[f]) || 0);
    });
    merged.stats.bestRoundScore = Math.max(Number(rStats.bestRoundScore) || 0, Number(gStats.bestRoundScore) || 0);
    merged.stats.maxStreak = Math.max(Number(rStats.maxStreak) || 0, Number(gStats.maxStreak) || 0);

    // topicCorrect: جمع حسب القسم
    merged.stats.topicCorrect = { ...(rStats.topicCorrect || {}) };
    Object.entries(gStats.topicCorrect || {}).forEach(([k, v]) => {
        merged.stats.topicCorrect[k] = (Number(merged.stats.topicCorrect[k]) || 0) + (Number(v) || 0);
    });

    // lastPlayedDates: اتحاد + آخر 14 يوم
    const lp = [...(rStats.lastPlayedDates || []), ...(gStats.lastPlayedDates || [])]
        .filter(Boolean);
    merged.stats.lastPlayedDates = [...new Set(lp)].slice(-14);

    // 3) الحقيبة/المخزون: نجمع المقتنيات
    merged.inventory = merged.inventory || { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'], frames: ['default'] };
    const rInv = rClean.inventory || {};
    const gInv = gClean.inventory || {};
    merged.inventory.lives = (Number(rInv.lives) || 0) + (Number(gInv.lives) || 0);
    merged.inventory.helpers = merged.inventory.helpers || { fifty: 0, hint: 0, skip: 0 };
    merged.inventory.helpers.fifty = (Number(rInv.helpers?.fifty) || 0) + (Number(gInv.helpers?.fifty) || 0);
    merged.inventory.helpers.hint  = (Number(rInv.helpers?.hint) || 0) + (Number(gInv.helpers?.hint) || 0);
    merged.inventory.helpers.skip  = (Number(rInv.helpers?.skip) || 0) + (Number(gInv.helpers?.skip) || 0);

    const unionArr = (a, b, limitN = null) => {
        const out = [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
        return limitN ? out.slice(0, limitN) : out;
    };

    merged.inventory.themes = unionArr(rInv.themes, gInv.themes, 50);
    merged.inventory.frames = unionArr(rInv.frames, gInv.frames, 200);
    merged.badges = unionArr(rClean.badges, gClean.badges, 300);

    // 4) المفضلة/بنك الأخطاء/المشاهَدة
    merged.favorites = unionArr(rClean.favorites, gClean.favorites, 300);
    merged.wrongQuestionsBank = unionArr(rClean.wrongQuestionsBank, gClean.wrongQuestionsBank, 30);
    // ✅ رفع السقف لمنع فقدان تقدّم الأسئلة عند الدمج (مع بقاء حماية الحجم)
    merged.seenQuestions = unionArr(rClean.seenQuestions, gClean.seenQuestions, 10000);
    merged.seenMarathonIds = unionArr(rClean.seenMarathonIds, gClean.seenMarathonIds, 3000);

    // 5) الأفاتار والإطار: لا نستبدل ما لدى الحساب إلا إذا كان فارغاً
    if (!merged.customAvatar && gClean.customAvatar) merged.customAvatar = gClean.customAvatar;
    if (!merged.equippedFrame && gClean.equippedFrame) merged.equippedFrame = gClean.equippedFrame;

    // 6) weekly/monthly: إذا نفس المفتاح نجمع، وإلا نحتفظ بما لدى الحساب
    if (rClean.weeklyStats && gClean.weeklyStats && rClean.weeklyStats.key && gClean.weeklyStats.key && rClean.weeklyStats.key === gClean.weeklyStats.key) {
        merged.weeklyStats = { key: rClean.weeklyStats.key, correct: (Number(rClean.weeklyStats.correct) || 0) + (Number(gClean.weeklyStats.correct) || 0) };
    }
    if (!merged.weeklyStats && gClean.weeklyStats) merged.weeklyStats = gClean.weeklyStats;

    if (rClean.monthlyStats && gClean.monthlyStats && rClean.monthlyStats.key && gClean.monthlyStats.key && rClean.monthlyStats.key === gClean.monthlyStats.key) {
        merged.monthlyStats = { key: rClean.monthlyStats.key, correct: (Number(rClean.monthlyStats.correct) || 0) + (Number(gClean.monthlyStats.correct) || 0) };
    }
    if (!merged.monthlyStats && gClean.monthlyStats) merged.monthlyStats = gClean.monthlyStats;

    // 7) username: لا ننقل "ضيف" إلى الحساب
    if (gClean.username && gClean.username !== 'ضيف' && (!merged.username || merged.username === 'مستخدم')) {
        merged.username = gClean.username;
    }

    return merged;
}

async function syncGuestIfPending(user) {
    try {
        const pending = localStorage.getItem(GUEST_MIGRATE_PENDING_KEY) === '1';
        if (!pending || !user) return false;

        const guest = getStoredGuestProfile();
        if (!guest) {
            try { localStorage.removeItem(GUEST_MIGRATE_PENDING_KEY); } catch (_) {}
            return false;
        }

        // تأكد من وجود البروفايل ثم اجلب الحالي وادمج
        await ensureUserProfileExists(user);
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        const remote = snap.exists() ? snap.data() : {};
        const merged = mergeGuestIntoRemoteProfile(remote, guest);

        // تحديث الحقول الأساسية (لا نكتب createdAt إلخ)
        const updatePayload = {
            username: merged.username,
            balance: merged.balance,
            highScore: merged.balance,
            badges: merged.badges,
            favorites: merged.favorites,
            seenQuestions: merged.seenQuestions,
            seenMarathonIds: merged.seenMarathonIds,
            wrongQuestionsBank: merged.wrongQuestionsBank,
            stats: merged.stats,
            inventory: merged.inventory,
            equippedFrame: merged.equippedFrame || 'default',
            customAvatar: merged.customAvatar || null,
            weeklyStats: merged.weeklyStats || deleteField(),
            monthlyStats: merged.monthlyStats || deleteField(),
            migratedFromGuestAt: serverTimestamp()
        };

        await updateDoc(userRef, updatePayload);

        // تنظيف بيانات الضيف بعد نجاح المزامنة
        clearGuestData();
        guestSafeToast('تم ربط الحساب ومزامنة نقاطك بنجاح.', 'success');
        return true;
    } catch (e) {
        console.error('Guest migration failed:', e);
        guestSafeToast('تعذر مزامنة بيانات الضيف. يمكنك المحاولة لاحقاً.', 'error');
        return false;
    } finally {
        try { localStorage.removeItem(GUEST_MIGRATE_PENDING_KEY); } catch (_) {}
    }
}

function showGuestEndRoundPrompt() {
    if (!isGuestMode()) return;
    let modal = document.getElementById('guest-end-round-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'guest-end-round-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box">
            <div class="text-center mb-6">
                <span class="material-symbols-rounded text-amber-400 text-6xl">person_alert</span>
                <h3 class="text-2xl font-bold text-white mt-2 font-heading">قم بالتسجيل حتى لا تفقد نقاطك</h3>
                <p class="text-slate-400 text-sm mt-2">حالياً تُحفظ النقاط داخل هذا المتصفح فقط. عند تغيير الجهاز أو حذف بيانات المتصفح قد تضيع.</p>
            </div>
            <button id="guest-register-now-btn" class="btn-gold-action w-full text-fixed-white">سجل الآن</button>
            <button id="guest-continue-btn" class="w-full mt-3 text-slate-500 hover:text-slate-300 text-sm transition">متابعة كضيف</button>
        </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 50);
    const close = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 220);
    };
    document.getElementById('guest-continue-btn').onclick = close;
    document.getElementById('guest-register-now-btn').onclick = () => {
        close();
        showGuestLinkGoogleModal();
    };
}

function showGuestLinkGoogleModal() {
    if (!isGuestMode()) return;
    let modal = document.getElementById('guest-link-google-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'guest-link-google-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-box">
            <div class="text-center mb-6">
                <span class="material-symbols-rounded text-cyan-400 text-6xl">link</span>
                <h3 class="text-2xl font-bold text-white mt-2 font-heading">ربط الحساب عبر Google</h3>
                <p class="text-slate-400 text-sm mt-2">سيتم إنشاء/تسجيل دخول حساب Google ثم مزامنة نقاطك وبياناتك تلقائياً.</p>
            </div>
            <button id="guest-link-google-btn" class="auth-btn-social w-full">
                <svg class="google-mark" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.73 1.22 9.25 3.62l6.9-6.9C35.97 2.36 30.4 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.05 6.26C12.6 13.06 17.87 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.5 24.5c0-1.58-.14-3.1-.4-4.58H24v8.68h12.65c-.54 2.88-2.16 5.33-4.6 6.97l7.03 5.46C43.7 36.9 46.5 31.3 46.5 24.5z"/>
                    <path fill="#FBBC05" d="M10.61 28.48a14.5 14.5 0 0 1 0-8.96l-8.05-6.26a24 24 0 0 0 0 21.48l8.05-6.26z"/>
                    <path fill="#34A853" d="M24 48c6.4 0 11.77-2.12 15.69-5.77l-7.03-5.46c-1.95 1.31-4.44 2.08-8.66 2.08-6.13 0-11.4-3.56-13.39-8.72l-8.05 6.26C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                <span>متابعة عبر Google</span>
            </button>
            <button id="guest-link-cancel-btn" class="w-full mt-3 text-slate-500 hover:text-slate-300 text-sm transition">إلغاء</button>
        </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 50);
    const close = () => {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 220);
    };
    document.getElementById('guest-link-cancel-btn').onclick = close;
    document.getElementById('guest-link-google-btn').onclick = async () => {
        // ضع علامة حتى يتولى onAuthStateChanged عملية المزامنة بعد تسجيل الدخول
        try { localStorage.setItem(GUEST_MIGRATE_PENDING_KEY, '1'); } catch (_) {}
        scheduleGuestSave(true);

        // إظهار تحميل بسيط
        try {
            const btn = document.getElementById('guest-link-google-btn');
            const original = btn ? btn.innerHTML : '';
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span class="material-symbols-rounded animate-spin">settings</span> جاري فتح Google...';
            }

            try {
                await startGoogleLoginPopup();
            } catch (e) {
                const code = e && e.code ? String(e.code) : '';
                if (code === 'auth/popup-closed-by-user') {
                    guestSafeToast('تم إلغاء تسجيل الدخول عبر Google.', 'error');
                    try { localStorage.removeItem(GUEST_MIGRATE_PENDING_KEY); } catch (_) {}
                    return;
                }
                if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
                    await startGoogleLoginRedirect();
                    return;
                }
                throw e;
            }
        } catch (e) {
            console.error('Guest Google link failed:', e);
            guestSafeToast(authErrorToArabic(e), 'error');
            try { localStorage.removeItem(GUEST_MIGRATE_PENDING_KEY); } catch (_) {}
        } finally {
            close();
        }
    };
}

let quizState = { 
    questions: [], idx: 0, score: 0, correctCount: 0, active: false, 
    lives: 3,
    mode: 'standard',
    history: [], streak: 0, usedHelpers: false, fastAnswers: 0, enrichmentEnabled: true,
    startTime: 0, difficulty: 'موحد', contextTopic: '', typeWriterInterval: null,
    // تتبع الأسئلة التي عُرضت فعلياً خلال الجولة (لمنع تكرارها حتى في حال الانسحاب/إعادة التحميل)
    presentedIds: null
};

let helpers = { fifty: false, hint: false, skip: false };
window.rewardQueue = [];
const ENRICHMENT_FREQUENCY = 0;
let transitionDelay = 2000;
let isMuted = false;
// تم إزالة مؤقت واجهة المسابقة بالكامل (لا يوجد عداد وقت للأسئلة)
let timerInterval = null; // (باقٍ فقط لتجنب أي أخطاء في حال وجود مراجع قديمة)
let audioContext = null; 
let marathonInterval = null;
let currentSelectionMode = null; 

// --- نظام الحظر ---
let banRefreshInProgress = false;

// --- إصلاح تسجيل الدخول مع الحفاظ على قواعد الأمان ---

// (moved) onAuthStateChanged listener -> part-99-init.js

// تم نقل بيانات الإطارات إلى: js/frames.js
// دالة تسجيل حالة التواجد في RTDB (مصححة)
let __presenceUnsub = null;

function setupPresenceSystem() {
    if (!currentUser || !effectiveUserId) return;

    const statusRef = ref(rtdb, `status/${effectiveUserId}`);
    const isOnlineRef = ref(rtdb, '.info/connected');

    try { __presenceUnsub && __presenceUnsub(); } catch (_) {}
    __presenceUnsub = null;

    __presenceUnsub = onValue(isOnlineRef, (snapshot) => {
        if (snapshot.val() === false) return;

        const hideOnline = !!(userProfile && userProfile.privacy && userProfile.privacy.hideOnlineStatus);

        if (hideOnline) {
            try { onDisconnect(statusRef).cancel(); } catch (_) {}
            set(statusRef, {
                state: 'disabled',
                username: userProfile.username
            });
            return;
        }

        onDisconnect(statusRef).set({
            state: 'offline',
            last_changed: rtdbTimestamp(),
            username: userProfile.username
        }).then(() => {
            set(statusRef, {
                state: 'online',
                last_changed: rtdbTimestamp(),
                username: userProfile.username
            });
        });
    });
}


const getEl = (id) => document.getElementById(id);
function bind(id, ev, fn) { const el = getEl(id); if(el) el.addEventListener(ev, fn); }
const show = (id) => getEl(id)?.classList.remove('hidden');
const hide = (id) => getEl(id)?.classList.add('hidden');

const escapeHTML = (str = '') => String(str).replace(/[&<>"'`=\/]/g, (s) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
  '=': '&#61;',
  '/': '&#47;',
}[s]));
const sanitizeImageUrl = (u) => {
  const s = String(u ?? '').trim();
  if (!s) return '';

  // السماح فقط بصور Base64 (بدون SVG) لتجنب أي سلوك غير متوقع
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(s)) return s;

  try {
    const url = new URL(s, location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch (_) {}

  return '';
};
const toast = (msg, type='success') => { const t=getEl('toast-notification'); t.textContent=msg; t.className = type==='error'?'bg-red-900 border-red-500':'bg-green-900 border-green-500'; t.classList.add('show'); t.classList.remove('hidden'); setTimeout(()=>{t.classList.remove('show');t.classList.add('hidden')},5000); };

// تفريغ أي رسالة تم إعدادها قبل تعريف toast
try {
    if (window.__pendingAuthToast && window.__pendingAuthToast.msg) {
        toast(window.__pendingAuthToast.msg, window.__pendingAuthToast.type || 'error');
        window.__pendingAuthToast = null;
    }
} catch (_) {
    // ignore
}

// ==============================
// 🔊 Sound Effects (Local MP3)
// ==============================
// ملاحظة: تم إلغاء جميع أصوات/موسيقى النظام القديمة نهائياً.
// الأنواع هنا مقصودة ومحددة حتى لا تُفعَّل أي أصوات قديمة بالخطأ.
const SFX = {
    result_win: 'sound/Win.mp3',
    round_start: 'sound/Start_playing.mp3',
    result_loss: 'sound/loss.mp3',
    answer_click: 'sound/Start_contest_button.mp3',
    dev_message: 'sound/notifications.mp3'
};

// مفاتيح صوتية بديلة (لتوافق الاستدعاءات القديمة/المختلفة)
const SFX_ALIASES = {
    win: 'result_win',
    applause: 'result_win',
    streak: 'result_win',
    lose: 'result_loss',
    click: 'answer_click',
    hint: 'answer_click',
    monetization_on: 'dev_message'
};


// إعادة استخدام العناصر لتقليل التأخير عند التشغيل
const __sfxCache = new Map();

// مستوى الصوت (0..1) - نستخدم نفس مفتاح "musicVolume" السابق للحفاظ على التوافق
window.__sfxVolume01 = window.__sfxVolume01 ?? 0.30;

function __preloadSfx() {
    try {
        Object.values(SFX).forEach((src) => {
            if (!__sfxCache.has(src)) {
                const a = new Audio(src);
                a.preload = 'auto';
                __sfxCache.set(src, a);
            }
        });
    } catch (_) {}
}

function playSound(type) {
    if (isMuted) return;
    type = (SFX_ALIASES && SFX_ALIASES[type]) ? SFX_ALIASES[type] : type;
    const src = SFX[type];
    if (!src) return;

    try {
        const base = __sfxCache.get(src);
        const audio = base ? base.cloneNode(true) : new Audio(src);
        audio.volume = Math.min(1, Math.max(0, Number(window.__sfxVolume01 ?? 0.30)));
        audio.play().catch(() => {});
    } catch (_) {}
}

// إتاحة الدالة للـ HTML inline handlers + بقية الملفات
window.playSound = playSound;
document.addEventListener('DOMContentLoaded', __preloadSfx);
// (تم نقل منطق واجهة المهام اليومية إلى ملف js/daily_quests.js)
// (تم نقل ربط أزرار المهام اليومية إلى ملف js/daily_quests.js)
// (تم نقل دوال استلام مكافآت المهام اليومية إلى ملف js/daily_quests.js)
function updateEnrichmentUI() {
    const btn = getEl('toggle-enrichment-btn');
    if(quizState.enrichmentEnabled) {
        btn.classList.add('text-amber-400');
        btn.classList.remove('text-slate-500');
        btn.querySelector('span').textContent = 'lightbulb';
    } else {
        btn.classList.remove('text-amber-400');
        btn.classList.add('text-slate-500');
        btn.querySelector('span').textContent = 'lightbulb_outline';
    }
// ✅ تحديث شكل زر المعلومات الإثرائية (شمعة تشتعل/تنطفئ)
const enrichBtn = document.getElementById('toggle-enrichment-btn');
const candleIcon = document.getElementById('enrichment-candle-icon');

if (enrichBtn && candleIcon) {
    // تثبيت الأيقونة
    candleIcon.textContent = 'candle';

    // تنظيف أي تلوين سابق قد يكون على الزر أو الأيقونة
    enrichBtn.classList.remove('text-amber-400', 'text-slate-500');
    candleIcon.classList.remove('text-amber-400', 'text-slate-500', 'text-white');
    candleIcon.style.color = ''; // إزالة أي inline color قديم

    if (quizState.enrichmentEnabled) {
        // ✅ تشغيل: لون واضح + ممتلئة
        enrichBtn.classList.add('text-amber-400');
        candleIcon.classList.add('text-amber-400');
        candleIcon.style.fontVariationSettings = "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24";
    } else {
        // ✅ إطفاء: رمادي + مفرغة
        enrichBtn.classList.add('text-slate-500');
        candleIcon.classList.add('text-slate-500');
        candleIcon.style.fontVariationSettings = "'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24";
    }
}
}
bind('toggle-enrichment-btn', 'click', () => {
    quizState.enrichmentEnabled = !quizState.enrichmentEnabled;
    updateEnrichmentUI();

    if (typeof toast === 'function') {
        toast(quizState.enrichmentEnabled ? 'تم تفعيل المعلومات الإثرائية' : 'تم إيقاف المعلومات الإثرائية');
    }
});

async function handleLogin(){
    const u=getEl('login-username-input').value.trim();
    const p=getEl('login-password-input').value.trim();
    const err=getEl('login-error-message');
    const btn=getEl('login-btn');
    if(!u||!p)return err.textContent="أدخل البيانات";
    const oldHtml=btn.innerHTML;
    btn.disabled=true;
    btn.innerHTML='<span class="material-symbols-rounded animate-spin">settings</span> جاري التحقق...';
    try{
        const q=query(collection(db,"users"),where("username","==",u));
        const snap=await getDocs(q);
        if(snap.empty)throw new Error("مستخدم غير موجود");
        const d=snap.docs[0];
        if(d.data().password===p){
            effectiveUserId=d.id;
            localStorage.setItem('ahlulbaytQuiz_UserId_v2.7',effectiveUserId);
            await loadProfile(effectiveUserId);
            setupPresenceSystem();
            navToHome();
            toast(`أهلاً بك ${u}`);
        }else{
            throw new Error("كلمة المرور خطأ");
        }
    }catch(e){
        err.textContent=e.message||"خطأ اتصال";
        btn.disabled=false;
        btn.innerHTML=oldHtml;
    }
}

async function handleReg() {
    const u = getEl('reg-username-input').value.trim();
    const p = getEl('reg-password-input').value.trim();
    const pc = getEl('reg-confirm-password-input').value.trim();
    const err = getEl('register-error-message');
    if(!u || !p) return err.textContent = "املأ الحقول";
    if(u.length < 3) return err.textContent = "الاسم قصير جداً";
    if(p !== pc) return err.textContent = "كلمة المرور غير متطابقة";
    getEl('register-btn').disabled = true;
    try {
        const q = query(collection(db, "users"), where("username", "==", u));
        const snap = await getDocs(q);
        if(!snap.empty) { err.textContent = "الاسم محجوز"; getEl('register-btn').disabled = false; return; }
        effectiveUserId = currentUser.uid;
        const data = { 
            username: u, password: p, balance: 0, highScore: 0, createdAt: serverTimestamp(), 
            avatar: 'account_circle', customAvatar: null, badges: ['beginner'], favorites: [],
            seenQuestions: [], 
            stats: { quizzesPlayed: 0, totalCorrect: 0, totalQuestions: 0, bestRoundScore: 0, topicCorrect: {}, lastPlayedDates: [], totalHardQuizzes: 0, noHelperQuizzesCount: 0, maxStreak: 0, fastAnswerCount: 0 }, 
            wrongQuestionsBank: []
        };
        await setDoc(doc(db, "users", effectiveUserId), data);
        localStorage.setItem('ahlulbaytQuiz_UserId_v2.7', effectiveUserId);
        await loadProfile(effectiveUserId);
         setupPresenceSystem();
        navToHome();
        toast("تم إنشاء الحساب");
    } catch(e) { console.error(e); err.textContent = "خطأ"; getEl('register-btn').disabled = false; }
}
// ================================
// ✅ عداد المعرفة الحقيقي (من JSON)
// - تحديث عند فتح التطبيق
// - ومرّة واحدة يوميًا فقط
// ================================
const TOPIC_COUNTS_CACHE_KEY = 'hn_topic_counts_cache_v1';
const TOPIC_COUNTS_CACHE_DATE_KEY = 'hn_topic_counts_cache_date_v1';
let __topicCountsPromise = null;

function __todayKey() {
    // نفس الصيغة المستخدمة لديك في نظام المهام اليومية
    return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function __readCountsCache() {
    try {
        const raw = localStorage.getItem(TOPIC_COUNTS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch (_) {
        return null;
    }
}

function __getLastCountsDate() {
    try {
        return localStorage.getItem(TOPIC_COUNTS_CACHE_DATE_KEY) || null;
    } catch (_) {
        return null;
    }
}

function __saveCountsCache(countsObj, dateStr) {
    try {
        localStorage.setItem(TOPIC_COUNTS_CACHE_KEY, JSON.stringify(countsObj || {}));
        localStorage.setItem(TOPIC_COUNTS_CACHE_DATE_KEY, dateStr || __todayKey());
    } catch (_) {}
}

function __isValidQuestionForCount(q) {
    if (!q || typeof q !== 'object') return false;
    if (!q.topic || typeof q.topic !== 'string') return false;
    if (!q.question || typeof q.question !== 'string') return false;
    if (!Array.isArray(q.options) || q.options.length < 2) return false;
    // نقبل correctAnswer كرقم أو كنص رقمي
    const ca = (typeof q.correctAnswer === 'number') ? q.correctAnswer : Number(q.correctAnswer);
    if (!Number.isFinite(ca)) return false;
    return true;
}

async function __computeTopicCountsFromJson() {
    const counts = {};

    // ✅ نجمع الملفات الفعلية المعتمدة من sectionFilesMap
    // ونستثني default لأنه غالبًا ملف جامع/احتياطي وقد يسبب تضخيم الأعداد.
    const fileSet = new Set();
    try {
        Object.entries(sectionFilesMap || {}).forEach(([k, v]) => {
            if (k === 'default') return;
            if (v) fileSet.add(String(v));
        });
    } catch (_) {}

    const files = Array.from(fileSet);

    const fetches = files.map(async (file) => {
        try {
            const res = await fetch(`./Data/Noor/${file}`);
            if (!res.ok) return;
            const data = await res.json();
            if (!Array.isArray(data)) return;

            for (const q of data) {
                if (!__isValidQuestionForCount(q)) continue;
                const topic = String(q.topic).trim();
                if (!topic) continue;
                counts[topic] = (counts[topic] || 0) + 1;
            }
        } catch (_) {
            // ignore file failures
        }
    });

    await Promise.all(fetches);

    // ✅ ضمان وجود مفاتيح لكل المواضيع الموجودة في map حتى لو كانت 0
    try {
        Object.keys(sectionFilesMap || {}).forEach((topicName) => {
            if (topicName === 'default') return;
            if (!(topicName in counts)) counts[topicName] = 0;
        });
    } catch (_) {}

    return counts;
}

function __refreshSelectionModalIfOpen() {
    try {
        const modal = document.getElementById('selection-modal');
        if (!modal) return;
        if (!modal.classList.contains('active')) return;
        if (!userProfile) return;
        if (currentSelectionMode === 'category' || currentSelectionMode === 'topic') {
            openSelectionModal(currentSelectionMode);
        }
    } catch (_) {}
}

async function fetchSystemCounts(force = false) {
    // منع التكرار: إذا يوجد تحميل جارٍ لا نكرر
    if (__topicCountsPromise && !force) return __topicCountsPromise;

    const run = async () => {
        // 1) حمّل الكاش فورًا (حتى تظهر الأرقام بسرعة)
        const cached = __readCountsCache();
        if (cached) dbTopicCounts = cached;

        const today = __todayKey();
        const last = __getLastCountsDate();

        // 2) مرة واحدة فقط يوميًا (أو عند force)
        const shouldRefresh = force || (last !== today);
        if (!shouldRefresh) return;

        // 3) احسب من ملفات JSON
        const computed = await __computeTopicCountsFromJson();
        if (computed && typeof computed === 'object' && Object.keys(computed).length > 0) {
            dbTopicCounts = computed;
            __saveCountsCache(computed, today);
            __refreshSelectionModalIfOpen();
            return;
        }

        // 4) fallback اختياري: Firestore counts (لو فشل JSON)
        try {
            const docRef = doc(db, "system", "counts");
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                dbTopicCounts = snap.data();
                __saveCountsCache(dbTopicCounts, today);
                __refreshSelectionModalIfOpen();
            }
        } catch (_) {
            // ignore
        }
    };

    __topicCountsPromise = run().finally(() => {
        __topicCountsPromise = null;
    });

    return __topicCountsPromise;
}

// ==========================
// ✅ تفعيل الحظر بشكل فعلي
// ==========================
function normalizeMillis(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    // Firestore Timestamp
    if (typeof value === 'object') {
        if (typeof value.toMillis === 'function') return value.toMillis();
        if (typeof value.toDate === 'function') return value.toDate().getTime();
        if (typeof value.seconds === 'number') {
            const ns = typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
            return (value.seconds * 1000) + Math.floor(ns / 1e6);
        }
    }
    return null;
}

function formatDateTimeAr(ms) {
    try {
        return new Date(ms).toLocaleString('ar-IQ', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return '--';
    }
}

function showBanModalUI({ reason, untilMs }) {
    const modal = document.getElementById('ban-modal');
    if (!modal) return;

    // ✅ قفل كامل للتطبيق لمنع أي تجاوز للحظر
    try { document.body.classList.add('ban-locked'); } catch (_) {}

    const reasonEl = document.getElementById('ban-reason-text');
    const untilEl = document.getElementById('ban-until-text');
    const remainingEl = document.getElementById('ban-remaining-text');

    if (reasonEl) reasonEl.textContent = reason || 'غير محدد';

    if (!untilMs) {
        if (untilEl) untilEl.textContent = 'غير محدد';
        if (remainingEl) remainingEl.textContent = 'دائم';
    } else {
        const left = untilMs - Date.now();
        if (untilEl) untilEl.textContent = formatDateTimeAr(untilMs);
        if (remainingEl) {
            if (left <= 0) remainingEl.textContent = '00:00:00:00';
            else {
                const totalSeconds = Math.floor(left / 1000);
                const days = Math.floor(totalSeconds / 86400);
                const hours = Math.floor((totalSeconds % 86400) / 3600);
                const minutes = Math.floor((totalSeconds % 3600) / 60);
                const seconds = totalSeconds % 60;
                const pad = (n) => String(n).padStart(2, '0');
                remainingEl.textContent = `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
            }
        }
    }

    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('active'), 10);
}

function hideBanModalUI() {
    const modal = document.getElementById('ban-modal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => modal.classList.add('hidden'), 200);

    // ✅ فك القفل عند رفع الحظر
    try { document.body.classList.remove('ban-locked'); } catch (_) {}
}

async function enforceBanState(uid) {
    try {
        if (!userProfile || !userProfile.isBanned) {
            hideBanModalUI();
            return false;
        }

        const untilMs = normalizeMillis(userProfile.banUntil);
        const reason = (userProfile.banReason || '').trim();

        // إذا انتهت مدة الحظر، نفكّه تلقائياً
        if (untilMs && Date.now() >= untilMs) {
            userProfile.isBanned = false;
            delete userProfile.banUntil;
            delete userProfile.banReason;

            updateDoc(doc(db, "users", uid), {
                isBanned: false,
                banUntil: deleteField(),
                banReason: deleteField(),
                banStart: deleteField(),
                banDays: deleteField()
            }).catch(() => {});

            hideBanModalUI();
            return false;
        }

        showBanModalUI({ reason: reason || 'غير محدد', untilMs });
        return true;
    } catch (e) {
        console.error('Ban enforce error', e);
        return false;
    }
}
// (تم نقل initDailyQuests و updateQuestProgress إلى ملف js/daily_quests.js)
