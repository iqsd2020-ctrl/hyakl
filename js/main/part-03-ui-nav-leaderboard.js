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
// ✅ إصلاح أزرار الإغلاق (Global Close Handler)
// ==========================================
document.addEventListener('click', (e) => {
    // التحقق مما إذا كان العنصر المضغوط هو زر إغلاق (أو داخله)
    const closeBtn = e.target.closest('.close-modal');

    if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();

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

// في ملف main.js - استبدل دالة loadLeaderboard بالكامل

// 1. دالة تحميل لوحة المتصدرين (مع جلب البيانات الحية لبطل الشهر)
async function loadLeaderboard() {
    const container = getEl('leaderboard-list');
    const loading = getEl('leaderboard-loading');
    
    // عرض التحميل
    if (loading) loading.classList.remove('hidden');
    if (container) {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
    renderSkeleton('leaderboard', 6);

    try {
        const currentMonthKey = getCurrentMonthKey();
        const lastMonthKey = getLastMonthKey();

        // --- جلب بطل الشهر الماضي ---
        const winnerDoc = await getDoc(doc(db, "winners", lastMonthKey));
        let lastMonthWinner = null;

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

        // --- جلب المتصدرين لهذا الشهر ---
        const q = query(collection(db, "users"), where("monthlyStats.key", "==", currentMonthKey), orderBy("monthlyStats.correct", "desc"), limit(20));
        const s = await getDocs(q);

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
        if (container) container.innerHTML = `<div class="text-center text-red-400 mt-4">خطأ في التحميل، تأكد من الاتصال</div>`;
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

        const ms = data.monthlyStats || {};
        const correctCount = (ms.key === currentMonthKey && ms.correct) ? ms.correct : 0;

        // 2. استنساخ القالب
        const clone = template.content.cloneNode(true);
        const row = clone.querySelector('.leaderboard-row');
        
        // ماسكات العناصر
        const rankEl = clone.querySelector('.rank-icon');
        const avatarBox = clone.querySelector('.player-avatar-container');
        const nameEl = clone.querySelector('.player-name');
        const scoreEl = clone.querySelector('.player-score');
        const statusDot = clone.querySelector('.status-dot');
        const statusText = clone.querySelector('.status-text');

        // 3. تعبئة البيانات الأساسية
        nameEl.textContent = data.username;
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
        row.className = `leaderboard-row flex justify-between items-center p-3 mb-3 rounded-xl border-2 transition transform hover:scale-[1.01] cursor-pointer group relative`;
        row.classList.add('lb-row');
        let medalHtml = `<span class="text-slate-500 font-mono font-bold text-sm w-6 text-center">#${formatNumberAr(r)}</span>`;

        // 2. منطق الألوان (بدون inline)
        if (r <= 3) {
            // === الثلاثة الأوائل ===
            row.classList.add('lb-rank-top');

            if (r === 1) {
                // الأول
                medalHtml = '<span class="material-symbols-rounded text-amber-400">emoji_events</span>'; 
                row.classList.add('lb-rank-1');
            } 
            else if (r === 2) {
                // الثاني
                medalHtml = '<span class="material-symbols-rounded text-slate-300">military_tech</span>';
                row.classList.add('lb-rank-2');
            }
            else if (r === 3) {
                // الثالث
                medalHtml = '<span class="material-symbols-rounded text-orange-700">military_tech</span>';
                row.classList.add('lb-rank-3');
            }

        } else {
            // === باقي المتنافسين ===
            row.classList.add('lb-rank-default');
        }

        rankEl.innerHTML = medalHtml;

        // إكمال باقي الكود (الأفاتار والحالة) كما هو...
        const pFrame = data.equippedFrame || 'default';
        avatarBox.innerHTML = getAvatarHTML(data.customAvatar, pFrame, "w-10 h-10");

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
    getEl('popup-player-score').textContent = `${formatNumberAr(Number(data.balance ?? data.highScore ?? 0))} نقطة`;

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

    // 6. فتح النافذة المنبثقة
    openModal('player-profile-modal');
}

bind('nav-favs','click',()=>{openModal('fav-modal');const l=getEl('fav-list');l.innerHTML='';if(!userProfile.favorites||userProfile.favorites.length===0){l.innerHTML='<div class="flex flex-col items-center justify-center py-10 opacity-50"><span class="material-symbols-rounded text-4xl mb-2">favorite_border</span><p class="text-xs">لا توجد أسئلة مفضلة</p></div>';return}const tpl=document.getElementById('fav-item-template');userProfile.favorites.forEach((f,i)=>{const clone=tpl.content.cloneNode(true);clone.querySelector('.fav-q').textContent=f.question;clone.querySelector('.fav-a').textContent=`الإجابة: ${f.options[f.correctAnswer]}`;const btn=clone.querySelector('.fav-del-btn');btn.onclick=async()=>{userProfile.favorites.splice(i,1);try{await updateDoc(doc(db,"users",effectiveUserId),{favorites:userProfile.favorites});toast("تم الحذف");getEl('nav-favs').click()}catch(e){toast("خطأ","error")}};l.appendChild(clone)})});

bind('nav-mistakes', 'click', () => { toggleMenu(false); getEl('review-mistakes-btn').click(); });
bind('nav-settings', 'click', () => { toggleMenu(false); openModal('settings-modal'); });
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


