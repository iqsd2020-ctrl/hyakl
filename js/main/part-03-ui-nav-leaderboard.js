function toggleMenu(open) { 
    const m = getEl('side-menu'); 
    const o = getEl('side-menu-overlay'); 
    
    if(open) { 
        m.classList.add('open'); 
        o.classList.add('open');
        // تسجيل فتح القائمة في السجل
        window.history.pushState({menuOpen: true}, ""); 
    } else { 
        m.classList.remove('open'); 
        o.classList.remove('open');
        // ملاحظة: لا نقوم بـ back() هنا يدوياً لتجنب التعارض مع زر الرجوع
    } 
}

bind('menu-btn', 'click', () => toggleMenu(true));



const openModal = (id) => { 
    toggleMenu(false); 
    
    // منطق التراكم (Stacking):
    // نغلق النوافذ الأخرى فقط إذا لم تكن النافذة الجديدة هي "بروفايل اللاعب"
    // هذا يسمح لبروفايل اللاعب أن يفتح فوق المتصدرين
    if (id !== 'player-profile-modal') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); 
    }

    const modal = getEl(id);
    if(modal) {
        modal.classList.add('active');
        // تسجيل النافذة في السجل
        window.history.pushState({modalOpen: id}, ""); 
    }
};

// ==========================================
// Favorites: show full question/answer/enrichment in a popup
// ==========================================
function openFavDetailModal(favObj) {
    const modal = getEl('fav-detail-modal');
    if (!modal || !favObj) return;

    const qEl = getEl('fav-detail-question');
    const aEl = getEl('fav-detail-answer');
    const eEl = getEl('fav-detail-enrichment');

    // Fallbacks (keep UI stable even if the object shape changes)
    const qText = (favObj.question ?? '').toString();
    const isEnrichmentOnly = favObj.type === 'enrichment';

    if (qEl) qEl.textContent = qText;

    if (isEnrichmentOnly) {
        if (aEl) aEl.textContent = 'معلومة إثرائية';
        if (eEl) eEl.textContent = '—';
    } else {
        const ansText = (Array.isArray(favObj.options) && typeof favObj.correctAnswer === 'number' && favObj.options[favObj.correctAnswer] != null)
            ? String(favObj.options[favObj.correctAnswer])
            : '—';

        const enrichText = (favObj.explanation != null && String(favObj.explanation).trim().length)
            ? String(favObj.explanation)
            : 'لا توجد معلومة إثرائية لهذا السؤال.';

        if (aEl) aEl.textContent = ansText;
        if (eEl) eEl.textContent = enrichText;
    }

    modal.classList.add('active');
    if (typeof playSound === 'function') playSound('click');
}

bind('fav-detail-close', 'click', (e) => {
    try {
        e && e.preventDefault && e.preventDefault();
        e && e.stopPropagation && e.stopPropagation();
    } catch (_) {}
    getEl('fav-detail-modal')?.classList.remove('active');
    if (typeof playSound === 'function') playSound('click');
});

// ==========================================
// ✅ إصلاح أزرار الإغلاق (Global Close Handler)
// ==========================================
document.addEventListener('click', (e) => {
    // التحقق مما إذا كان العنصر المضغوط هو زر إغلاق (أو داخله)
    const closeBtn = e.target.closest('.close-modal');

    if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();

        // ✅ إذا كان زر الإغلاق داخل صفحة الحقيبة/المتجر، نغلقها بالطريقة الصحيحة
        if (closeBtn.closest('#bag-modal')) {
            try { window.closeBagPage && window.closeBagPage(); } catch (_) {}
            return;
        }

        // 1. الإغلاق البصري الفوري (لحل مشكلة عدم الاستجابة)
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        
        // إغلاق القائمة الجانبية إذا كانت مفتوحة
        toggleMenu(false);

        // تشغيل صوت النقر (إذا كان مفعلاً)
        if(typeof playSound === 'function') playSound('click');

        // 2. معالجة زر الرجوع في المتصفح (History)
        // نعود للخلف خطوة فقط إذا كان هناك سجل مفتوح، لتجنب الخروج من الموقع
        if (window.history.state && (window.history.state.modalOpen || window.history.state.menuOpen)) {
            window.history.back();
        }
    }
});

// مستمع لزر الرجوع في الهاتف لضمان إغلاق النوافذ
window.addEventListener('popstate', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    toggleMenu(false);
    try { window.closeBagPage && window.closeBagPage(true); } catch (_) {}
});


bind('nav-home', 'click', () => { toggleMenu(false); navToHome(); });


bind('nav-badges', 'click', () => {
    openModal('badges-modal');
    const container = getEl('badges-list');
    container.className = 'badges-list-container';
    container.innerHTML = '';
    const tpl = document.getElementById('badge-card-template');
    const sorted = sortBadgesSmartly();

    sorted.forEach(b => {
        const p = getBadgeProgress(b);
        const clone = tpl.content.cloneNode(true);
        const card = clone.querySelector('.badge-card');
        const iconBox = clone.querySelector('.badge-icon-box');
        
        // --- التغيير الأساسي هنا: التعامل مع الأيقونة بدلاً من الصورة ---
        const iconEl = clone.querySelector('.badge-icon');
        const name = clone.querySelector('.badge-name');
        const tier = clone.querySelector('.badge-tier');
        const desc = clone.querySelector('.badge-desc');
        const progTxt = clone.querySelector('.badge-progress-text');
        const rewards = clone.querySelector('.badge-rewards');
        const bar = clone.querySelector('.badge-bar');

        // تحديد الألوان بناءً على المستوى
        let tierColorClass = 'text-slate-600'; // اللون الافتراضي (مغلق)
        let glow = '';
        let tTxt = '';
        let barColorClass = 'badge-bar-legendary';

        if (p.tier === 'bronze' || (p.percent > 0 && p.tier === 'locked')) {
            tierColorClass = 'text-amber-700'; // برونزي
            tTxt = 'مستوى برونزي';
            barColorClass = 'badge-bar-bronze';
        } else if (p.tier === 'silver') {
            tierColorClass = 'text-slate-300'; // فضي
            glow = 'shadow-[0_0_10px_rgba(203,213,225,0.5)] border-slate-300';
            tTxt = 'مستوى فضي';
            barColorClass = 'badge-bar-silver';
        } else if (p.tier === 'gold') {
            tierColorClass = 'text-amber-400'; // ذهبي
            glow = 'shadow-[0_0_15px_rgba(251,191,36,0.8)] border-amber-400';
            tTxt = 'مستوى ذهبي 👑';
            barColorClass = 'badge-bar-gold';
            card.classList.add('border-amber-500/50');
        } else if (p.tier === 'diamond') {
            tierColorClass = 'text-cyan-400'; // ماسي
            glow = 'shadow-[0_0_15px_rgba(34,211,238,0.8)] border-cyan-400 animate-pulse';
            tTxt = 'مستوى ماسي 💎';
            barColorClass = 'badge-bar-diamond';
        } else if (p.tier === 'legendary') {
            tierColorClass = 'text-red-600'; // أسطوري
            glow = 'shadow-[0_0_20px_rgba(239,68,68,0.9)] border-red-600 animate-pulse-slow';
            tTxt = 'مستوى أسطوري 🔥';
            barColorClass = 'badge-bar-legendary';
        }

        // تطبيق الأيقونة والألوان
        iconEl.textContent = 'star';
        iconEl.className = `badge-icon material-symbols-rounded text-3xl ${tierColorClass}`;

        // إكمال بقية البيانات
        let rewHtml = '';
        if (p.activeLevel.rewards && !p.isMaxed) {
            let rList = [];
            if (p.activeLevel.rewards.score) rList.push(`<span class="text-amber-400">${formatNumberAr(p.activeLevel.rewards.score)} <span class="material-symbols-rounded text-[9px]">monetization_on</span></span>`);
            if (p.activeLevel.rewards.lives) rList.push(`<span class="text-red-500">+${p.activeLevel.rewards.lives} <span class="material-symbols-rounded text-[9px]">favorite</span></span>`);
            if (p.activeLevel.rewards.hint) rList.push(`<span class="text-yellow-400">+${p.activeLevel.rewards.hint} <span class="material-symbols-rounded text-[9px]">lightbulb</span></span>`);
            rewHtml = `<div class="flex gap-2 text-[9px] font-bold bg-black/20 px-2 py-0.5 rounded-full">${rList.join('<span class="text-slate-600">|</span>')}</div>`;
        } else if (p.isMaxed) {
            rewHtml = '<span class="text-[9px] text-green-400 font-bold">تم الختم</span>';
        }

        name.textContent = b.name;
        tier.textContent = tTxt || 'غير مكتسب';
        tier.className = `badge-tier text-[10px] font-bold opacity-90 ${tierColorClass}`;
        desc.textContent = b.desc;
        progTxt.textContent = `${formatNumberAr(p.current)} / ${formatNumberAr(p.max)}`;
        rewards.innerHTML = rewHtml;
        bar.style.width = `${p.percent}%`;
        bar.className = `badge-bar h-full transition-all duration-1000 ${barColorClass}`;

        if (glow) iconBox.classList.add(...glow.split(' '));
        iconBox.className += ` ${tierColorClass}`;

        let cCls = p.percent > 0 ? 'active-target' : 'locked';
        if (p.isMaxed) cCls = 'unlocked';
        card.classList.add(...cCls.split(' '));
        container.appendChild(clone);
    });
});

// إلغاء المتغير القديم وتثبيت الوضع على الشهري
let currentLeaderboardMode = 'monthly';

// ==========================================
// ✅ Leaderboard Loading Progress (percent bar)
// ==========================================
function setLeaderboardLoadingProgress(percent) {
    const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const bar = document.getElementById('leaderboard-progress-bar');
    const label = document.getElementById('leaderboard-progress-label');

    if (bar) bar.style.width = `${p}%`;
    if (label) {
        let txt = `${p}%`;
        try { txt = `${formatNumberAr(p)}%`; } catch (_) {}
        label.textContent = txt;
    }
}

function startLeaderboardLoadingProgress() {
    let pct = 0;
    setLeaderboardLoadingProgress(0);

    const intervalId = setInterval(() => {
        const step = pct < 70 ? 6 : (pct < 90 ? 3 : 1);
        pct = Math.min(95, pct + step);
        setLeaderboardLoadingProgress(pct);
    }, 120);

    return {
        bumpTo(target) {
            const t = Math.max(0, Math.min(95, Math.round(Number(target) || 0)));
            if (t > pct) {
                pct = t;
                setLeaderboardLoadingProgress(pct);
            }
        },
        done() {
            clearInterval(intervalId);
            pct = 100;
            setLeaderboardLoadingProgress(100);
        },
        stop() {
            clearInterval(intervalId);
        }
    };
}

// في ملف main.js - استبدل دالة loadLeaderboard بالكامل

// 1. دالة تحميل لوحة المتصدرين (مع جلب البيانات الحية لبطل الشهر)
async function loadLeaderboard() {
    const container = getEl('leaderboard-list');
    const loading = getEl('leaderboard-loading');

    // ✅ إذا كان المستخدم كضيف (زائر): نعرض رسالة تسجيل الدخول بدل رسالة الخطأ
    try {
        if (typeof isGuestMode === 'function' && isGuestMode()) {
            if (loading) loading.classList.add('hidden');
            if (container) {
                container.classList.remove('hidden');
                container.innerHTML = `<div class="text-center text-amber-300 mt-6 font-bold">قم بتسجيل الدخول لعرض المتصدرين</div>`;
            }
            return;
        }
    } catch (_) {}

    // عرض التحميل + شريط التقدم
    let progressCtl = null;
    try { progressCtl = startLeaderboardLoadingProgress(); } catch (_) {}

    if (loading) loading.classList.remove('hidden');
    if (container) {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
    renderSkeleton('leaderboard', 6);

    try {
        if (progressCtl && progressCtl.bumpTo) progressCtl.bumpTo(12);

        const currentMonthKey = getCurrentMonthKey();
        const lastMonthKey = getLastMonthKey();

        if (progressCtl && progressCtl.bumpTo) progressCtl.bumpTo(28);

        // --- جلب بطل الشهر الماضي ---
        const winnerRef = doc(db, "winners", lastMonthKey);
let winnerDoc = await getDoc(winnerRef);
let lastMonthWinner = null;

if (!winnerDoc.exists()) {
    try {
        await saveMonthlyWinner(lastMonthKey);
        winnerDoc = await getDoc(winnerRef);
    } catch (e) {
        console.error("Auto create monthly winner failed:", e);
    }
}
        if (progressCtl && progressCtl.bumpTo) progressCtl.bumpTo(45);

        if (winnerDoc.exists()) {
            const savedWinnerData = winnerDoc.data();

            // محاولة جلب البيانات الحية (الصورة والإطار الحاليين)
            try {
                if (savedWinnerData.userId) {
                    const liveUserDoc = await getDoc(doc(db, "users", savedWinnerData.userId));
                    if (liveUserDoc.exists()) {
                        const liveData = liveUserDoc.data();
                        // دمج البيانات: السكور من السجل القديم، والصورة والإطار من السجل الحي
                        lastMonthWinner = {
                            ...savedWinnerData,
                            username: liveData.username || savedWinnerData.username,
                            customAvatar: liveData.customAvatar,
                            equippedFrame: liveData.equippedFrame || 'default'
                        };
                    } else {
                        lastMonthWinner = savedWinnerData; // المستخدم غير موجود، نستخدم البيانات القديمة
                    }
                } else {
                    lastMonthWinner = savedWinnerData;
                }
            } catch (err) {
                console.error("Error fetching live winner data:", err);
                lastMonthWinner = savedWinnerData;
            }
        }

        if (progressCtl && progressCtl.bumpTo) progressCtl.bumpTo(65);

        // --- جلب المتصدرين لهذا الشهر ---
        const q = query(collection(db, "users"), where("monthlyStats.key", "==", currentMonthKey), orderBy("monthlyStats.correct", "desc"), limit(20));
        const s = await getDocs(q);

        if (progressCtl && progressCtl.bumpTo) progressCtl.bumpTo(90);
        if (progressCtl && progressCtl.done) progressCtl.done();

        // إخفاء التحميل وإظهار القائمة
        if (loading) loading.classList.add('hidden');
        if (container) container.classList.remove('hidden');
        container.innerHTML = ''; // تنظيف الهيكل العظمي (Skeleton)

        // رسم بطل الشهر الماضي (إذا وجد)
        if (lastMonthWinner) {
            renderLastMonthWinner(lastMonthWinner, container);
        }

        // رسم بقية القائمة
        if (s.empty) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = "text-center text-slate-400 py-10 bg-slate-800/30 rounded-2xl border border-dashed border-slate-700 mt-4";
            emptyMsg.innerHTML = `
                <span class="material-symbols-rounded text-4xl block mb-2 opacity-20">emoji_events</span>
                <p>بداية شهر جديد!<br>كن أول المنافسين في القائمة.</p>
            `;
            container.appendChild(emptyMsg);
        } else {
            const statusUpdates = {};
            const statusRef = ref(rtdb, 'status');
            // جلب حالة الاتصال مرة واحدة
            onValue(statusRef, (snapshot) => {
                 snapshot.forEach((child) => {
                     statusUpdates[child.key] = child.val();
                 });
                 renderLeaderboardList(s.docs, container, statusUpdates);
            }, { onlyOnce: true });
        }
    } catch(e) {
        console.error("Leaderboard Error:", e);

        if (progressCtl && progressCtl.stop) progressCtl.stop();
        if (loading) loading.classList.add('hidden');

        const errCode = (e && e.code) ? String(e.code) : '';
        const permissionDenied = errCode.includes('permission') || errCode.includes('auth');
        const guestNow = (typeof isGuestMode === 'function' && isGuestMode());

        if (guestNow || permissionDenied) {
            if (container) {
                container.classList.remove('hidden');
                container.innerHTML = `<div class="text-center text-amber-300 mt-6 font-bold">قم بتسجيل الدخول لعرض المتصدرين</div>`;
            }
        } else {
            if (container) container.innerHTML = `<div class="text-center text-red-400 mt-4">خطأ في التحميل، تأكد من الاتصال</div>`;
        }
    }
}

// دالة رسم بطاقة بطل الشهر (تصميم مضغوط + لون بنفسجي ملكي مميز)
function renderLastMonthWinner(winner, container) {
    const avatarHtml = getAvatarHTML(winner.customAvatar, winner.equippedFrame || 'default', "w-full h-full");

    const winnerHtml = `
        <div class="last-month-winner-card relative overflow-hidden rounded-xl border border-purple-500/50 bg-gradient-to-br from-indigo-950 via-purple-900/60 to-indigo-950 p-2 mb-4 shadow-[0_4px_15px_rgba(168,85,247,0.25)] animate-fade-in group">
            
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.15),transparent_70%)]"></div>
            
            <div class="absolute -bottom-4 -left-4 rotate-12 opacity-10">
                <span class="material-symbols-rounded text-6xl text-purple-200">military_tech</span>
            </div>

            <div class="relative z-10 flex items-center gap-2">
                
                <div class="relative shrink-0">
                    <div class="w-12 h-12 rounded-full border border-purple-300/50 shadow-md flex items-center justify-center bg-black/40 ring-1 ring-amber-500/20">
                        ${avatarHtml}
                    </div>
                    <div class="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-b from-yellow-300 to-amber-600 rounded-full flex items-center justify-center shadow-sm z-20 border border-white/50">
                        <span class="material-symbols-rounded text-white text-[10px]">star</span>
                    </div>
                </div>

                <div class="flex-1 min-w-0 flex flex-col justify-center">
                    
                    <div class="flex justify-between items-center mb-1 px-1">
                        <h3 class="text-xs font-bold text-white truncate font-heading leading-none drop-shadow-md">${escapeHTML(winner.username || '')}</h3>
                        <span class="text-[8px] font-bold text-purple-200 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30 uppercase tracking-wide">بطل الشهر الماضي</span>
                    </div>

                    <div class="relative flex items-center justify-center gap-1 bg-black/30 rounded py-0.5 border border-purple-500/20 w-full shadow-inner">
                        <span class="material-symbols-rounded text-amber-400 text-sm">workspace_premium</span>
                        
                        <span class="text-lg font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-amber-500 font-mono leading-none pt-0.5">
                            ${formatNumberAr(winner.score)}
                        </span>
                        
                        <span class="text-[8px] text-purple-200/60 self-end mb-0.5">نقطة</span>
                    </div>

                </div>
            </div>
            
            <div class="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent"></div>
        </div>
    `;
    
    container.insertAdjacentHTML('afterbegin', winnerHtml);
}


function getLastMonthKey() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

let leaderboardTimerInterval = null;

function startLeaderboardResetTimer() {
    const timerContainer = document.getElementById('leaderboard-reset-timer');
    const timerDisplay = document.getElementById('reset-timer-display');
    if (!timerContainer || !timerDisplay) return;

    if (leaderboardTimerInterval) clearInterval(leaderboardTimerInterval);

    const updateTimer = () => {
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const diff = nextMonth - now;

        // التحقق إذا كان متبقي أقل من أسبوع (7 أيام * 24 ساعة * 60 دقيقة * 60 ثانية * 1000 مللي ثانية)
        const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
        
        if (diff <= oneWeekInMs) {
            timerContainer.classList.remove('hidden');
            
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            // التنسيق المطلوب: days:hours:minutes:seconds
            timerDisplay.textContent = `${days}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        } else {
            timerContainer.classList.add('hidden');
        }
    };

    updateTimer();
    leaderboardTimerInterval = setInterval(updateTimer, 1000);
}
function renderLeaderboardList(docs, container, statusUpdates) {
    // 1. جلب القالب
    const template = document.getElementById('leaderboard-row-template');
    const currentMonthKey = getCurrentMonthKey();
    let r = 1;
    
docs.forEach(doc => {
        const data = doc.data();
        const userId = doc.id;
        data.uid = data.uid || userId;
        data.userId = data.userId || userId;

        const ms = data.monthlyStats || {};
        const correctCount = (ms.key === currentMonthKey && ms.correct) ? ms.correct : 0;
        // 2. استنساخ القالب
        const clone = template.content.cloneNode(true);
        const row = clone.querySelector('.leaderboard-row');
        
        // ماسكات العناصر
        const rankEl = clone.querySelector('.rank-icon');
        const avatarBox = clone.querySelector('.player-avatar-container');
        const nameEl = clone.querySelector('.player-name');
        const levelEl = clone.querySelector('.player-level-badge');
        const scoreEl = clone.querySelector('.player-score');
        const statusDot = clone.querySelector('.status-dot');
        const statusText = clone.querySelector('.status-text');
        const titleEl = clone.querySelector('.player-title');

        // 3. تعبئة البيانات الأساسية
        nameEl.textContent = data.username;
        if (titleEl) {
            const tId = (data && typeof data.equippedTitleBadge === 'string') ? data.equippedTitleBadge : '';
            if (tId && tId.includes('_lvl')) {
                const [baseId, lvlPart] = tId.split('_lvl');
                const bObj = (typeof badgesMap !== 'undefined') ? badgesMap[baseId] : null;
                const lvlNum = parseInt(lvlPart) || 1;
                const lvlObj = (bObj && Array.isArray(bObj.levels)) ? bObj.levels.find(l => Number(l.id) === Number(lvlNum)) : null;
                const c = lvlObj ? lvlObj.color : '';
                let cls = 'text-slate-500';
                if (c === 'bronze') cls = 'text-amber-700';
                else if (c === 'silver') cls = 'text-slate-300';
                else if (c === 'gold') cls = 'text-amber-400';
                else if (c === 'diamond') cls = 'text-cyan-400';
                else if (c === 'legendary') cls = 'text-red-600';
                titleEl.textContent = bObj ? bObj.name : '';
                titleEl.className = `player-title block text-[10px] font-bold leading-none mt-0.5 ${cls}`;
                if (titleEl.textContent) titleEl.classList.remove('hidden'); else titleEl.classList.add('hidden');
            } else {
                titleEl.textContent = '';
                titleEl.classList.add('hidden');
            }
        }
        if (levelEl) {
            const totalCorrect = (data && data.stats) ? data.stats.totalCorrect : 0;
            const levelNum = (typeof computePlayerLevelProgress === 'function') ? computePlayerLevelProgress(totalCorrect).level : 1;
            levelEl.textContent = formatNumberAr(levelNum);
        }
        scoreEl.textContent = formatNumberAr(correctCount);

        const nameLen = (data.username || "").length;
        if (nameLen > 25) nameEl.classList.add('text-[10px]', 'leading-tight'); 
        else if (nameLen > 18) nameEl.classList.add('text-xs'); 
        else nameEl.classList.add('text-lg');

        // ==========================================
        // 🔙 العودة للكود الأصلي (بدون حركة) 🔙
        // ==========================================
        
        // تنظيف الستايل
        // row.style.cssText = ''; 

        // 1. تعيين الكلاسات الأساسية
        row.className = `leaderboard-row flex justify-between items-center p-4 mb-3 rounded-2xl border transition transform hover:scale-[1.01] cursor-pointer group relative`;
        row.classList.add('lb-row');
        let medalHtml = ``;

        // 2. منطق الألوان (بدون inline)
        if (r <= 3) {
            // === الثلاثة الأوائل ===
            row.classList.add('lb-rank-top');

            if (r === 1) {
                // الأول
                medalHtml = ''; 
                row.classList.add('lb-rank-1');
            } 
            else if (r === 2) {
                // الثاني
                medalHtml = '';
                row.classList.add('lb-rank-2');
            }
            else if (r === 3) {
                // الثالث
                medalHtml = '';
                row.classList.add('lb-rank-3');
            }

        } else {
            // === باقي المتنافسين ===
            row.classList.add('lb-rank-default');
        }

        rankEl.innerHTML = medalHtml;

        // إكمال باقي الكود (الأفاتار والحالة) كما هو...
        const pFrame = data.equippedFrame || 'default';
        avatarBox.insertAdjacentHTML('afterbegin', getAvatarHTML(data.customAvatar, pFrame, "w-10 h-10"));

        const userStatus = statusUpdates[userId];
        const isOnline = userStatus && userStatus.state === 'online';
        
        if (isOnline) {
            statusDot.className = "status-dot w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse inline-block";
            statusText.className = "status-text text-[9px] text-green-400 font-bold leading-none pt-0.5";
            statusText.textContent = "نشط الآن";
        } else if (userStatus && userStatus.last_changed) {
            const timeDiff = Date.now() - userStatus.last_changed;
            let timeAgo = "منذ لحظات";
            if (timeDiff > 86400000) timeAgo = `منذ ${formatNumberAr(Math.floor(timeDiff / 86400000))} يوم`;
            else if (timeDiff > 3600000) timeAgo = `منذ ${formatNumberAr(Math.floor(timeDiff / 3600000))} ساعة`;
            else if (timeDiff > 60000) timeAgo = `منذ ${formatNumberAr(Math.floor(timeDiff / 60000))} دقيقة`;

            statusDot.className = "status-dot w-2 h-2 rounded-full bg-slate-500 opacity-50 inline-block";
            statusText.className = "status-text text-[9px] text-slate-500 opacity-80 leading-none pt-0.5";
            statusText.textContent = timeAgo;
        } else {
            statusDot.className = "status-dot w-2 h-2 rounded-full bg-slate-600 opacity-30 inline-block";
            statusText.className = "status-text text-[9px] text-slate-600 opacity-50 leading-none pt-0.5";
            statusText.textContent = "غير متاح";
        }

        row.onclick = () => showPlayerProfile(data);
        container.appendChild(clone);
        r++;
    });
}
function showPlayerProfile(data) {
    // 1. تحديث البيانات الأساسية (الاسم والنقاط)
    getEl('popup-player-name').textContent = data.username;

    const totalCorrect = (data && data.stats) ? data.stats.totalCorrect : 0;
    const p = (typeof computePlayerLevelProgress === 'function') ? computePlayerLevelProgress(totalCorrect) : { level: 1, percent: 0, remaining: 0 };
    const fmt = (n) => (typeof formatNumberAr === 'function') ? formatNumberAr(n) : String(n);

    const lvlEl = getEl('popup-player-level-number');
    const fillEl = getEl('popup-player-level-progress-fill');
    const txtEl = getEl('popup-player-level-progress-text');

    if (lvlEl) lvlEl.textContent = fmt(p.level);
    if (fillEl) fillEl.style.width = `${p.percent}%`;
    if (txtEl) txtEl.textContent = `%${fmt(p.percent)} • المتبقي: ${fmt(p.remaining)}`;

    // 2. تحديث صورة الأفاتار
    if (data.customAvatar) {
        getEl('popup-player-img').src = data.customAvatar;
        show('popup-player-img');
        hide('popup-player-icon');
    } else {
        hide('popup-player-img');
        show('popup-player-icon');
    }

    // 3. تجهيز حاوية الأوسمة
    const bContainer = getEl('popup-player-badges');
    bContainer.innerHTML = '';
    bContainer.className = 'grid grid-cols-3 gap-4 justify-items-center max-h-60 overflow-y-auto p-4 scrollbar-thin';

    // 4. تجهيز صندوق الوصف (إذا لم يكن موجوداً)
    let descBox = document.getElementById('profile-badge-desc-box');
    if (!descBox) {
        descBox = document.createElement('div');
        descBox.id = 'profile-badge-desc-box';
        descBox.className = 'mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700 text-center min-h-[4rem] flex items-center justify-center w-full';
        bContainer.parentNode.appendChild(descBox);
    }
    descBox.innerHTML = '<p class="text-xs text-slate-500 animate-pulse">اضغط على أي وسام لمعرفة قصته</p>';

    // 5. معالجة الأوسمة
    if (data.badges && data.badges.length > 0) {
        // تصفية الأوسمة لأخذ أعلى مستوى فقط لكل نوع
        const bestBadges = {};
        data.badges.forEach(bid => {
            if (bid === 'beginner') return;
            const [baseId, lvlPart] = bid.split('_lvl');
            const level = parseInt(lvlPart) || 1;
            
            if (!bestBadges[baseId] || level > bestBadges[baseId].level) {
                bestBadges[baseId] = { id: bid, baseId: baseId, level: level };
            }
        });

        const finalBadges = Object.values(bestBadges);

        if (finalBadges.length === 0) {
            bContainer.innerHTML = '<span class="col-span-3 text-xs text-slate-500 py-6">لم يحصل هذا اللاعب على أوسمة خاصة بعد.</span>';
        } else {
            const tpl = document.getElementById('mini-badge-template');
            
            finalBadges.forEach(item => {
                const bObj = badgesMap[item.baseId];
                if (bObj) {
                    // تحديد الألوان والمؤثرات حسب المستوى
                    let tierName = 'برونزي';
                    let ringFxClass = '';
                    let starColorClass = 'text-amber-700'; // برونزي افتراضي

                    if (item.level === 2) {
                        tierName = 'فضي';
                        ringFxClass = 'badge-ring-silver';
                        starColorClass = 'text-slate-300';
                    } else if (item.level === 3) {
                        tierName = 'ذهبي';
                        ringFxClass = 'badge-ring-gold';
                        starColorClass = 'text-amber-400';
                    } else if (item.level === 4) {
                        tierName = 'ماسي';
                        ringFxClass = 'badge-ring-diamond';
                        starColorClass = 'text-cyan-400';
                    } else if (item.level === 5) {
                        tierName = 'أسطوري';
                        ringFxClass = 'badge-ring-legendary';
                        starColorClass = 'text-red-600';
                    }

                    // استنساخ القالب وتعبئة البيانات
                    const clone = tpl.content.cloneNode(true);
                    const ring = clone.querySelector('.badge-ring');
                    
                    // استبدال الصورة بالأيقونة (النجمة)
                    const iconEl = clone.querySelector('.badge-icon');
                    iconEl.textContent = 'star';
                    iconEl.className = `badge-icon material-symbols-rounded text-3xl ${starColorClass}`;

                    const name = clone.querySelector('.badge-name');
                    const tier = clone.querySelector('.badge-tier');
                    const root = clone.querySelector('.mini-badge');

                    name.textContent = bObj.name;
                    tier.textContent = `(${tierName})`;
                    tier.className = `badge-tier block text-[9px] font-mono mt-0.5 opacity-80 ${starColorClass}`;
                    if (ringFxClass) ring.classList.add(ringFxClass);

                    // إضافة حدث النقر لعرض التفاصيل
                    root.onclick = () => {
                        const allRings = bContainer.querySelectorAll('.badge-ring');
                        allRings.forEach(r => r.classList.remove('badge-ring-selected'));
                        ring.classList.add('badge-ring-selected');
                        descBox.innerHTML = `<div class="fade-in"><strong class="text-amber-400 text-xs block mb-1 border-b border-amber-500/20 pb-1 mx-auto w-fit">${bObj.name}</strong><p class="text-xs text-slate-200 leading-relaxed"><span class="text-green-400 font-bold">"${bObj.desc}"</span></p></div>`;
                        playSound('click');
                    };
                    
                    bContainer.appendChild(clone);
                }
            });
        }
    } else {
        bContainer.innerHTML = '<span class="col-span-3 text-xs text-slate-500 py-6">لا توجد أوسمة مكتسبة.</span>';
    }

    // 6. منطق زر التحدي
    const challengeContainer = getEl('challenge-btn-container');
    if (challengeContainer) {
        const isMe = (effectiveUserId && data.uid === effectiveUserId);
        const isGuest = (typeof isGuestMode === 'function' && isGuestMode());
        const isHidden = (data.privacy && data.privacy.hideOnlineStatus);
        
        // لا يظهر الزر إذا كان اللاعب هو نفسه، أو في وضع الضيف، أو الخصم مخفي
        if (isMe || isGuest || isHidden) {
            challengeContainer.classList.add('hidden');
        } else {
            challengeContainer.classList.remove('hidden');
            // تخزين بيانات الخصم للوصول إليها عند الضغط على الزر
            getEl('btn-challenge-friend').onclick = () => {
                if (typeof openChallengeSetup === 'function') {
                    openChallengeSetup(data);
                }
            };
        }
    }

    // 7. فتح النافذة المنبثقة
    openModal('player-profile-modal');
}

bind('nav-favs', 'click', () => {
    openModal('fav-modal');
    const l = getEl('fav-list');
    l.innerHTML = '';

    if (!userProfile.favorites || userProfile.favorites.length === 0) {
        l.innerHTML = '<div class="flex flex-col items-center justify-center py-10 opacity-50"><span class="material-symbols-rounded text-4xl mb-2">favorite_border</span><p class="text-xs">لا توجد أسئلة مفضلة</p></div>';
        return;
    }

    const tpl = document.getElementById('fav-item-template');
    userProfile.favorites.forEach((f, i) => {
        const clone = tpl.content.cloneNode(true);
        const item = clone.querySelector('.fav-item');
        const qEl = clone.querySelector('.fav-q');
        const aEl = clone.querySelector('.fav-a');

        if (qEl) qEl.textContent = f.question;

        // عرض نص الإجابة بشكل مختصر في القائمة
        const ansText = (Array.isArray(f.options) && typeof f.correctAnswer === 'number' && f.options[f.correctAnswer] != null)
            ? String(f.options[f.correctAnswer])
            : (f.type === 'enrichment' ? 'معلومة إثرائية' : '—');
        if (aEl) aEl.textContent = `الإجابة: ${ansText}`;

        // فتح نافذة التفاصيل عند الضغط على العنصر
        if (item) {
            item.classList.add('cursor-pointer');
            item.onclick = () => openFavDetailModal(f);
        }

        // زر الحذف (مع منع فتح التفاصيل عند الضغط عليه)
        const btn = clone.querySelector('.fav-del-btn');
        btn.onclick = async (e) => {
            try {
                e && e.preventDefault && e.preventDefault();
                e && e.stopPropagation && e.stopPropagation();
            } catch (_) {}

            userProfile.favorites.splice(i, 1);
            try {
                await updateDoc(doc(db, "users", effectiveUserId), { favorites: userProfile.favorites });
                toast("تم الحذف");
                getEl('nav-favs').click();
            } catch (err) {
                toast("خطأ", "error");
            }
        };

        l.appendChild(clone);
    });
});

bind('nav-mistakes', 'click', () => { toggleMenu(false); getEl('review-mistakes-btn').click(); });
bind('nav-settings', 'click', () => { toggleMenu(false); openModal('settings-modal'); });
bind('nav-privacy', 'click', () => { toggleMenu(false); openModal('privacy-modal'); });

bind('privacy-hide-online-toggle', 'change', async (e) => {
    if (!userProfile) return;
    const v = !!(e && e.target && e.target.checked);
    if (!userProfile.privacy) userProfile.privacy = {};
    userProfile.privacy.hideOnlineStatus = v;

    if (typeof isGuestMode === 'function' && isGuestMode()) {
        try { scheduleGuestSave(true); } catch (_) {}
    } else {
        try { await updateDoc(doc(db, "users", effectiveUserId), { 'privacy.hideOnlineStatus': v }); } catch (_) {}
    }

    try { setupPresenceSystem(); } catch (_) {}
});
// التغيير يحدث عند ترك الزر لتقليل الوميض
// --- تحسين منطق تغيير حجم الخط وحفظه ---

// --- كود التحكم بحجم الخط (المحسن) ---

// 1. عند تحميل التطبيق: استعادة الحجم وتحديث الرقم
const savedFontSize = localStorage.getItem('app_font_size');
if (savedFontSize) {
    document.documentElement.style.setProperty('--base-size', savedFontSize + 'px');
    const slider = getEl('font-size-slider');
    const numDisplay = getEl('font-size-number');
    const preview = getEl('font-size-preview');
    
    if (slider) slider.value = savedFontSize;
    if (numDisplay) numDisplay.textContent = savedFontSize; // تحديث الرقم عند التحميل
    if (preview) preview.style.fontSize = `var(--base-size)`;
}

// 2. عند تحريك الشريط (تحديث فوري للنص والرقم)
bind('font-size-slider', 'input', (e) => {
    const newVal = e.target.value;
    
    // تطبيق الحجم
    document.documentElement.style.setProperty('--base-size', newVal + 'px');
    
    // تحديث الرقم الظاهر للمستخدم
    const numDisplay = getEl('font-size-number');
    if (numDisplay) numDisplay.textContent = newVal;

    // تحديث المعاينة داخل الإعدادات
    const preview = getEl('font-size-preview');
    if (preview) preview.style.fontSize = `var(--base-size)`;
    
    // حفظ في الذاكرة
    localStorage.setItem('app_font_size', newVal);
});


const handleLogout = () => { 
    window.showConfirm(
        "تسجيل الخروج",
        "هل أنت متأكد من رغبتك في تسجيل الخروج؟",
        "logout",
        async () => {

            // ✅ إذا كان المستخدم في وضع الضيف: ألغِ جلسة الضيف ثم اذهب لشاشة تسجيل الدخول
            if (isGuestMode()) {
                try { scheduleGuestSave(true); } catch (_) {}          // حفظ آخر تغييرات الضيف (بدون حذفها)
                try { setGuestSessionActive(false); } catch (_) {}     // إزالة hn_guest_session_active_v1 فقط
                try { isGuest = false; } catch (_) {}
                try { currentUser = null; effectiveUserId = null; } catch (_) {}
                try { toggleMenu(false); } catch (_) {}

                // إظهار واجهة تسجيل الدخول فوراً (ثم إعادة تحميل لضمان تصفير الحالة)
                try {
                    hide('bottom-nav');
                    show('login-area');
                    show('login-view');
                    hide('register-view');
                    hide('auth-loading');
                } catch (_) {}

                setTimeout(() => { try { location.reload(); } catch (_) {} }, 50);
                return;
            }

            // ✅ حساب مسجّل: SignOut مع مهلة أمان لتجنب أي تعليق
            try {
                await Promise.race([
                    signOutUser(),
                    new Promise(resolve => setTimeout(resolve, 1500))
                ]);
            } catch (_) {}

            location.reload();
        }
    );
};


bind('logout-btn', 'click', handleLogout);
bind('logout-btn-menu', 'click', handleLogout);


