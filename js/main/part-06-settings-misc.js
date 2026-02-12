// ==============================
// 🔊 إعدادات الصوت (مؤثرات فقط)
// ==============================
const AUDIO_PREF_KEYS = {
    soundEnabled: 'noor_sound_enabled_v1',
    musicVolume: 'noor_music_volume_v1'
};

// مستوى الصوت الحالي (0..1)
window.__sfxVolume01 = window.__sfxVolume01 ?? 0.30;

function clampInt(v, min, max, fallback) {
    const n = Number.parseInt(v, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function applyMusicVolume(vol01) {
    // نحتفظ باسم الدالة للترابط مع الكود القديم، لكنها الآن تتحكم بمستوى مؤثرات الصوت.
    const v = Math.min(1, Math.max(0, Number(vol01)));
    window.__sfxVolume01 = v;
}

function updateVolumeLabel(volInt) {
    const el = document.getElementById('sfx-volume-number');
    if (el) el.textContent = String(volInt);
}

function updateAudioSettingsUI() {
    const statusEl = document.getElementById('sound-status-label');
    const volEl = document.getElementById('bg-music-volume');
    const testBtn = document.getElementById('test-sfx-btn');

    const enabled = !isMuted;

    if (statusEl) {
        statusEl.textContent = enabled ? 'مفعل' : 'مكتوم';
        statusEl.classList.toggle('text-red-300', !enabled);
        statusEl.classList.toggle('border-red-500/30', !enabled);
        statusEl.classList.toggle('text-slate-300', enabled);
        statusEl.classList.toggle('border-white/10', enabled);
        statusEl.classList.toggle('opacity-80', !enabled);
    }

    if (volEl) {
        volEl.disabled = !enabled;
        volEl.classList.toggle('opacity-40', !enabled);
        volEl.classList.toggle('cursor-not-allowed', !enabled);
    }

    if (testBtn) {
        testBtn.disabled = !enabled;
        testBtn.classList.toggle('opacity-40', !enabled);
        testBtn.classList.toggle('cursor-not-allowed', !enabled);
    }
}
// ✅ تحديث شكل زر الكتم السريع بجانب المصباح
function updateQuickMuteButtonUI() {
    const btn = document.getElementById('mute-audio-btn');
    if (!btn) return;

    const icon = btn.querySelector('.material-symbols-rounded');
    if (!icon) return;

    if (isMuted) {
        icon.textContent = 'volume_off';
        btn.title = 'تفعيل الصوت';
        btn.classList.add('text-red-400');
        btn.classList.remove('text-slate-500');
    } else {
        icon.textContent = 'volume_up';
        btn.title = 'كتم الصوت';
        btn.classList.remove('text-red-400');
        btn.classList.add('text-slate-500');
    }
}

// ✅ توحيد طريقة تفعيل/كتم الصوت (حتى يعمل زر الإعدادات وزر المسابقة بنفس السلوك)
function setSoundEnabled(soundEnabled, showToast = true) {
    isMuted = !soundEnabled;

    try {
        localStorage.setItem(AUDIO_PREF_KEYS.soundEnabled, soundEnabled ? '1' : '0');
    } catch (_) {}

    // مزامنة زر الإعدادات إن وجد
    const muteToggle = document.getElementById('mute-toggle');
    if (muteToggle) muteToggle.checked = !!soundEnabled;

    updateAudioSettingsUI();
    updateQuickMuteButtonUI();

    if (showToast && typeof toast === 'function') {
        toast(soundEnabled ? 'تم تفعيل الصوت' : 'تم كتم الصوت');
    }
}
function restoreAudioPrefs() {
    // ✅ حالة الصوت
    const savedSound = localStorage.getItem(AUDIO_PREF_KEYS.soundEnabled);
    const soundEnabled = savedSound === null ? true : (savedSound === '1' || savedSound === 'true');
    isMuted = !soundEnabled;

    const muteToggleBtn = document.getElementById('mute-toggle');
    if (muteToggleBtn) muteToggleBtn.checked = soundEnabled;

    // ✅ مستوى الصوت (كان سابقاً للموسيقى الخلفية)
    const savedVol = localStorage.getItem(AUDIO_PREF_KEYS.musicVolume);
    const vol = clampInt(savedVol, 0, 100, 30);

    const musicVolEl = document.getElementById('bg-music-volume');
    if (musicVolEl) musicVolEl.value = String(vol);

    applyMusicVolume(vol / 100);

    updateVolumeLabel(vol);
updateAudioSettingsUI();
updateQuickMuteButtonUI();
}

// 3. زر كتم الصوت + حفظ التغيير
const muteToggleBtn = document.getElementById('mute-toggle');
if (muteToggleBtn) {
    muteToggleBtn.onchange = () => {
        setSoundEnabled(!!muteToggleBtn.checked, true);
    };
}
const quickMuteBtn = document.getElementById('mute-audio-btn');
if (quickMuteBtn) {
    quickMuteBtn.addEventListener('click', () => {
        // toggle: إذا كان مكتوم → فعّل، إذا كان مفعل → اكتم
        setSoundEnabled(isMuted, true);
    });

    // ضمان أن الأيقونة صحيحة عند التحميل
    updateQuickMuteButtonUI();
}

// 4. مستوى صوت الموسيقى + حفظ (تحديث فوري)
const musicVolEl = document.getElementById('bg-music-volume');
if (musicVolEl) {
    const onVolChange = () => {
        const vol = clampInt(musicVolEl.value, 0, 100, 30);
        localStorage.setItem(AUDIO_PREF_KEYS.musicVolume, String(vol));
        applyMusicVolume(vol / 100);

        updateVolumeLabel(vol);
    };
    musicVolEl.addEventListener('input', onVolChange);
    musicVolEl.addEventListener('change', onVolChange);
}

// زر اختبار الصوت
const testSfxBtn = document.getElementById('test-sfx-btn');
if (testSfxBtn) {
    testSfxBtn.addEventListener('click', () => {
        if (!isMuted && typeof playSound === 'function') playSound('answer_click');
    });
}

// زر إعادة ضبط الإعدادات (الصوت + حجم الخط)
const resetSettingsBtn = document.getElementById('reset-settings-btn');
if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', () => {
        // الصوت
        try {
            localStorage.setItem(AUDIO_PREF_KEYS.soundEnabled, '1');
            localStorage.setItem(AUDIO_PREF_KEYS.musicVolume, '30');
        } catch (_) {}

        isMuted = false;
        if (muteToggleBtn) muteToggleBtn.checked = true;
        if (musicVolEl) musicVolEl.value = '30';
        applyMusicVolume(0.30);
        updateVolumeLabel(30);
        updateAudioSettingsUI();

        // حجم الخط
        try { localStorage.setItem('app_font_size', '16'); } catch (_) {}
        document.documentElement.style.setProperty('--base-size', '16px');
        const fsSlider = getEl('font-size-slider');
        const fsNum = getEl('font-size-number');
        const fsPrev = getEl('font-size-preview');
        if (fsSlider) fsSlider.value = '16';
        if (fsNum) fsNum.textContent = '16';
        if (fsPrev) fsPrev.style.fontSize = 'var(--base-size)';

        if (typeof toast === 'function') toast('تمت إعادة ضبط الإعدادات');
    });
}

// ✅ استرجاع الإعدادات عند تحميل الصفحة (وأيضاً فوراً للقيم الظاهرة)
restoreAudioPrefs();
document.addEventListener('DOMContentLoaded', restoreAudioPrefs);

/* =========================================
   Visual Magic: Golden Ripple Effect (إعادة تفعيل)
   ========================================= */

document.addEventListener('click', (e) => {
    // إنشاء عنصر النبضة
    const ripple = document.createElement('div');
    ripple.className = 'touch-ripple';
    
    // تحديد الموقع بدقة مكان الإصبع
    ripple.style.left = `${e.pageX}px`;
    ripple.style.top = `${e.pageY}px`;
    
    document.body.appendChild(ripple);
    
    // تنظيف العنصر من الذاكرة بعد انتهاء الحركة (0.6 ثانية)
    setTimeout(() => {
        ripple.remove();
    }, 600);
});

function typeWriter(elementId, text, speed = 25) {
    const element = getEl(elementId);
    if (!element) return;

    if (quizState.typeWriterInterval) clearInterval(quizState.typeWriterInterval);

    element.textContent = ''; 
    let i = 0;

    quizState.typeWriterInterval = setInterval(() => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(quizState.typeWriterInterval);
            quizState.typeWriterInterval = null;
        }
    }, speed);
}

function showFloatingFeedback(element, text, colorClass) {
    if (!element) return;
    
    // 1. تحديد مكان الزر بدقة
    const rect = element.getBoundingClientRect();
    
    // 2. إنشاء العنصر
    const el = document.createElement('div');
    el.className = `float-feedback ${colorClass}`;
    
    // 3. تحويل الأرقام إلى عربية (٠-٩)
    // نستخدم replace لاستبدال الأرقام الإنجليزية بالعربية
    el.textContent = text.replace(/\d/g, d => ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'][d]);
    
    // 4. ضبط الموقع (منتصف الزر)
    // نخصم نصف عرض تقريبي للنص ليكون في المنتصف تماماً
    el.style.left = `${rect.left + rect.width / 2 - 20}px`; 
    el.style.top = `${rect.top}px`;

    document.body.appendChild(el);
    
    // 5. الحذف بعد انتهاء الحركة
    setTimeout(() => el.remove(), 1200);
}


// ==========================================
// 🎁 نظام المكافأة اليومية (تم فصله إلى js/giftday.js)
// ==========================================

let __giftdayApiPromise = null;

async function __getGiftdayAPI() {
    if (__giftdayApiPromise) return __giftdayApiPromise;

    __giftdayApiPromise = import(`../giftday.js`)
        .then((mod) => {
            if (!mod || typeof mod.createGiftdayAPI !== 'function') return null;
            return mod.createGiftdayAPI({
                getUserProfile: () => userProfile,
                getEffectiveUserId: () => effectiveUserId,
                isGuestMode,
                scheduleGuestSave,
                db,
                doc,
                updateDoc,
                toast,
                updateProfileUI,
                playSound,
                launchConfetti,
                addLocalNotification,
                formatNumberAr
            });
        })
        .catch((e) => {
            console.error('giftday load failed:', e);
            __giftdayApiPromise = null;
            return null;
        });

    return __giftdayApiPromise;
}

// ✅ إبقاء الاستدعاء القديم داخل main.js كما هو: checkAndShowDailyReward();
function checkAndShowDailyReward() {
    if (typeof window.checkAndShowDailyReward === 'function') {
        return window.checkAndShowDailyReward();
    }
}

function claimDailyReward() {
    if (typeof window.claimDailyReward === 'function') {
        return window.claimDailyReward();
    }
}

window.checkAndShowDailyReward = function() {
    __getGiftdayAPI().then((api) => api && api.checkAndShowDailyReward());
};

window.claimDailyReward = function() {
    __getGiftdayAPI().then((api) => api && api.claimDailyReward());
};


bind('btn-update-password', 'click', async () => {
    const newPassInput = getEl('settings-new-password');
    const newPass = newPassInput.value.trim();
    const btn = getEl('btn-update-password');

    if (!newPass) {
        toast("الرجاء كتابة كلمة مرور جديدة", "error");
        return;
    }
    if (newPass.length < 4) {
        toast("كلمة المرور قصيرة جداً (4 أحرف على الأقل)", "error");
        return;
    }

    btn.disabled = true;
    btn.textContent = "...";

    try {
        await updatePasswordIfEmailAccount(newPass);
        addLocalNotification('أمان الحساب 🔐', 'تم تغيير كلمة المرور بنجاح من الإعدادات', 'lock_reset');
        toast("✅ تم تحديث كلمة المرور بنجاح");
        newPassInput.value = '';
    } catch (e) {
        console.error(e);
        // إذا كانت الجلسة قديمة، تطلب Firebase إعادة تسجيل الدخول
        if (e && e.code === 'auth/requires-recent-login') {
            toast('يجب تسجيل الخروج ثم الدخول مجددًا قبل تغيير كلمة المرور', 'error');
        } else if (e && e.message) {
            toast(e.message, 'error');
        } else {
            toast('فشل التحديث', 'error');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'حفظ';
    }
});

// ==========================================
// 📩 مراسلة المطور (مسموح بعد تسجيل الدخول فقط)
// ==========================================

bind('nav-contact', 'click', async (e) => {
    if (e) e.preventDefault();
    toggleMenu(false); // إغلاق القائمة الجانبية

    // منع المراسلة قبل تسجيل الدخول/التسجيل
    const uname = (userProfile?.username || '').trim();
    const isGuest = (!effectiveUserId) || (!uname) || (uname === 'ضيف');

    if (isGuest) {
        toast('يرجى تسجيل الدخول أو إنشاء حساب قبل مراسلة المطور', 'error');
        return;
    }

    // ضمان تهيئة نظام المراسلة ثم فتح صفحة الدردشة (الواجهة الصحيحة)
    try {
        await initMessaging({ db, uid: effectiveUserId, getUsername: () => userProfile?.username, toast });
    } catch (err) {
        console.warn('Messaging init failed', err);
    }

    // فتح صفحة الدردشة عبر زر الفقاعة لضمان نفس مسار التشغيل
    const bubble = document.getElementById('chat-float-bubble');
    if (bubble) bubble.click();
});

// 2. كود الإرسال (حيلة البلاغ)
bind('btn-send-contact', 'click', async () => {
    const msgBody = getEl('contact-msg-body').value.trim();
    const title = getEl('contact-title').value.trim();
    const note = getEl('contact-note').value.trim();
    const feedback = getEl('contact-feedback');
    const btn = getEl('btn-send-contact');

    // تحقق بسيط
    if (!msgBody || !title) {
        feedback.textContent = "يرجى كتابة نص الرسالة والعنوان";
        feedback.className = "text-center text-xs mt-3 h-4 text-red-400 font-bold";
        return;
    }

    // تعطيل الزر لمنع التكرار
    btn.disabled = true;
    const oldBtnContent = btn.innerHTML;
    btn.innerHTML = '<span class="material-symbols-rounded animate-spin">autorenew</span> جاري الإرسال...';

    // تجهيز البيانات لتشبه "البلاغ" تماماً
    // هذا ما سيظهر في تطبيق المطور الخاص بك:
    const fakeReportData = {
        questionId: "CONTACT_MSG",          // لتميزها أنها ليست سؤالاً
        topic: `📩 رسالة: ${title}`,        // سيظهر في خانة "القسم"
        questionText: `${msgBody}\n\n📝 ملاحظة إضافية:\n${note || 'لا يوجد'}`, // سيظهر في خانة "نص السؤال"
        reportedByUserId: effectiveUserId,
        reportedByUsername: userProfile.username,
        timestamp: serverTimestamp()
    };

    try {
        // الإرسال إلى مجموعة البلاغات (reports)
        await setDoc(doc(collection(db, "reports")), fakeReportData);
        
        // نجاح
        toast("✅ تم إرسال رسالتك للمطور بنجاح!");
        playSound('win');
        
        // إغلاق النافذة
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));

    } catch (e) {
        console.error("Error sending contact msg:", e);
        feedback.textContent = "فشل الإرسال، تأكد من الاتصال بالإنترنت";
        feedback.className = "text-center text-xs mt-3 h-4 text-red-400 font-bold";
    } finally {
        // إعادة الزر لوضعه الطبيعي
        btn.disabled = false;
        btn.innerHTML = oldBtnContent;
    }
});

// ==========================================
// (تمت إزالة نظام الشرح بالذكاء الاصطناعي بالكامل)
// ==========================================
// ==========================================
// 📡 مراقب حالة الاتصال (Online/Offline Monitor)
// ==========================================

function updateOnlineStatus() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;

    if (navigator.onLine) {
        // حالة الاتصال: إخفاء الشريط
        banner.classList.remove('show-offline');
        banner.classList.add('hidden');
    } else {
        // حالة الانقطاع: إظهار الشريط
        banner.classList.remove('hidden');
        // تأخير بسيط للسماح للمتصفح بإزالة hidden قبل تفعيل الحركة
        setTimeout(() => {
            banner.classList.add('show-offline');
        }, 10);
        
        // تنبيه المستخدم (Toast)
        if(typeof toast === 'function') toast("انقطع الاتصال بالإنترنت ", "error");
    }
}

// الاستماع للأحداث
window.addEventListener('online', () => {
    updateOnlineStatus();
    if(typeof toast === 'function') toast("عاد الاتصال! تمت المزامنة ", "success");
});
window.addEventListener('offline', updateOnlineStatus);

// التحقق عند بدء التشغيل
document.addEventListener('DOMContentLoaded', updateOnlineStatus);


// --- تفعيل أزرار الشريط السفلي الجديدة (محدث للعمل المباشر) ---

// 1. ربط زر المتصدرين السفلي (تم تحويله لفتح صفحة مستقلة)
bind('bottom-leaderboard-btn', 'click', () => {
    if(typeof toggleMenu === 'function') toggleMenu(false);
    
    // إخفاء جميع الشاشات الرئيسية الأخرى والشريط السفلي
    hide('welcome-area');
    hide('quiz-proper');
    hide('results-area');
    hide('login-area');
    hide('auth-loading');
    hide('achievements-view');
    hide('bottom-nav'); // إخفاء شريط التنقل السفلي
    
    // إظهار صفحة المتصدرين
    show('leaderboard-view');
    
    // استدعاء دالة تحميل البيانات
    loadLeaderboard();
    startLeaderboardResetTimer();
    
    // تسجيل المشهد في المتصفح للزر الرجوع
    window.history.pushState({ view: 'leaderboard' }, "", "");
});

// زر الرجوع من صفحة المتصدرين إلى الرئيسية
bind('btn-back-leaderboard', 'click', () => {
    hide('leaderboard-view');
    navToHome(); 
});

// 2. ربط زر الحقيبة السفلي
bind('bottom-bag-btn', 'click', () => {
    try {
        toggleMenu(false);
        openBag(); // دالة فتح الحقيبة تعمل بشكل مباشر ولا تحتاج تعديل
    } catch (e) {
        try { openBag(); } catch (_) {}
    }
});

// (تم نقل تعريف دوال المهام اليومية وربطها بـ window إلى ملف js/daily_quests.js)



// ==========================================
// 🚀 التشغيل الرئيسي (Main Initialization)
// هذا الكود يعمل مرة واحدة فقط عند جاهزية الصفحة
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 التطبيق جاهز...");

});
// ==========================================
// 🔔 نظام الإشعارات (تصميم أسود + خط أميري + أرشفة)
// ==========================================
window.toast = function(msg, type = 'info', forceSave = false) {
    // 1. إعداد الألوان
    let borderColor = 'border-slate-600'; 
    let barColor = 'bg-slate-600';
    let iconName = ''; 

    if (type === 'success') {
        borderColor = 'border-green-500';
        barColor = 'bg-green-500';
        iconName = 'check_circle';
    } else if (type === 'error') {
        borderColor = 'border-red-600';
        barColor = 'bg-red-600';
        iconName = 'warning';
    } else if (type === 'gold' || msg.includes('نقاط') || msg.includes('مكافأة')) {
        borderColor = 'border-amber-400';
        barColor = 'bg-amber-400';
        iconName = 'monetization_on';
        type = 'gold'; 
    }

    // 2. بناء العنصر
    const box = document.createElement('div');
    box.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] 
                     bg-black text-white px-6 py-3 rounded-sm shadow-2xl 
                     flex flex-col items-center justify-center 
                     min-w-[200px] w-fit max-w-[85vw] 
                     border border-opacity-50 ${borderColor}`;
    
    // ✅ هنا التعديل: تطبيق الخط الأميري
    box.innerHTML = `
        <span class="text-base font-bold text-center leading-relaxed tracking-wide break-words w-full" 
              style="font-family: 'Amiri', serif;">
            ${msg}
        </span>
        <div class="absolute bottom-0 left-0 h-[3px] w-full ${barColor} opacity-80" id="toast-progress"></div>
    `;

    document.body.appendChild(box);

    // 3. الأنيميشن
    requestAnimationFrame(() => {
        box.animate([
            { transform: 'translate(-50%, 20px)', opacity: 0 },
            { transform: 'translate(-50%, 0)', opacity: 1 }
        ], { duration: 300, easing: 'ease-out', fill: 'forwards' });

        const bar = box.querySelector('#toast-progress');
        bar.style.transition = "width 3000ms linear";
        bar.style.width = "100%";
        requestAnimationFrame(() => {
            bar.style.width = "0%";
        });
    });

    // 4. الأرشفة الذكية
    const isGameplaySpam = (msg.includes('إجابة صحيحة') || msg.includes('إجابة خاطئة')) && !msg.includes('نقاط');
    
    if (forceSave || type === 'gold' || type === 'error' || (type === 'success' && !isGameplaySpam)) {
        if (typeof addLocalNotification === 'function') {
            addLocalNotification(
                type === 'error' ? 'تنبيه' : (type === 'gold' ? 'مكافأة' : 'إشعار'), 
                msg, 
                iconName || 'info'
            );
        }
    }

    // 5. الإزالة
    setTimeout(() => {
        const fadeOut = box.animate([
            { transform: 'translate(-50%, 0)', opacity: 1 },
            { transform: 'translate(-50%, 20px)', opacity: 0 }
        ], { duration: 300, easing: 'ease-in', fill: 'forwards' });

        fadeOut.onfinish = () => box.remove();
    }, 3000);
};



// 2. زر الرجوع من صفحة الإنجازات إلى الرئيسية
bind('btn-back-achievements', 'click', () => {
    hide('achievements-view');
    
    // العودة للرئيسية باستخدام الدالة الموجودة مسبقاً
    navToHome(); 
});

// ربط الزر في القائمة (تم نقل المنطق إلى achievements.js)
bind('nav-achievements', 'click', () => {
    if(typeof toggleMenu === 'function') toggleMenu(false);
    
    hide('welcome-area');
    hide('quiz-proper');
    hide('results-area');
    hide('login-area');
    hide('auth-loading');
    hide('bottom-nav'); // إخفاء شريط التنقل السفلي
    
    show('achievements-view');
    // استدعاء الدالة من الملف المستورد مع تمرير ملف المستخدم
    renderAchievementsView(typeof userProfile !== 'undefined' ? userProfile : null);
    
    // تسجيل المشهد في المتصفح للزر الرجوع
    window.history.pushState({ view: 'achievements' }, "", "");
});