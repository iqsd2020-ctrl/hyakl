async function loadProfile(uid) {
    try {
        // تحميل أعداد الأسئلة الحقيقية بالتوازي مع تحميل البروفايل
        fetchSystemCounts(); 

        const snap = await getDoc(doc(db, "users", uid));
        if(snap.exists()) {
            const rawData = snap.data();
            const { cleanData, wasFixed } = sanitizeUserData(rawData);

            if (wasFixed) {
    console.log("Found corrupted data for user, auto-fixing...");
    await updateDoc(doc(db, "users", uid), cleanData);
    userProfile = cleanData; 
} else {
    userProfile = rawData; 
}

// ✅ توحيد الرصيد: balance هو الاسم الجديد (مع دعم legacy highScore)
        const b = Number(userProfile.balance);
        const hs = Number(userProfile.highScore);
        const mergedBalance = Math.max(Number.isFinite(b) ? b : 0, Number.isFinite(hs) ? hs : 0);
        userProfile.balance = mergedBalance;
        userProfile.highScore = mergedBalance; // legacy sync

        // ✅ دمج ذاكرة الأسئلة المحلية مع البروفايل (صرامة ضد التكرار)
        try { hydrateSeenFromLocalIntoProfile(); } catch (_) {}

        } else {
            userProfile = { 
                username: "ضيف", balance: 0, highScore: 0, badges: ['beginner'], favorites: [], wrongQuestionsBank: [], customAvatar: null,
                seenQuestions: [], stats: { topicCorrect: {}, lastPlayedDates: [], totalHardQuizzes: 0, noHelperQuizzesCount: 0, maxStreak: 0, fastAnswerCount: 0 },
                inventory: { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'] }
            };
        }
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
updateProfileUI();
        // ✅ تهيئة نظام المراسلة (منفصل) + إظهار فقاعة الرسائل الجديدة
        try { await initMessaging({ db, uid, getUsername: () => userProfile?.username, toast }); } catch(e) { console.warn('Messaging init failed', e); }
        // ✅ تطبيق الحظر (يظهر نافذة تمنع الاستخدام إذا كان المستخدم محظوراً)
        await enforceBanState(uid);
    } catch(e) { console.error("Error loading profile:", e); }
}

function getAvatarHTML(imgUrl, frameId, sizeClass = "w-10 h-10") {
    const frameObj = getFrameById(frameId);
    const frameClass = frameObj.cssClass;
    
    let imgContent;
const safeImgUrl = sanitizeImageUrl(imgUrl);

if (safeImgUrl) {
    imgContent = `<img src="${escapeHTML(safeImgUrl)}" class="w-full h-full object-cover rounded-full" referrerpolicy="no-referrer">`;
} else {
    // أيقونة افتراضية
    imgContent = `<div class="w-full h-full rounded-full bg-slate-900 flex items-center justify-center border border-slate-600"><span class="material-symbols-rounded text-slate-200" style="font-size: 1.2em;">account_circle</span></div>`;
}

    return `
        <div class="avatar-wrapper ${sizeClass}">
            ${imgContent}
            <div class="avatar-frame-overlay ${frameClass}"></div>
        </div>
    `;
}

function updateProfileUI() {
    // تحديث الاسم (مع التحقق من وجود العنصر)
    const nameEl = getEl('username-display');
    if (nameEl) nameEl.textContent = userProfile.username;

    // حركة العداد للشريط السفلي
    const scoreEl = getEl('header-score');
    if (scoreEl) {
        const currentDisplayed = parseInt(scoreEl.textContent.replace(/[^\d]/g, '').replace(/[\u0660-\u0669]/g, d => "0123456789"[d.charCodeAt(0) - 1632])) || 0;
        const targetScore = userProfile.balance || 0;
        
        if(currentDisplayed !== targetScore) {
            animateValue(scoreEl, currentDisplayed, targetScore, 2000);
        } else {
            scoreEl.textContent = formatNumberAr(targetScore, true);
        }
    }

    // --- تحديث الأفاتار في الشريط السفلي (مع الإطار) ---
    const btn = getEl('user-profile-btn');
    if (btn) {
        // تنظيف محتوى الزر بالكامل (نحذف الأيقونات القديمة والصور)
        btn.innerHTML = ''; 

        // جلب الإطار الحالي
        const currentFrame = userProfile.equippedFrame || 'default';
        
        // استخدام دالة بناء الإطار (نمرر w-full h-full لملء الزر)
        // ملاحظة: getAvatarHTML موجودة في الكود لديك وتدعم الإطارات
        const avatarHtml = getAvatarHTML(userProfile.customAvatar, currentFrame, "w-full h-full");
        
        // حقن الكود الجديد
        btn.innerHTML = avatarHtml;
    }

    // زر مراجعة الأخطاء في الشاشة الرئيسية
    if(userProfile.wrongQuestionsBank && userProfile.wrongQuestionsBank.length > 0) {
        show('review-mistakes-btn');
        const reviewText = getEl('review-mistakes-text');
        if(reviewText) reviewText.textContent = `مراجعة أخطائي (${userProfile.wrongQuestionsBank.length})`;
    } else {
        hide('review-mistakes-btn');
    }
        // --- تحديث زر المهام اليومية ---
    const questContainer = document.getElementById('daily-quest-container');
    const questBadge = document.getElementById('quest-notification-badge');

    if (questContainer && userProfile.dailyQuests) {
        // إذا لم يتم استلام الجائزة الكبرى، أظهر الزر
        if (!userProfile.dailyQuests.grandPrizeClaimed) {
            questContainer.classList.remove('hidden');
            
            // تحديث الشارة (Badge) بعدد المهام المتبقية
            // نحسب المهام التي لم يكتمل عدادها بعد
            const remainingTasks = userProfile.dailyQuests.tasks.filter(t => t.current < t.target).length;
            
            if (remainingTasks > 0) {
                questBadge.style.display = 'flex';
                questBadge.textContent = remainingTasks;
                questBadge.classList.add('pulse-red'); // وميض
            } else {
                // إذا اكتملت كل المهام ولم تستلم الجائزة الكبرى بعد
                questBadge.style.display = 'flex';
                questBadge.textContent = "🎁";
                questBadge.classList.add('pulse-red');
            }
        } else {
            // إذا استلم الجائزة الكبرى، أخفِ الزر
            questContainer.classList.add('hidden');
        }
    }

    // --- تحديث نظام التقدم والمستويات (بطاقة اللاعب) ---
    try { updatePlayerLevelProgressUI(); } catch (_) {}

    const guestAuthBtnProfile = getEl('guest-auth-btn-profile-card');
    const guestAuthBtnModal = getEl('guest-auth-btn-user-modal');
    const guestAuthBtnLeaderboard = getEl('guest-auth-btn-leaderboard');
    if (typeof isGuestMode === 'function' && isGuestMode()) {
        if (guestAuthBtnProfile) guestAuthBtnProfile.classList.remove('hidden');
        if (guestAuthBtnModal) guestAuthBtnModal.classList.remove('hidden');
        if (guestAuthBtnLeaderboard) guestAuthBtnLeaderboard.classList.remove('hidden');
    } else {
        if (guestAuthBtnProfile) guestAuthBtnProfile.classList.add('hidden');
        if (guestAuthBtnModal) guestAuthBtnModal.classList.add('hidden');
        if (guestAuthBtnLeaderboard) guestAuthBtnLeaderboard.classList.add('hidden');
    }

}


// ============================
// نظام التقدم والمستويات (بطاقة اللاعب)
// يعتمد حصرياً على عدد الإجابات الصحيحة الكلي
// ============================
function computePlayerLevelProgress(totalCorrect) {
    const safeTotal = Math.max(0, Number(totalCorrect) || 0);
    let level = 1;
    let target = 50;
    let inLevel = safeTotal;

    // مستوى 1: 50، مستوى 2: 100، مستوى 3: 200 ... (يتضاعف الهدف)
    while (inLevel >= target) {
        inLevel -= target;
        level += 1;
        target *= 2;

        // حارس أمان (تجنب أي حالة شاذة)
        if (level > 10000) break;
    }

    const remaining = Math.max(0, target - inLevel);
    const percent = (target > 0) ? Math.min(100, Math.floor((inLevel / target) * 100)) : 0;

    return { level, target, current: inLevel, remaining, percent, totalCorrect: safeTotal };
}

function updatePlayerLevelProgressUI() {
    const fillEl = document.getElementById('player-level-progress-fill');
    const txtEl  = document.getElementById('player-level-progress-text');
    const lvlEl  = document.getElementById('player-level-number');

    if (!fillEl && !txtEl && !lvlEl) return;

    const totalCorrect = (userProfile && userProfile.stats) ? userProfile.stats.totalCorrect : 0;
    const p = computePlayerLevelProgress(totalCorrect);

    const fmt = (n) => (typeof formatNumberAr === 'function') ? formatNumberAr(n) : String(n);

    if (lvlEl) lvlEl.textContent = fmt(p.level);
    if (fillEl) fillEl.style.width = `${p.percent}%`;
    if (txtEl) txtEl.textContent = `%${fmt(p.percent)} • المتبقي: ${fmt(p.remaining)}`;
}


window.openGuestAuth = function() {
    try {
        if (typeof isGuestMode === 'function' && !isGuestMode()) return;

        try { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); } catch (_) {}
        try { toggleMenu(false); } catch (_) {}

        try { hide('leaderboard-view'); } catch (_) {}
        try { hide('welcome-area'); } catch (_) {}
        try { hide('bottom-nav'); } catch (_) {}

        try { show('login-area'); } catch (_) {}
        try { show('login-view'); } catch (_) {}
        try { hide('register-view'); } catch (_) {}
        try { hide('auth-loading'); } catch (_) {}
    } catch (_) {}
};

// ✅ إيقاف تأثير الوميض الأحمر (Low Health Vignette) عند الخروج من اللعب
function clearLowHealthVignette() {
    const vignette = getEl('low-health-vignette');
    if (!vignette) return;
    vignette.classList.remove('animate-danger-pulse');
    vignette.style.opacity = "0";
}
function navToHome() {
    if (quizState.typeWriterInterval) {
        clearInterval(quizState.typeWriterInterval);
        quizState.typeWriterInterval = null;
    }

    const savedDelay = localStorage.getItem('transitionDelay');
    if (savedDelay) {
        const delayVal = parseInt(savedDelay);
        transitionDelay = delayVal * 1000;
        getEl('delay-slider').value = delayVal;
        getEl('delay-val').textContent = formatNumberAr(delayVal);
    }
    
    show('bottom-nav');
    
    quizState.active = false;
clearLowHealthVignette();
    
    hide('login-area'); hide('auth-loading'); hide('quiz-proper'); hide('results-area');
    hide('achievements-view'); hide('leaderboard-view');
    show('welcome-area');
    
    fetchSystemCounts();   // ✅ تحديث عدّاد المعرفة (مرة يومياً + عند فتح التطبيق)
    initDropdowns();
    
    // تم حذف مؤقت المسابقة، لذا لا توجد حالة/زر للمؤقت.

    setTimeout(checkWhatsNew, 1500); 
    checkMarathonStatus();
    checkAndShowDailyReward();

    // ✅ تحديث بطاقة (صح/خطأ) في الرئيسية
    try { if (typeof updateTrueFalseCardStats === 'function') updateTrueFalseCardStats(); } catch (_) {}
    try { window.__runAppShortcutOnce && window.__runAppShortcutOnce(); } catch (_) {}
}

window.__runAppShortcutOnce = window.__runAppShortcutOnce || function () {
    try {
        if (sessionStorage.getItem('__pwa_shortcut_done') === '1') return;

        const params = new URLSearchParams(window.location.search || '');
        const sc = params.get('sc');
        if (!sc) return;

        sessionStorage.setItem('__pwa_shortcut_done', '1');

        // تنظيف الرابط بعد قراءة الاختصار (حتى لا يتكرر عند الرجوع للرئيسية)
        try {
            const u = new URL(window.location.href);
            u.searchParams.delete('sc');
            window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
        } catch (_) {}

        const map = {
            start: 'ai-generate-btn',
            marathon: 'btn-marathon-start',
            tf: 'btn-tf-start',
            leaderboard: 'bottom-leaderboard-btn'
        };
        const targetId = map[sc];
        if (!targetId) return;

        // تأخير بسيط لضمان اكتمال ربط الأحداث
        setTimeout(() => {
            try {
                const el = document.getElementById(targetId);
                if (el) el.click();
            } catch (_) {}
        }, 60);
    } catch (_) {}
};

function openSelectionModal(mode) {
    currentSelectionMode = mode;
    const modal = document.getElementById('selection-modal');
    const container = document.getElementById('selection-list-container');
    const title = document.getElementById('selection-title');
    
    container.innerHTML = '';
    modal.classList.add('active');

    if (mode === 'category') {
        title.textContent = 'اختر القسم الرئيسي';
        renderSelectionItem(' عشوائي شامل', 'random', container);
        Object.keys(topicsData).forEach(key => renderSelectionItem(key, key, container));

    } else if (mode === 'topic') {
        title.textContent = 'اختر الموضوع الفرعي';
        const selectedCat = document.getElementById('category-select').value;
        if (!selectedCat || selectedCat === 'random') {
            container.innerHTML = '<p class="text-center text-slate-400 p-4">لا توجد مواضيع فرعية لهذا الاختيار.</p>';
        } else {
            const subs = topicsData[selectedCat];
            if (subs) subs.forEach(sub => renderSelectionItem(sub, sub, container));
        }

    } else if (mode === 'count') {
        title.textContent = 'عدد الأسئلة';
        renderSelectionItem('الملف بالكامل', 'all', container);
[5, 10, 15, 20].forEach(c => renderSelectionItem(`${c} أسئلة`, c, container));

    }
}


function initDropdowns() {
    const btnCat = document.getElementById('btn-category-trigger');
    const btnTop = document.getElementById('btn-topic-trigger');
    const btnCount = document.getElementById('btn-count-trigger');
    
    if(btnCat) btnCat.onclick = async () => {
        await fetchSystemCounts();
        openSelectionModal('category');
    };

    if(btnTop) btnTop.onclick = async () => {
        if (!btnTop.disabled) {
            await fetchSystemCounts();
            openSelectionModal('topic');
        } else {
            toast("يرجى اختيار القسم الرئيسي أولاً", "error");
        }
    };

    if(btnCount) btnCount.onclick = () => openSelectionModal('count');
   
}

function renderSelectionItem(text,value,container){const tpl=document.getElementById('selection-item-template');const clone=tpl.content.cloneNode(true);const div=clone.querySelector('.selection-item');const txtEl=clone.querySelector('.item-text');const verIcon=clone.querySelector('.verified-icon');const progSec=clone.querySelector('.progress-section');const progTxt=clone.querySelector('.progress-text');const progBar=clone.querySelector('.progress-bar');const shine=clone.querySelector('.shine-effect');txtEl.textContent=text;div.onclick=()=>handleSelection(text,value);if(currentSelectionMode==='category'||currentSelectionMode==='topic'){let current=0,max=0;if(currentSelectionMode==='topic'){current=(userProfile.stats&&userProfile.stats.topicCorrect&&userProfile.stats.topicCorrect[text])||0;max=(dbTopicCounts&&dbTopicCounts[text])||0}else if(currentSelectionMode==='category'&&value!=='random'){const sub=topicsData[text]||[];let realTotal=0;sub.forEach(s=>{realTotal+=((dbTopicCounts&&dbTopicCounts[s])||0);current+=((userProfile.stats&&userProfile.stats.topicCorrect&&userProfile.stats.topicCorrect[s])||0)});max=realTotal}if(value!=='random'&&max>0){progSec.classList.remove('hidden');const pct=Math.min(100,Math.floor((current/max)*100));progTxt.textContent=`${formatNumberAr(current)} / ${formatNumberAr(max)}`;progBar.style.width=`${pct}%`;if(pct>=100){progBar.classList.remove('bg-amber-500');progBar.classList.add('bg-green-500','shadow-[0_0_5px_rgba(34,197,94,0.5)]');progTxt.classList.remove('text-amber-500');progTxt.classList.add('text-green-400','font-bold');verIcon.classList.remove('hidden');shine.classList.remove('hidden')}else if(pct<30){progBar.classList.remove('bg-amber-500');progBar.classList.add('bg-slate-600')}}}container.appendChild(clone)}

function handleSelection(text, value) {
    const modal = document.getElementById('selection-modal');
    
    if (currentSelectionMode === 'category') {
        document.getElementById('category-select').value = value;
        document.getElementById('txt-category-display').textContent = text;
        const btnTop = document.getElementById('btn-topic-trigger');
        const txtTop = document.getElementById('txt-topic-display');
        const inputTop = document.getElementById('topic-select');
        inputTop.value = "";
        txtTop.textContent = "-- اختر الموضوع --";
        if (value === 'random') {
            btnTop.disabled = true;
            txtTop.textContent = "غير متاح (شامل)";
            btnTop.style.opacity = "0.5";
        } else {
            btnTop.disabled = false;
            btnTop.style.opacity = "1";
        }

    } else if (currentSelectionMode === 'topic') {
        document.getElementById('topic-select').value = value;
        document.getElementById('txt-topic-display').textContent = text;

    } else if (currentSelectionMode === 'count') {
        document.getElementById('ai-question-count').value = value;
        document.getElementById('txt-count-display').textContent = text;

    }
    modal.classList.remove('active');
}


// استبدل الدالة القديمة بهذه الدالة المحسنة
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // التحقق المبدئي (نقبل حتى 5 ميجا لأننا سنضغطها بشدة)
    if (file.size > 5 * 1024 * 1024) { 
        toast("حجم الصورة الأصلي كبير جداً", "error"); 
        return; 
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // 1. تقليل الأبعاد إلى 110 بكسل (كافية للأفاتار)
            const maxSize = 110; 
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxSize) { height *= maxSize / width; width = maxSize; }
            } else {
                if (height > maxSize) { width *= maxSize / height; height = maxSize; }
            }

            canvas.width = width;
            canvas.height = height;

            // رسم الصورة
            ctx.drawImage(img, 0, 0, width, height);

            // 2. التحويل إلى WebP مع جودة منخفضة (أفضل ضغط ممكن)
            // إذا لم يدعم المتصفح WebP سيعود تلقائياً لـ JPEG
            let dataUrl = canvas.toDataURL('image/webp', 0.3);
            
            // في حالة عدم دعم WebP، نعود لـ JPEG بضغط عالٍ
            if (dataUrl.indexOf('image/webp') === -1) {
                dataUrl = canvas.toDataURL('image/jpeg', 0.3);
            }

            // تحديث الواجهة
            getEl('profile-img-preview').src = dataUrl;
            show('profile-img-preview');
            hide('profile-icon-preview');
            show('delete-custom-avatar');
            
            // حفظ النتيجة المضغوطة جداً
            userProfile.tempCustomAvatar = dataUrl; 
            
            // (اختياري) طباعة الحجم الجديد في الكونسول للتأكد
            console.log(`New size: ${Math.round(dataUrl.length / 1024)} KB`);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}



    // 2. إعداد المتغيرات
    const cat = getEl('category-select').value;
    const countValue = getEl('ai-question-count').value;
const count = countValue === 'all' ? 'all' : parseInt(countValue);
    const topicValue = getEl('topic-select').value;
    let topic = cat === 'random' || !cat ? "عام" : (topicValue || cat);

    quizState.difficulty = 'موحد';
    quizState.mode = 'standard';
    quizState.contextTopic = topic;
    
let sealTimerInterval = null; // متغير عالمي للتحكم في العداد
async function handleSealedTopic(topicName, allTopicQuestions) {
    const modal = document.getElementById('unlock-modal');
    if (!modal) return;

    const timerText = document.getElementById('unlock-timer');
    const payBtn = document.getElementById('btn-pay-unlock');
    
    // إيقاف أي عداد سابق
    if (sealTimerInterval) clearInterval(sealTimerInterval);

    // 1. تحديث نص الزر (السعر 12,000)
    payBtn.innerHTML = `
        <span class="flex items-center gap-2">
            <span class="material-symbols-rounded">key</span> فتح الآن
        </span>
        <span class="bg-black/20 px-3 py-1 rounded text-xs flex items-center gap-1">
            12,000 <span class="material-symbols-rounded text-[10px]">monetization_on</span>
        </span>
    `;

    // إظهار النافذة
    modal.classList.remove('hidden');

    if (!userProfile.sealedTopics) userProfile.sealedTopics = {};
    let sealedTimestamp = userProfile.sealedTopics[topicName];
    const now = Date.now();
    // ✅ مدة الانتظار المجاني: شهر (تقريباً 30 يوم)
    const WAIT_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

    if (!sealedTimestamp) {
        sealedTimestamp = now;
        userProfile.sealedTopics[topicName] = sealedTimestamp;
        if (!isGuestMode() && effectiveUserId) {
            updateDoc(doc(db, "users", effectiveUserId), {
                [`sealedTopics.${topicName}`]: sealedTimestamp
            }).catch(console.error);
        } else {
            scheduleGuestSave();
        }
    }

    // دالة تنسيق الأرقام (تضيف صفر لليسار إذا كان الرقم مفرداً)
    const pad = (num) => num.toString().padStart(2, '0');

    // دالة التحديث المستمر
    const updateCountdown = async () => {
        const currentTime = Date.now();
        const timePassed = currentTime - sealedTimestamp;
        const timeLeft = WAIT_PERIOD_MS - timePassed;

        if (timeLeft <= 0) {
            clearInterval(sealTimerInterval);
            timerText.textContent = "00:00:00:00";
            await unlockTopicLogic(topicName, allTopicQuestions, 0); 
            modal.classList.remove('active');
            setTimeout(() => modal.classList.add('hidden'), 300);
            return;
        }

        const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

        // ✅ عرض الوقت بالأرقام الإنجليزية (0-9)
        timerText.textContent = `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        timerText.style.direction = "ltr"; 
    };

    updateCountdown();
    sealTimerInterval = setInterval(updateCountdown, 1000);

    // زر الدفع (التكلفة 12,000)
    payBtn.onclick = () => {
        if (Number(userProfile.balance ?? userProfile.highScore ?? 0) >= 12000) {
            modal.classList.remove('active');
            setTimeout(() => modal.classList.add('hidden'), 300);
            clearInterval(sealTimerInterval);

            window.showConfirm(
                "فك الختم",
                "هل تريد دفع 12,000 نقطة لإعادة فتح هذا الملف الآن؟",
                "lock_open",
                async () => {
                    await unlockTopicLogic(topicName, allTopicQuestions, 12000);
                }
            );
        } else {
            toast("رصيدك غير كافٍ (تحتاج 12,000 نقطة)", "error");
            if(window.playSound) window.playSound('lose');
        }
    };

    const closeBtn = modal.querySelectorAll('button')[1]; 
    if (closeBtn) {
        closeBtn.onclick = () => {
            clearInterval(sealTimerInterval);
            modal.classList.remove('active');
            setTimeout(() => modal.classList.add('hidden'), 300);
        };
    }

    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
    
    if(window.playSound) window.playSound('hint');
}

async function unlockTopicLogic(topicName, allTopicQuestions, cost) {
    const prevBalance = Number(userProfile.balance ?? userProfile.highScore ?? 0);

    // 1. الخصم
    if (cost > 0) {
        userProfile.balance = Math.max(0, prevBalance - cost);
        userProfile.highScore = userProfile.balance; // legacy sync
    }

    // 2. تصفير الذاكرة لهذا الموضوع فقط
    const topicIds = (Array.isArray(allTopicQuestions) ? allTopicQuestions : [])
        .map(q => q && q.id)
        .filter(Boolean)
        .map(String);
    // ✅ نحتفظ فقط بالأسئلة التي لا تنتمي لهذا الموضوع (سيرفر + محلي)
    removeSeenIds(topicIds);
    
    // إزالة تاريخ الختم محلياً
    if (userProfile.sealedTopics) {
        delete userProfile.sealedTopics[topicName];
    }

    // 3. الحفظ في السيرفر
    if (isGuestMode()) {
        updateProfileUI();
        scheduleGuestSave(true);

        if (cost > 0) {
            toast(`🔓 تم فتح "${topicName}" بنجاح!`, "success");
            if(window.playSound) window.playSound('win');
        } else {
            toast(`⏳ انتهت فترة الانتظار! تم فتح "${topicName}" مجاناً.`, "success");
        }

        document.getElementById('ai-generate-btn').click();
        return;
    }

    try {
        await updateDoc(doc(db, "users", effectiveUserId), {
            balance: userProfile.balance,
            highScore: userProfile.balance,
            seenQuestions: userProfile.seenQuestions,
            [`sealedTopics.${topicName}`]: deleteField() // حذف حقل التاريخ من السيرفر
        });

        updateProfileUI(); // تحديث الرصيد في الواجهة

        if (cost > 0) {
            toast(`🔓 تم فتح "${topicName}" بنجاح!`, "success");
            if(window.playSound) window.playSound('win');
            // تشغيل اللعبة مباشرة
            document.getElementById('ai-generate-btn').click(); 
        } else {
            toast(`⏳ انتهت فترة الانتظار! تم فتح "${topicName}" مجاناً.`, "success");
            document.getElementById('ai-generate-btn').click();
        }

    } catch (e) {
        console.error(e);
        toast("حدث خطأ أثناء الفتح", "error");
        // تراجع في حالة الخطأ
        if (cost > 0) {
            userProfile.balance = prevBalance;
            userProfile.highScore = prevBalance;
        }
}
}

bind('ai-generate-btn', 'click', async () => {
    const cat = getEl('category-select').value;
    const countValue = getEl('ai-question-count').value;
const count = countValue === 'all' ? 'all' : parseInt(countValue);
    const topicValue = getEl('topic-select').value;
    let topic = cat === 'random' || !cat ? "عام" : (topicValue || cat);
    quizState.difficulty = 'موحد';
    quizState.mode = 'standard';
    quizState.contextTopic = topic;
    const btn = getEl('ai-generate-btn');
    const originalBtnText = `<span class="text-lg">ابدأ التحدي</span> <span class="material-symbols-rounded">menu_book</span>`;
    const resetButton = () => {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
    };
    btn.disabled = true;
    if (navigator.onLine) {
        btn.innerHTML = `<span class="material-symbols-rounded animate-spin">autorenew</span> تجهيز...`;
    } else {
        btn.innerHTML = `<span class="material-symbols-rounded animate-spin">wifi_off</span> جاري البحث محلياً...`;
    }
    try {
        let allAvailableQuestions = [];
        if (cat === 'random' || !cat || topic === 'random') {
            const mainFiles = [
                "infallibles_all.json", "prophets.json", "personalities.json",
                "quran_nahj.json", "aqida_fiqh.json", "mahdi_culture.json",
                "history_battles.json", "dua_ziyarat.json"
            ];
            const fetchPromises = mainFiles.map(file => 
                fetch(`./Data/Noor/${file}`).then(res => res.ok ? res.json() : []).catch(() => [])
            );
            const results = await Promise.all(fetchPromises);
            allAvailableQuestions = results.flat();
            if (allAvailableQuestions.length === 0) {
                const backupRes = await fetch(`./Data/Noor/dataNooR.json`);
                if (backupRes.ok) allAvailableQuestions = await backupRes.json();
            }
        } else if (quizState.mode === 'marathon') {
            const response = await fetch(`./Data/Noor/dataNooR.json`);
            if (response.ok) allAvailableQuestions = await response.json();
        } else {
            const fileName = sectionFilesMap[topic] || sectionFilesMap['default'];
            const response = await fetch(`./Data/Noor/${fileName}`);
            if (response.ok) {
                const allQuestionsInFile = await response.json();
                allAvailableQuestions = allQuestionsInFile.filter(q => q.topic === topic);
            }
        }
        if (allAvailableQuestions.length === 0) {
            toast("عذراً، لا توجد أسئلة متاحة لهذا الموضوع حالياً.", "error");
            resetButton();
            return;
        }
        allAvailableQuestions = allAvailableQuestions.map(q => {
            if (!q.id) {
                let hash = 0;
                const str = q.question || "unknown";
                for (let i = 0; i < str.length; i++) {
                    hash = ((hash << 5) - hash) + str.charCodeAt(i);
                    hash |= 0;
                }
                q.id = `gen_id_${Math.abs(hash)}`;
            }
            q.id = String(q.id);
            return q;
        });

        // ✅ إزالة أي تكرار داخل البيانات نفسها (نفس id)
        try {
            const uniq = new Map();
            allAvailableQuestions.forEach(q => {
                const id = q && q.id ? String(q.id) : null;
                if (!id) return;
                if (!uniq.has(id)) uniq.set(id, q);
            });
            allAvailableQuestions = Array.from(uniq.values());
        } catch (_) {}

        // ✅ فلترة صارمة ضد التكرار: ندمج seenQuestions (سيرفر) + مخزن محلي
        const seenSet = getCombinedSeenSet();
        let freshQuestions = allAvailableQuestions.filter(q => q && q.id && !seenSet.has(String(q.id)));
        if (freshQuestions.length === 0) {
            toast("هذا الملف مختوم حاول مع موضوع اخر", "warning");
            resetButton();
            handleSealedTopic(topic, allAvailableQuestions);
            return;
        }
        shuffleArray(freshQuestions);
        if (count === 'all') {
    quizState.questions = freshQuestions;
} else if (freshQuestions.length >= count) {
    quizState.questions = freshQuestions.slice(0, count);
} else {
    quizState.questions = freshQuestions;
    toast(`تبقى لديك ${freshQuestions.length} أسئلة جديدة فقط في هذا القسم!`, "info");
}
        if (quizState.questions.length === 0) {
            toast("حدث خطأ غير متوقع في تجهيز الأسئلة.", "error");
            resetButton();
            return;
        }
        if (navigator.onLine && cat === 'random') {
            toast("✅ تم تحديث البيانات للعمل بدون إنترنت", "success");
        }
        resetButton();
        startQuiz();
    } catch (e) {
        console.error(e);
        if (e.message !== "No questions") {
            const errMsg = navigator.onLine ? "حدث خطأ في تحميل الأسئلة" : "أنت غير متصل ولا توجد أسئلة محفوظة";
            toast(errMsg, "error");
        }
        resetButton();
    }
});


bind('review-mistakes-btn', 'click', () => {
    if(userProfile.wrongQuestionsBank.length === 0) return;
    quizState.contextTopic = "مراجعة الأخطاء";
    quizState.mode = 'standard';
    quizState.difficulty = "موحد"; 
    const qs = [...userProfile.wrongQuestionsBank];
    shuffleArray(qs);
    quizState.questions = qs.slice(0, 20);
    startQuiz();
});

bind('quit-quiz-btn', 'click', () => {
    window.showConfirm(
        "مغادرة المسابقة",
        "هل تريد الانسحاب؟ سيتم احتساب النقاط والإجابات الصحيحة الحالية.",
        "save_as",
        async () => {
            // Guest Mode: حفظ محلي فقط (بدون Firestore)
            if (isGuestMode()) {
                const safeCorrect = Number(quizState.correctCount) || 0;
                const safePassed = Number(quizState.idx) || 0;
                const currentTopic = quizState.contextTopic;

                // حفظ النقاط محلياً
                userProfile.balance = (Number(userProfile.balance ?? userProfile.highScore ?? 0)) + (Number(quizState.score) || 0);
                userProfile.highScore = userProfile.balance;

                userProfile.stats = userProfile.stats || {};
                userProfile.stats.quizzesPlayed = (Number(userProfile.stats.quizzesPlayed) || 0) + 1;
                userProfile.stats.totalCorrect = (Number(userProfile.stats.totalCorrect) || 0) + safeCorrect;
                userProfile.stats.totalQuestions = (Number(userProfile.stats.totalQuestions) || 0) + safePassed;
                userProfile.stats.topicCorrect = userProfile.stats.topicCorrect || {};
                if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
                    userProfile.stats.topicCorrect[currentTopic] = (Number(userProfile.stats.topicCorrect[currentTopic]) || 0) + safeCorrect;
                }

                // تحديث الأسبوع/الشهر بشكل بسيط
                try {
                    const wKey = getCurrentWeekKey();
                    let newWeekly = userProfile.weeklyStats || { key: wKey, correct: 0 };
                    if (newWeekly.key !== wKey) newWeekly = { key: wKey, correct: 0 };
                    newWeekly.correct += safeCorrect;
                    userProfile.weeklyStats = newWeekly;

                    const mKey = getCurrentMonthKey();
                    let newMonthly = userProfile.monthlyStats || { key: mKey, correct: 0 };
                    if (newMonthly.key !== mKey) newMonthly = { key: mKey, correct: 0 };
                    newMonthly.correct += safeCorrect;
                    userProfile.monthlyStats = newMonthly;
                } catch (_) {}

                updateProfileUI();
                scheduleGuestSave(true);
                toast(`تم حفظ التقدم محلياً: ${quizState.score} نقطة و ${safeCorrect} إجابة صحيحة`, "success");
                navToHome();
                return;
            }

            // التحقق من وجود تقدم يستحق الحفظ
            if (quizState.score > 0 || quizState.correctCount > 0) {
                try {
                    const userRef = doc(db, "users", effectiveUserId);
                    const currentTopic = quizState.contextTopic;
                    const safeCorrect = quizState.correctCount || 0;
                    
                    // 1. تجهيز تحديثات السيرفر
                    const updates = {
                        balance: increment(quizState.score),
                        highScore: increment(quizState.score),
                        "stats.quizzesPlayed": increment(1),
                        "stats.totalCorrect": increment(safeCorrect), // ✅ حفظ عدد الإجابات الصحيحة
                        "stats.totalQuestions": increment(quizState.idx) // ✅ حفظ عدد الأسئلة التي مرت
                    };

                    // ✅ حفظ ذاكرة الأسئلة التي عُرضت فعلياً (لتفادي التكرار حتى مع الانسحاب)
                    try {
                        const batchSeen = (quizState.presentedIds && quizState.presentedIds.size) ? Array.from(quizState.presentedIds).map(String) : [];
                        if (batchSeen.length > 0) {
                            batchSeen.forEach(id => markQuestionAsSeen(id));
                            // نكتب المصفوفة الكاملة (المكبوسة) بدلاً من arrayUnion لتجنب تضخم الوثيقة
                            updates.seenQuestions = Array.isArray(userProfile.seenQuestions) ? userProfile.seenQuestions : [];
                        }
                    } catch (_) {}

                    // 2. حفظ إحصائيات الموضوع (إذا لم يكن عاماً)
                    if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
                        // استخدام increment لزيادة رصيد الموضوع المحدد
                        updates[`stats.topicCorrect.${currentTopic}`] = increment(safeCorrect);
                    }

                    // 3. تحديث الإحصائيات الأسبوعية (للوحة الشرف)
                    const wKey = getCurrentWeekKey();
                    let newWeekly = userProfile.weeklyStats || { key: wKey, correct: 0 };
                    // إذا بدأ أسبوع جديد، نصفر العداد
                    if (newWeekly.key !== wKey) newWeekly = { key: wKey, correct: 0 };
                    newWeekly.correct += safeCorrect;
                    updates.weeklyStats = newWeekly;

                    // 4. تحديث الإحصائيات الشهرية
                    const mKey = getCurrentMonthKey();
                    let newMonthly = userProfile.monthlyStats || { key: mKey, correct: 0 };
                    if (newMonthly.key !== mKey) newMonthly = { key: mKey, correct: 0 };
                    newMonthly.correct += safeCorrect;
                    updates.monthlyStats = newMonthly;

                    // تنفيذ التحديث في السيرفر
                    await updateDoc(userRef, updates);

                    // 5. تحديث الملف الشخصي المحلي فوراً (لعدم الحاجة لإعادة التحميل)
                    userProfile.balance = (Number(userProfile.balance ?? userProfile.highScore ?? 0)) + quizState.score;
                    userProfile.highScore = userProfile.balance;
                    if(userProfile.stats) {
                        userProfile.stats.totalCorrect = (userProfile.stats.totalCorrect || 0) + safeCorrect;
                        userProfile.stats.totalQuestions = (userProfile.stats.totalQuestions || 0) + quizState.idx;
                        if (currentTopic && currentTopic !== 'عام') {
                            userProfile.stats.topicCorrect[currentTopic] = (userProfile.stats.topicCorrect[currentTopic] || 0) + safeCorrect;
                        }
                    }
                    userProfile.weeklyStats = newWeekly;
                    userProfile.monthlyStats = newMonthly;

                    toast(`تم حفظ التقدم: ${quizState.score} نقطة و ${safeCorrect} إجابة صحيحة`, "success");
                } catch (e) {
                    console.error("Error saving partial score:", e);
                }
            }
            navToHome();
        }
    );
});

// (تم حذف زر/منطق مؤقت المسابقة بالكامل)

function renderLives() {
    const el = getEl('lives-display');
    
    // رسم القلوب
    el.innerHTML = `
        <div class="flex items-center gap-2 transition-all duration-300">
            <div class="glass-tube-container w-8 h-3 border border-white/10 ${quizState.lives <= 1 ? 'animate-pulse' : ''}">
                <div id="lives-tube-fill" class="liquid-fill"></div>
            </div>
            <span class="text-slate-200 font-bold text-xs font-heading pt-0.5" dir="ltr">${formatNumberAr(quizState.lives)}</span>
        </div>
    `;

    const fill = getEl('lives-tube-fill');
    if (fill) {
        const max = Math.max(1, Number(quizState.maxLives || 3));
        const cur = Math.max(0, Number(quizState.lives || 0));
        const ratio = Math.max(0, Math.min(1, cur / max));
        const pct = Math.round(ratio * 100);

        fill.style.width = `${pct}%`;

        // أخضر (ممتلئ) -> أحمر (فارغ)
        const green = [16, 185, 129]; // #10b981
        const red   = [239, 68, 68];  // #ef4444
        const t = 1 - ratio;

        const lerp = (a, b, x) => Math.round(a + (b - a) * x);

        const r = lerp(green[0], red[0], t);
        const g = lerp(green[1], red[1], t);
        const b = lerp(green[2], red[2], t);

        const base = `rgb(${r}, ${g}, ${b})`;
        const dark = `rgb(${Math.round(r * 0.55)}, ${Math.round(g * 0.55)}, ${Math.round(b * 0.55)})`;

        fill.style.background = `linear-gradient(90deg, ${base}, ${dark})`;
        fill.style.color = base;
    }

    // --- منطق نبض الخطر (Red Vignette) ---
    const vignette = getEl('low-health-vignette');
    if (vignette) {
        if (quizState.active && quizState.lives === 1) {
            // حالة الخطر: قلب واحد متبقي
            vignette.classList.add('animate-danger-pulse');
            vignette.style.opacity = "1"; // تأكيد الظهور
        } else {
            // حالة الأمان: إخفاء التأثير
            vignette.classList.remove('animate-danger-pulse');
            vignette.style.opacity = "0";
        }
    }
}


async function startMarathon() {
    const btn = getEl('btn-marathon-confirm');
    
    if (userProfile.lastMarathonDate) {
        const lastPlayed = userProfile.lastMarathonDate.toMillis ? userProfile.lastMarathonDate.toMillis() : new Date(userProfile.lastMarathonDate).getTime();
        const now = Date.now();
        const diff = now - lastPlayed;
        const twentyFourHours = 24 * 60 * 60 * 1000;
        
        if (diff < twentyFourHours) {
            toast(" لا يمكنك لعب النور إلا مرة واحدة كل 24 ساعة.", "error");
            getEl('marathon-rules-modal').classList.remove('active');
            checkMarathonStatus();
            return;
        }
    }

    btn.disabled = true; 
    btn.innerHTML = `<span class="material-symbols-rounded animate-spin">autorenew</span> جاري التحقق...`;

    try {
        if (isGuestMode()) {
            userProfile.lastMarathonDate = Date.now();
            scheduleGuestSave(true);
        } else {
            await updateDoc(doc(db, "users", effectiveUserId), {
                lastMarathonDate: serverTimestamp()
            });
            userProfile.lastMarathonDate = { toMillis: () => Date.now() };
        }

        const cacheBuster = Date.now();
        const response = await fetch('./Data/Noor/dataNooR.json', { cache: 'no-store' });
        
        if (!response.ok) throw new Error("فشل تحميل ملف أسئلة (أكمل النور)");
        
        let rawData = await response.json();

        const seenIds = userProfile.seenMarathonIds || [];
        let freshQs = [];
        let usedQs = [];

        rawData.forEach((q, index) => {
            if (q.question && Array.isArray(q.options) && typeof q.correctAnswer === 'number') {
                const questionObj = {
                    id: q.id || `noor_idx_${index}`,
                    question: q.question,
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    topic: q.topic || "(أكمل النور)",
                    explanation: q.explanation || ""
                };

                if (seenIds.includes(questionObj.id)) {
                    usedQs.push(questionObj);
                } else {
                    freshQs.push(questionObj);
                }
            }
        });
        // ✅ ضع هذا الكود الجديد مكانه:
        
        // 1. خلط القوائم لضمان التنوع
        shuffleArray(freshQs);
        shuffleArray(usedQs);

        // 2. منطق اللعب حتى نهاية الملف
        if (freshQs.length > 0) {
            // الحالة الأولى: المستخدم لم يختم الملف بعد
            // نضع الأسئلة الجديدة فقط، وتنتهي اللعبة عند انتهائها
            quizState.questions = freshQs;
            toast(`🚀 انطلاق! متبقي ${freshQs.length} سؤال لختم هذا الملف.`, "info");
        } else {
            // الحالة الثانية: المستخدم ختم الملف سابقاً
            // نضع جميع الأسئلة (المراجعة) وتنتهي اللعبة بنهاية الملف
            quizState.questions = usedQs;
            toast("🌟 رائع! أنت ختمت هذا الملف. بدأت جولة مراجعة شاملة.", "success");
        }

        // 3. حماية من الملفات الفارغة
        if (quizState.questions.length === 0) {
            toast("عذراً، لا توجد أسئلة في الملف!", "error");
            throw new Error("Empty questions list");
        }


        quizState.mode = 'marathon'; 
        quizState.contextTopic = "(أكمل النور)";

        getEl('marathon-rules-modal').classList.remove('active'); 
        startQuiz();

    } catch(e) {
        console.error(e);
        toast("حدث خطأ أثناء الاتصال بالسيرفر", "error");
    } finally {
        btn.disabled = false; 
        btn.innerHTML = `بدء التحدي الآن!`;
    }
}

function startQuiz() {
    // ✅ حماية إضافية: منع بدء اللعب إذا كان المستخدم محظوراً لأي سبب
    if (userProfile && userProfile.isBanned) {
        enforceBanState(effectiveUserId).catch(() => {});
        quizState.active = false;
        return;
    }

    window.history.pushState({ view: 'playing' }, "", "");

    hide('bottom-nav');
    
    quizState.idx = 0; quizState.score = 0; quizState.correctCount = 0; quizState.active = true; 
    quizState.history = []; quizState.streak = 0; 

    // ✅ تتبع الأسئلة المعروضة فعلياً + تعليمها كـ seen لمنع تكرارها حتى مع الانسحاب/إعادة التحميل
    quizState.presentedIds = new Set();
    
    const extraLives = (userProfile.inventory && userProfile.inventory.lives) ? userProfile.inventory.lives : 0;
    quizState.lives = 3 + extraLives;
    quizState.maxLives = quizState.lives;
    helpers = { fifty: false, hint: false, skip: false };
    quizState.usedHelpers = false; 
    quizState.hasUsedHelperInSession = false; 
    quizState.fastAnswers = 0; 
    quizState.enrichmentEnabled = true;

    quizState.marathonCorrectStreak = 0; 

    // تم حذف مؤقت الأسئلة نهائياً في جميع الأوضاع

    hide('welcome-area'); show('quiz-proper');
    getEl('quiz-topic-display').textContent = quizState.contextTopic || 'مسابقة متنوعة';
    
    getEl('ai-question-count').disabled = false;
    getEl('ai-generate-btn').disabled = false;
    getEl('btn-marathon-start').disabled = false;
    
    updateHelpersUI();
    updateStreakUI();
    updateEnrichmentUI(); 
    renderLives();

    // ✅ صوت بدء الجولة (مرة واحدة مع أول سؤال)
    if (typeof playSound === 'function') playSound('round_start');
    renderQuestion();
}




/* =========================================
   Option Text Auto-Fit (UI-only)
   - Prevent long option text from being clipped inside fixed-height option cards.
   - Shrinks font-size only when overflow is detected.
   ========================================= */
let __optionTextFitRAF = 0;

function __fitOneOptionButtonText(btn, isGridMode) {
    if (!btn) return;
    const textEl = btn.querySelector('.option-text') || btn;

    // Capture the baseline font size once per element.
    let basePx = parseFloat(textEl.dataset.baseFontPx || '');
    if (!basePx || Number.isNaN(basePx)) {
        const cs = window.getComputedStyle(textEl);
        basePx = parseFloat(cs.fontSize) || 18;
        textEl.dataset.baseFontPx = String(basePx);
    }

    // Reset to baseline before fitting.
    textEl.style.fontSize = `${basePx}px`;
    textEl.style.lineHeight = '1.25';
    textEl.style.whiteSpace = 'normal';
    textEl.style.overflowWrap = 'anywhere';
    textEl.style.wordBreak = 'break-word';
    textEl.style.display = 'block';

    const minPx = isGridMode ? 10.5 : 11; // keep readable, but ensure fit
    let size = basePx;

    // Detect overflow relative to the button bounds (button has fixed height).
    const overflows = () => {
        // Small tolerance to avoid endless loops due to sub-pixel rounding.
        return (btn.scrollHeight - btn.clientHeight) > 1 || (btn.scrollWidth - btn.clientWidth) > 1;
    };

    // Reduce font size until it fits or we hit the minimum.
    let guard = 80;
    while (guard-- > 0 && size > minPx && overflows()) {
        size = Math.round((size - 0.5) * 2) / 2;
        textEl.style.fontSize = `${size}px`;
    }
}

function scheduleOptionTextFit(container) {
    if (!container) return;
    const isGridMode = container.classList.contains('options-grid-mode');

    // Debounced via rAF to wait for layout.
    if (__optionTextFitRAF) cancelAnimationFrame(__optionTextFitRAF);
    __optionTextFitRAF = requestAnimationFrame(() => {
        __optionTextFitRAF = requestAnimationFrame(() => {
            const buttons = container.querySelectorAll('.option-btn');
            buttons.forEach(btn => __fitOneOptionButtonText(btn, isGridMode));
        });
    });
}

// Re-fit on resize/orientation changes (UI-only, safe).
window.addEventListener('resize', () => {
    const box = document.getElementById('options-container');
    if (box) scheduleOptionTextFit(box);
});
function __setQuizProgressTube(fillEl, solvedCount, totalCount) {
    if (!fillEl) return;

    const total = Math.max(1, Number(totalCount) || 1);
    const solved = Math.max(0, Number(solvedCount) || 0);
    const pct = Math.max(0, Math.min(100, Math.round((solved / total) * 100)));

    fillEl.style.width = `${pct}%`;

    // تدرّج سلس: أحمر -> أخضر (0%..60%) ثم أخضر -> ذهبي (60%..100%)
    const red   = [239, 68, 68];   // #ef4444
    const green = [16, 185, 129];  // #10b981
    const gold  = [245, 158, 11];  // #f59e0b

    const lerp = (a, b, t) => Math.round(a + (b - a) * t);

    let a = red, b = green, t = 0;
    if (pct <= 60) {
        t = pct / 60;
        a = red; b = green;
    } else {
        t = (pct - 60) / 40;
        a = green; b = gold;
    }

    const r = lerp(a[0], b[0], t);
    const g = lerp(a[1], b[1], t);
    const bb = lerp(a[2], b[2], t);

    const base = `rgb(${r}, ${g}, ${bb})`;
    const dark = `rgb(${Math.round(r * 0.55)}, ${Math.round(g * 0.55)}, ${Math.round(bb * 0.55)})`;

    fillEl.style.background = `linear-gradient(90deg, ${base}, ${dark})`;
    fillEl.style.color = base;

    if (!fillEl.dataset.tubeReady) {
        fillEl.style.transition = 'width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.35s ease, color 0.35s ease';
        fillEl.dataset.tubeReady = '1';
    }
}
function renderQuestion() {
    quizState.processingAnswer = false;
    quizState.usedHelpers = false;
    updateHelpersUI();

    quizState.active = true;
    const q = quizState.questions[quizState.idx];

    // ✅ تعليم السؤال كـ "تم عرضه" فوراً (لمنع تكراره حتى لو انسحب/أعاد التحميل)
    try {
        if (q && q.id) {
            if (!quizState.presentedIds) quizState.presentedIds = new Set();
            const sid = String(q.id);
            quizState.presentedIds.add(sid);

            // --- نظام عدم التكرار حسب الوضع ---
            if (quizState.mode === 'truefalse' && typeof markTrueFalseAsSeen === 'function') {
                markTrueFalseAsSeen(sid);
            } else {
                markQuestionAsSeen(sid);
            }
        }
    } catch (_) {}

    getEl('quiz-topic-display').textContent = (window.toArabicDigits ? window.toArabicDigits(q.topic || quizState.contextTopic) : (q.topic || quizState.contextTopic));

    // كتابة نص السؤال
    typeWriter('question-text', (window.toArabicDigits ? window.toArabicDigits(q.question) : q.question));

    // عدّاد/تقدم
    if (quizState.mode === 'marathon') {
        getEl('question-counter-text').textContent = formatNumberAr(quizState.idx + 1);
        const dots = getEl('progress-dots');

        if (dots && !document.getElementById('quiz-progress-fill')) {
            dots.innerHTML = `<div class="glass-tube-container h-2 w-full border border-amber-500/20"><div id="quiz-progress-fill" class="liquid-fill"></div></div>`;
        }

        const fill = getEl('quiz-progress-fill');
        __setQuizProgressTube(fill, quizState.idx, quizState.questions.length);
    } else {
        getEl('question-counter-text').textContent = `${formatNumberAr(quizState.idx + 1)}/${formatNumberAr(quizState.questions.length)}`;

        const dots = getEl('progress-dots');

        if (dots && !document.getElementById('quiz-progress-fill')) {
            dots.innerHTML = `<div class="glass-tube-container h-2 w-full border border-amber-500/20"><div id="quiz-progress-fill" class="liquid-fill"></div></div>`;
        }

        const fill = getEl('quiz-progress-fill');
        __setQuizProgressTube(fill, quizState.idx, quizState.questions.length);
    }

    getEl('live-score-text').textContent = formatNumberAr(quizState.score);

    const box = getEl('options-container');
    box.innerHTML = '';

    // ============================================================
    // ✅ تنسيق الخيارات حسب الوضع
    // - marathon : شبكة
    // - truefalse: شبكة مخصصة (زرّان كبيران)
    // - default  : قائمة
    // ============================================================
    box.classList.remove('options-grid-mode', 'options-truefalse-mode', 'space-y-1', 'space-y-2', 'space-y-3');

    const isTrueFalse = quizState.mode === 'truefalse';

    if (quizState.mode === 'marathon') {
        box.classList.add('options-grid-mode');
    } else if (isTrueFalse) {
        box.classList.add('options-truefalse-mode');
    } else {
        box.classList.add('space-y-1');
    }

    // 1) جلب القالب
    const template = document.getElementById(isTrueFalse ? 'tf-option-template' : 'option-template');

    // 2) بناء الأزرار
    q.options.forEach((o, i) => {
        const clone = template.content.cloneNode(true);
        const btn = clone.querySelector('button');

        if (isTrueFalse) {
            const iconEl = btn.querySelector('.tf-option-icon');
            const textEl = btn.querySelector('.tf-option-text');
            const isTrue = (String(o).trim() === 'صح') || (i === 0);

            if (iconEl) iconEl.textContent = isTrue ? 'check_circle' : 'cancel';
            if (textEl) textEl.textContent = (window.toArabicDigits ? window.toArabicDigits(o) : o);

            btn.classList.add(isTrue ? 'tf-true' : 'tf-false');
        } else {
            const charEl = btn.querySelector('.option-char');
            const textEl = btn.querySelector('.option-text');
            if (charEl) charEl.textContent = formatNumberAr(i + 1);
            if (textEl) textEl.textContent = (window.toArabicDigits ? window.toArabicDigits(o) : o);
        }

        btn.onclick = () => selectAnswer(i, btn);
        btn.classList.add('grid-pop');
        btn.classList.add(`grid-pop-delay-${Math.min(i, 9)}`);
        box.appendChild(clone);
    });

    // ✅ Auto-fit long option text to prevent clipping (works for normal template)
    scheduleOptionTextFit(box);

    getEl('feedback-text').textContent = '';
    quizState.startTime = Date.now();
}

function nextQuestion() {
    quizState.idx++;
    if(quizState.idx < quizState.questions.length) {
        renderQuestion();
    } else {
        endQuiz();
    }
}

function updateStreakUI() {
    const icon = getEl('streak-icon');
    const txt = getEl('streak-count');

    // --- التعديل: إخفاء الستريك تماماً إذا لم يكن الوضع ماراثون ---
    if (quizState.mode !== 'marathon') {
        icon.classList.remove('active');
        icon.classList.add('opacity-0'); // إخفاء
        txt.classList.add('opacity-0');  // إخفاء
        return; 
    }
    // -----------------------------------------------------------

    const s = quizState.streak;
    txt.textContent = 'x' + formatNumberAr(s); 
    
    icon.classList.remove('text-orange-500', 'text-yellow-400', 'text-red-500', 'text-purple-500', 'animate-pulse');
    txt.classList.remove('text-orange-400', 'text-yellow-300', 'text-red-400', 'text-purple-400');
    
    if(s > 1) {
        icon.classList.remove('opacity-0'); // إظهار
        icon.classList.add('active');
        txt.classList.remove('opacity-0'); // إظهار
        if (s >= 15) { icon.classList.add('text-purple-500', 'animate-pulse'); txt.classList.add('text-purple-400'); } 
        else if (s >= 10) { icon.classList.add('text-red-500'); txt.classList.add('text-red-400'); } 
        else if (s >= 5) { icon.classList.add('text-yellow-400'); txt.classList.add('text-yellow-300'); } 
        else { icon.classList.add('text-orange-500'); txt.classList.add('text-orange-400'); }
    } else {
        icon.classList.remove('active');
        txt.classList.add('opacity-0');
        icon.classList.add('text-orange-500');
    }
}

// دالة عرض المعلومة الإثرائية (نسخة نظيفة بدون مفضلة)
function showEnrichment(text) {
    // 1. تحديث الإحصائيات (مهم للأوسمة)
    if (userProfile && userProfile.stats) {
        if (!userProfile.stats.enrichmentCount) userProfile.stats.enrichmentCount = 0;
        userProfile.stats.enrichmentCount++;
        if (!userProfile.stats.explanationsViewed) userProfile.stats.explanationsViewed = 0;
        userProfile.stats.explanationsViewed++;
        
        if (typeof effectiveUserId !== 'undefined' && effectiveUserId) {
            updateDoc(doc(db, "users", effectiveUserId), {
                "stats.enrichmentCount": userProfile.stats.enrichmentCount,
                "stats.explanationsViewed": userProfile.stats.explanationsViewed
            }).catch(console.error);
        }
    }

    // 2. وضع النص
    const contentEl = document.getElementById('enrichment-content');
    if(contentEl) contentEl.textContent = text;
    
    // 3. إظهار النافذة
    const modal = document.getElementById('enrichment-modal');
    if(modal) {
        modal.classList.remove('hidden');
        requestAnimationFrame(() => modal.classList.add('active'));
        
        if(typeof playSound === 'function') playSound('hint');

        // 4. منطق الإغلاق (ضغطة واحدة في أي مكان)
        const closeHandler = () => {
            modal.classList.remove('active');
            setTimeout(() => modal.classList.add('hidden'), 300);
            
            // الانتقال للسؤال التالي
            if(typeof nextQuestion === 'function') nextQuestion(); 
        };

        // تفعيل النقر بعد نصف ثانية (لمنع الإغلاق بالخطأ فور الظهور)
        setTimeout(() => {
            modal.addEventListener('click', closeHandler, { once: true });
        }, 500);
    }
}

// جعل الدالة متاحة عالمياً
window.showEnrichment = showEnrichment;

// دالة الحفظ الفعلي في قاعدة البيانات
async function toggleEnrichFav(btn) {
    // منع إغلاق النافذة عند الضغط
    window.event.stopPropagation();
    
    const contentText = getEl('enrichment-content').textContent;
    const icon = btn.querySelector('span');
    const isActive = btn.classList.contains('active');

    if (!isActive) {
        // --- عملية الحفظ ---
        
        // نقوم بتغليف المعلومة كأنها "سؤال" لتتناسب مع نظام المفضلة الحالي
        const enrichObj = {
            question: contentText,          // نص المعلومة
            options: ["معلومة إثرائية"],    // خانة وهمية
            correctAnswer: 0,
            type: 'enrichment',             // علامة لنميزها لاحقاً
            savedAt: Date.now()
        };

        // إضافة للقائمة المحلية
        userProfile.favorites.push(enrichObj);
        
        // تحديث الزر
        btn.classList.add('active');
        icon.textContent = 'favorite';
        toast("تم حفظ المعلومة في المفضلة ❤️");

    } else {
        // --- عملية الحذف ---
        
        // البحث عن العنصر لحذفه
        const index = userProfile.favorites.findIndex(f => f.question === contentText && f.type === 'enrichment');
        if (index > -1) {
            userProfile.favorites.splice(index, 1);
        }

        // تحديث الزر
        btn.classList.remove('active');
        icon.textContent = 'favorite_border';
        toast("تمت الإزالة من المفضلة");
    }

    // الحفظ في السيرفر (Firebase)
    if (effectiveUserId) {
        try {
            await updateDoc(doc(db, "users", effectiveUserId), {
                favorites: userProfile.favorites
            });
        } catch(e) {
            console.error("خطأ في حفظ المفضلة:", e);
            toast("تعذر الحفظ في السيرفر (مشكلة اتصال)", "error");
        }
    }
}

