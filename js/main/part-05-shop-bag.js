// ==========================================
// 🛍️ نظام المتجر والحقيبة الجديد (Zero-Flicker)
// ==========================================

let isBagSystemInitialized = false;
let bagPrevViews = [];
let bagPrevBottomNavHidden = false;

function openBag() {
    toggleMenu(false);

    // 1. التهيئة لمرة واحدة فقط (بناء الهيكل)
    if (!isBagSystemInitialized) {
        initBagSystem();
        isBagSystemInitialized = true;
    }

    // 2. تحديث الحالة فقط (سريع جداً ولا يسبب وميض)
    updateBagState();

    // 3. فتح صفحة الحقيبة/المتجر
    const bagEl = getEl('bag-modal');
    if (!bagEl || !bagEl.classList.contains('hidden')) return;

    try { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); } catch (_) {}

    bagPrevViews = [];
    const viewsToHide = ['welcome-area','quiz-proper','results-area','login-area','auth-loading','achievements-view','leaderboard-view'];

    viewsToHide.forEach(id => {
        const el = getEl(id);
        if (el && !el.classList.contains('hidden')) bagPrevViews.push(id);
        hide(id);
    });

    bagPrevBottomNavHidden = getEl('bottom-nav')?.classList.contains('hidden');
    hide('bottom-nav');

    show('bag-modal');
    window.history.pushState({ view: 'bag' }, "", "");
}


window.closeBagPage = function(fromPopstate = false) {
    const bagEl = getEl('bag-modal');
    if (!bagEl || bagEl.classList.contains('hidden')) return;

    hide('bag-modal');

    try { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); } catch (_) {}

    if (Array.isArray(bagPrevViews) && bagPrevViews.length) {
        bagPrevViews.forEach(id => show(id));
    } else {
        try { navToHome(); } catch (_) {}
    }

    if (!bagPrevBottomNavHidden) show('bottom-nav');

    if (!fromPopstate) {
        if (window.history.state && window.history.state.view === 'bag') {
            window.history.back();
        }
    }
};

// دالة البناء الأولي (تعمل مرة واحدة فقط عند فتح التطبيق لأول مرة)
function initBagSystem() {
    // --- أ) بناء قسم الحقيبة (Inventory) ---
    // سنقوم بإنشاء بطاقة لكل إطار موجود في اللعبة، لكن سنخفي غير المملوك منها بالـ CSS
    const invContainer = getEl('inventory-view');
    // تنظيف الحاوية لضمان عدم التكرار
    const existingList = getEl('inv-frames-grid-new');
    if (existingList) existingList.remove();

    // إنشاء الشبكة
    const invGrid = document.createElement('div');
    invGrid.id = 'inv-frames-grid-new';
    invGrid.className = 'game-store-grid';

    // عنوان القسم
    const invHeader = document.createElement('h4');
    invHeader.className = "text-sm text-slate-400 mb-3 font-bold mt-4 border-t border-slate-700 pt-4";
    invHeader.textContent = "إطاراتي (اضغط للتجهيز)";
    invContainer.appendChild(invHeader);

    // إضافة كل الإطارات الممكنة للشبكة
    framesData.forEach(f => {
        const card = createGameItemCard(f, 'inventory');
        invGrid.appendChild(card);
    });
    invContainer.appendChild(invGrid);


    // --- ب) بناء قسم المتجر (Shop) ---
    const shopContainer = getEl('shop-view');
    const existingShopGrid = getEl('shop-frames-grid-new');
    if (existingShopGrid) existingShopGrid.remove();

    const shopGrid = document.createElement('div');
    shopGrid.id = 'shop-frames-grid-new';
    shopGrid.className = 'game-store-grid'; // نفس كلاس الشبكة
    // نستخدم grid-cols-2 للمتجر ليكون العرض أكبر قليلاً إذا أردت، أو نتركه موحد
    shopGrid.style.gridTemplateColumns = "repeat(2, 1fr)"; 

    const shopHeader = document.createElement('h4');
    shopHeader.className = "text-amber-400 text-sm font-bold mt-6 mb-3 flex items-center gap-1";
    shopHeader.innerHTML = `<span class="material-symbols-rounded">image</span> إطارات الأفاتار`;
    shopContainer.appendChild(shopHeader);

    // إضافة الإطارات (ما عدا الافتراضي) للمتجر
    framesData.forEach(f => {
        if (f.id === 'default') return;
        const card = createGameItemCard(f, 'shop');
        shopGrid.appendChild(card);
    });
    shopContainer.appendChild(shopGrid);
}

function createGameItemCard(fData,type){const tpl=document.getElementById('game-item-template');const clone=tpl.content.cloneNode(true);const btn=clone.querySelector('button');const prev=clone.querySelector('.item-preview');const name=clone.querySelector('.item-name');const act=clone.querySelector('.item-action');btn.id=`btn-${type}-${fData.id}`;prev.innerHTML=getAvatarHTML(userProfile.customAvatar,fData.id,"w-full h-full");name.textContent=fData.name;if(type==='shop'){act.innerHTML=`<span class="game-item-price text-[10px] bg-black/40 px-2 py-1 rounded text-amber-400 font-bold flex items-center gap-1 border border-white/5">${formatNumberAr(fData.price)} <span class="material-symbols-rounded text-[10px]">monetization_on</span></span>`}else{act.innerHTML='<div class="equip-badge hidden bg-green-500/20 p-1 rounded-full"><span class="material-symbols-rounded text-green-400 text-sm">check</span></div>'}btn.onclick=()=>{if(type==='inventory'){equipFrame(fData.id)}else{if(!btn.classList.contains('owned')){window.buyShopItem('frame',fData.price,fData.id)}}};return btn}


// دالة التحديث (تعمل عند كل فتح للحقيبة أو شراء)
function updateBagState() {
    // 1. تحديث النصوص (الرصيد والعدادات)
    getEl('bag-user-score').textContent = formatNumberAr(Number(userProfile.balance ?? userProfile.highScore ?? 0));
    const inv = userProfile.inventory;
    getEl('inv-lives-count').textContent = formatNumberAr(inv.lives || 0);       
    getEl('inv-fifty-count').textContent = formatNumberAr(inv.helpers.fifty || 0); 
    getEl('inv-hint-count').textContent = formatNumberAr(inv.helpers.hint || 0);   
    getEl('inv-skip-count').textContent = formatNumberAr(inv.helpers.skip || 0);

    const ownedFrames = userProfile.inventory.frames || ['default'];
    const currentFrame = userProfile.equippedFrame;

    // 2. تحديث عناصر الحقيبة (Inventory)
    framesData.forEach(f => {
        const btn = document.getElementById(`btn-inventory-${f.id}`);
        if (!btn) return;

        // أ) هل أملك هذا الإطار؟
        if (ownedFrames.includes(f.id)) {
            btn.classList.remove('game-item-hidden'); // إظهار
        } else {
            btn.classList.add('game-item-hidden'); // إخفاء
        }

        // ب) هل هو مجهز؟
        if (f.id === currentFrame) {
            btn.classList.add('equipped');
        } else {
            btn.classList.remove('equipped');
        }
        
        // تحديث صورة الأفاتار داخل الزر (في حال غير المستخدم صورته)
        const avatarContainer = btn.querySelector('.avatar-wrapper');
        if(avatarContainer) {
             avatarContainer.outerHTML = getAvatarHTML(userProfile.customAvatar, f.id, "w-10 h-10");
        }
    });

    // 3. تحديث عناصر المتجر (Shop)
    framesData.forEach(f => {
        if (f.id === 'default') return;
        const btn = document.getElementById(`btn-shop-${f.id}`);
        if (!btn) return;

        if (ownedFrames.includes(f.id)) {
            btn.classList.add('owned');
            // إخفاء السعر وإظهار "مملوك"
            const priceTag = btn.querySelector('.game-item-price');
            if(priceTag) {
                priceTag.textContent = 'مملوك';
            }
        } else {
            btn.classList.remove('owned');
        }
    });
}




// دالة التبديل بين التبويبات
function switchBagTab(tab) {
    const tInv = getEl('tab-inventory');
    const tShop = getEl('tab-shop');
    const vInv = getEl('inventory-view');
    const vShop = getEl('shop-view');

    if(tab === 'inventory') {
        tInv.classList.add('bg-amber-500', 'text-black'); tInv.classList.remove('bg-slate-700', 'text-slate-300');
        tShop.classList.remove('bg-amber-500', 'text-black'); tShop.classList.add('bg-slate-700', 'text-slate-300');
        show('inventory-view'); hide('shop-view');
    } else {
        tShop.classList.add('bg-amber-500', 'text-black'); tShop.classList.remove('bg-slate-700', 'text-slate-300');
        tInv.classList.remove('bg-amber-500', 'text-black'); tInv.classList.add('bg-slate-700', 'text-slate-300');
        hide('inventory-view'); show('shop-view');
    }
}

// دالة تجهيز الإطار
async function equipFrame(frameId) {
    userProfile.equippedFrame = frameId;
    updateProfileUI();
     updateBagState();  

    if (isGuestMode() || !effectiveUserId) {
        scheduleGuestSave(true);
        toast(`تم تجهيز: ${getFrameName(frameId)}`);
        playSound('click');
        return;
    }
    
    try {
        await updateDoc(doc(db, "users", effectiveUserId), {
            equippedFrame: frameId
        });
        toast(`تم تجهيز: ${getFrameName(frameId)}`);
        playSound('click');
    } catch(e) {
        console.error(e);
        toast("فشل حفظ التغيير", "error");
    }
}

window.buyShopItem = async function(type, cost, id=null) {
    if (Number(userProfile.balance ?? userProfile.highScore ?? 0) < cost) {
        toast("رصيدك غير كافٍ!", "error");
        playSound('lose');
        return;
    }

    window.showConfirm(
        "تأكيد الشراء", 
        `هل تريد دفع ${cost} نقطة؟`, 
        "key", 
        async () => {
            const prevBalance = Number(userProfile.balance ?? userProfile.highScore ?? 0);
            userProfile.balance = Math.max(0, prevBalance - cost);
            userProfile.highScore = userProfile.balance;
// ✅ التصحيح: جعلنا هذا الشرط هو الأول (if بدلاً من else if)
            if (type === 'frame') { 
                if(!userProfile.inventory.frames) userProfile.inventory.frames = [];
                userProfile.inventory.frames.push(id);
                toast("تم شراء الإطار بنجاح! ");
            } else if(type === 'life') {
                userProfile.inventory.lives++;
                toast("تم شراء قلب إضافي ");
            } else if(type === 'fifty') {
                userProfile.inventory.helpers.fifty++;
                toast("تم شراء مساعدة حذف اجابتين");
            } else if(type === 'hint') {
                userProfile.inventory.helpers.hint++;
                toast("تم شراء حذف اجابه");
            } else if(type === 'skip') {
                userProfile.inventory.helpers.skip++;
                toast("تم شراء تخطي");
            }

            if(!userProfile.stats) userProfile.stats = {};
            userProfile.stats.itemsBought = (userProfile.stats.itemsBought || 0) + 1;
            
            dq_updateQuestProgress(5, 1);

               try {
                if (isGuestMode()) {
                    playSound('win');
                    updateBagState();
                    updateProfileUI();
                    scheduleGuestSave(true);
                    let itemName = type === 'frame' ? 'إطار أفاتار' : 'عنصر';
                    addLocalNotification('عملية شراء 🛒', `تم شراء ${itemName} مقابل ${cost} نقطة`, 'shopping_bag');
                    setTimeout(async () => {
                        await checkAndUnlockBadges();
                    }, 500);
                    return;
                }

                await updateDoc(doc(db, "users", effectiveUserId), {
                    balance: userProfile.balance,
                    highScore: userProfile.balance,
                    inventory: userProfile.inventory,
                    "stats.itemsBought": userProfile.stats.itemsBought
                });
                playSound('win');
                
                // ✅ التغيير هنا: نستخدم دالة التحديث الجديدة
                updateBagState(); 
                
                updateProfileUI(); 
                 
                // إزالة ذكر الثيم من الإشعار
                let itemName = type === 'frame' ? 'إطار أفاتار' : 'عنصر';
                addLocalNotification('عملية شراء 🛒', `تم شراء ${itemName} مقابل ${cost} نقطة`, 'shopping_bag');

                setTimeout(async () => {
                    await checkAndUnlockBadges();
                }, 500);

            } catch(e) {
                console.error(e);
                toast("خطأ في الاتصال", "error");
            }
        }
    );
};


// ربط أزرار الحقيبة
bind('tab-inventory', 'click', () => switchBagTab('inventory'));
bind('tab-shop', 'click', () => switchBagTab('shop'));

// دالة التأكيد الموحدة
window.showConfirm = function(title, msg, icon, yesCallback) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    document.getElementById('confirm-icon').textContent = icon || 'help';

    // استنساخ الأزرار لإزالة الأحداث السابقة (لتجنب التكرار)
    const yesBtn = document.getElementById('btn-confirm-yes');
    const newYesBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

    const noBtn = document.getElementById('btn-confirm-no');
    const newNoBtn = noBtn.cloneNode(true);
    noBtn.parentNode.replaceChild(newNoBtn, noBtn);

    newYesBtn.onclick = () => {
        modal.classList.remove('active');
        if(yesCallback) yesCallback();
    };
    newNoBtn.onclick = () => {
        modal.classList.remove('active');
    };

    modal.classList.add('active');
};


function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }



function launchConfetti() { const canvas = getEl('confetti-canvas'); const ctx = canvas.getContext('2d'); canvas.width = window.innerWidth; canvas.height = window.innerHeight; let particles = []; for(let i=0; i<100; i++) particles.push({x:Math.random()*canvas.width, y:Math.random()*canvas.height-canvas.height, c:['#fbbf24','#f59e0b','#ffffff'][Math.floor(Math.random()*3)], s:Math.random()*5+2, v:Math.random()*5+2}); function draw() { ctx.clearRect(0,0,canvas.width,canvas.height); particles.forEach(p => { ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,p.s,0,Math.PI*2); ctx.fill(); p.y+=p.v; if(p.y>canvas.height) p.y=-10; }); requestAnimationFrame(draw); } draw(); setTimeout(()=>canvas.width=0, 5000); }

// ربط أزرار تسجيل الدخول والتسجيل الجديدة (بريد إلكتروني)
bind('email-login-btn', 'click', async () => {
    const emailInput = getEl('login-email-input');
    const passInput  = getEl('login-password-input');
    const errEl      = getEl('login-error-message');
    const btnEl      = getEl('email-login-btn');
    const email    = emailInput ? emailInput.value.trim() : '';
    const password = passInput ? passInput.value.trim() : '';
    if (!email || !password) {
        if (errEl) errEl.textContent = 'أدخل البريد وكلمة المرور';
        return;
    }
    if (btnEl) {
        const originalHtml = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.innerHTML = '<span class="material-symbols-rounded animate-spin">settings</span> جاري التحقق...';
        try {
            await emailLogin(email, password);
        } catch (e) {
            console.error(e);
            if (errEl) errEl.textContent = e?.message || 'خطأ في تسجيل الدخول';
        } finally {
            btnEl.disabled = false;
            btnEl.innerHTML = originalHtml;
        }
    }
});

bind('email-register-btn', 'click', async () => {
    const nameInput    = getEl('reg-displayName-input');
    const emailInput   = getEl('reg-email-input');
    const passInput    = getEl('reg-password-input');
    const confirmInput = getEl('reg-confirm-password-input');
    const errEl        = getEl('register-error-message');
    const btnEl        = getEl('email-register-btn');
    const displayName = nameInput ? nameInput.value.trim() : '';
    const email       = emailInput ? emailInput.value.trim() : '';
    const password    = passInput ? passInput.value.trim() : '';
    const confirm     = confirmInput ? confirmInput.value.trim() : '';
    if (!displayName || !email || !password) {
        if (errEl) errEl.textContent = 'املأ جميع الحقول';
        return;
    }
    if (password.length < 4) {
        if (errEl) errEl.textContent = 'كلمة المرور قصيرة جداً';
        return;
    }
    if (password !== confirm) {
        if (errEl) errEl.textContent = 'كلمتا المرور غير متطابقتين';
        return;
    }
    if (btnEl) {
        const originalHtml = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.innerHTML = '<span class="material-symbols-rounded animate-spin">settings</span> جاري إنشاء الحساب...';
        try {
            await emailRegister(displayName, email, password);
        } catch (e) {
            console.error(e);
            if (errEl) errEl.textContent = e?.message || 'خطأ في إنشاء الحساب';
        } finally {
            btnEl.disabled = false;
            btnEl.innerHTML = originalHtml;
        }
    }
});

// زر تسجيل الدخول عبر Google

bind('google-login-btn', 'click', async () => {
    const btnEl = getEl('google-login-btn');
    const originalHtml = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<span class="material-symbols-rounded animate-spin">settings</span> جاري فتح Google...';
    }
    try {
        // 1) جرّب Popup أولاً (أكثر موثوقية على بعض المتصفحات التي تمنع تدفق Redirect)
        try {
            await startGoogleLoginPopup();
            return; // onAuthStateChanged سيتولى التوجيه
        } catch (e) {
            const code = e && e.code ? String(e.code) : '';
            // 2) إن أغلق المستخدم النافذة: نعتبرها إلغاء.
            if (code === 'auth/popup-closed-by-user') {
                toast('تم إلغاء تسجيل الدخول عبر Google.', 'error');
                return;
            }

            // 3) إن كان الـ Popup غير مدعوم/محجوب، نرجع إلى Redirect
            if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
                await startGoogleLoginRedirect();
                return;
            }
            // أخطاء أخرى: أظهرها مباشرة
            throw e;
        }
    } catch (e) {
        console.error('Google sign-in failed:', e && e.code ? e.code : e, e);
        toast(authErrorToArabic(e), 'error');
        try { sessionStorage.removeItem('__google_redirect_pending'); } catch (_) {}
        try { localStorage.removeItem('__google_redirect_pending'); } catch (_) {}
    } finally {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = originalHtml;
        }
    }
});

// دخول كضيف: لعب وحفظ النقاط داخل المتصفح فقط
bind('guest-login-btn', 'click', () => {
    enterGuestMode();
});
function updateAuthTabsUI() {
    const loginBtn = getEl('show-login-btn');
    const regBtn = getEl('show-register-btn');
    const loginView = getEl('login-view');
    const registerView = getEl('register-view');

    const isLoginActive = !!(loginView && !loginView.classList.contains('hidden'));
    const isRegActive = !!(registerView && !registerView.classList.contains('hidden'));

    const active = ['bg-gradient-to-r','from-amber-500','via-yellow-500','to-amber-600','text-slate-900','shadow-lg','border-white/20'];
    const inactive = ['bg-slate-900/60','text-slate-200','border-white/10'];

    const apply = (btn, makeActive) => {
        if (!btn) return;
        active.concat(inactive).forEach(c => btn.classList.remove(c));
        (makeActive ? active : inactive).forEach(c => btn.classList.add(c));
        btn.setAttribute('aria-pressed', makeActive ? 'true' : 'false');
    };

    if (!isLoginActive && !isRegActive) {
        apply(loginBtn, true);
        apply(regBtn, false);
        return;
    }

    apply(loginBtn, isLoginActive);
    apply(regBtn, isRegActive);
}
bind('show-register-btn', 'click', () => { hide('login-view'); show('register-view'); getEl('login-error-message').textContent=''; updateAuthTabsUI(); });
bind('show-login-btn', 'click', () => { hide('register-view'); show('login-view'); getEl('register-error-message').textContent=''; updateAuthTabsUI(); });
updateAuthTabsUI();
// ✅ أزرار نافذة الحظر
bind('btn-refresh-ban', 'click', async () => {
    if (banRefreshInProgress) return;
    banRefreshInProgress = true;
    const btn = getEl('btn-refresh-ban');
    const original = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-rounded animate-spin">sync</span> جارِ التحديث...`;
    }

    try {
        if (effectiveUserId) {
            await loadProfile(effectiveUserId);
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = original;
        }
        banRefreshInProgress = false;
    }
});

bind('btn-logout-ban', 'click', async () => {
    try {
        await signOutUser();
    } catch (e) {
        // تجاهل الأخطاء
    }
    location.reload();
});

bind('btn-marathon-start', 'click', () => { 
    // --- التحقق من بنك الأخطاء ---
    if (userProfile.wrongQuestionsBank && userProfile.wrongQuestionsBank.length > 0) {
        openModal('force-review-modal');
        return; // إيقاف الدالة
    }

    // فتح النافذة فقط دون تعطيل الأزرار الخلفية
    document.getElementById('marathon-rules-modal').classList.add('active'); 
});


bind('btn-marathon-confirm', 'click', startMarathon);

function showReviveModal() {
    let modal = document.getElementById('revive-modal');
    // إزالة النافذة القديمة لضمان تحديث النصوص
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'revive-modal';
    modal.className = 'modal-overlay';
    // لاحظ استخدام formatNumberAr لكل الأرقام في الأسعار والكميات
    modal.innerHTML = `
        <div class="modal-box border-2 border-red-500/50">
            <div class="text-center mb-6">
                <span class="material-symbols-rounded text-red-500 text-6xl animate-pulse">heart_broken</span>
                <h3 class="text-2xl font-bold text-white mt-2 font-heading">نفدت القلوب!</h3>
                <p class="text-slate-400 text-sm mt-2">لا تفقد تقدمك.. اشترِ قلوباً لإكمال هذه الجولة.</p>
            </div>
            <div class="bg-slate-800/50 p-3 rounded-xl mb-6 text-center border border-slate-700">
                <span class="text-xs text-slate-400 block">رصيدك الحالي</span>
                <span class="text-amber-400 font-bold text-xl font-heading flex justify-center items-center gap-1">
                    ${formatNumberAr(Number(userProfile.balance ?? userProfile.highScore ?? 0))} <span class="material-symbols-rounded text-sm">monetization_on</span>
                </span>
            </div>
            <div class="space-y-3">
                <button onclick="window.buyLives(1, 160)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
                    <div class="flex items-center gap-2"><span class="material-symbols-rounded text-red-500">favorite</span><span class="text-white font-bold">${formatNumberAr(1)} قلب</span></div>
                    <span class="text-amber-400 font-bold text-sm bg-black/20 px-2 py-1 rounded">${formatNumberAr(160)} نقطة</span>
                </button>
                <button onclick="window.buyLives(2, 280)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
                    <div class="flex items-center gap-2"><div class="flex"><span class="material-symbols-rounded text-red-500">favorite</span><span class="material-symbols-rounded text-red-500 -mr-2">favorite</span></div><span class="text-white font-bold">${formatNumberAr(2)} قلب</span></div>
                    <span class="text-amber-400 font-bold text-sm bg-black/20 px-2 py-1 rounded">${formatNumberAr(280)} نقطة <span class="text-[10px] text-green-400">(وفر ${formatNumberAr(10)})</span></span>
                </button>
                <button onclick="window.buyLives(3, 390)" class="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 p-3 rounded-xl flex justify-between items-center group transition">
                    <div class="flex items-center gap-2"><div class="flex"><span class="material-symbols-rounded text-red-500">favorite</span><span class="material-symbols-rounded text-red-500 -mr-2">favorite</span><span class="material-symbols-rounded text-red-500 -mr-2">favorite</span></div><span class="text-white font-bold">${formatNumberAr(3)} قلوب</span></div>
                    <span class="text-amber-400 font-bold text-sm bg-black/20 px-2 py-1 rounded">${formatNumberAr(390)} نقطة <span class="text-[10px] text-green-400">(وفر ${formatNumberAr(30)})</span></span>
                </button>
            </div>
            <div class="mt-6 border-t border-slate-700 pt-4">
                <button onclick="window.cancelRevive()" class="w-full text-slate-500 hover:text-red-400 text-sm transition">لا شكراً، إنهاء الجولة</button>
            </div>
        `;
    document.body.appendChild(modal);
    // ✅ صوت الخسارة عند ظهور واجهة الإنعاش (شراء القلوب)
    if (typeof playSound === 'function') playSound('result_loss');
    setTimeout(() => modal.classList.add('active'), 100);
}


window.buyLives = async function(amount, cost) {
    if (Number(userProfile.balance ?? userProfile.highScore ?? 0) < cost) {
        toast("رصيدك غير كافٍ للشراء!", "error");
        playSound('lose');
        return;
    }
    
    try {
        const prevBalance = Number(userProfile.balance ?? userProfile.highScore ?? 0);
        userProfile.balance = Math.max(0, prevBalance - cost);
        userProfile.highScore = userProfile.balance;
        if (!isGuestMode() && effectiveUserId) {
            await updateDoc(doc(db, "users", effectiveUserId), { balance: userProfile.balance, highScore: userProfile.balance });
        } else {
            scheduleGuestSave(true);
        }
        updateProfileUI();
        quizState.lives = amount;
        renderLives();
        document.getElementById('revive-modal').classList.remove('active');
        toast(`تم شراء ${amount} قلب بنجاح!`, "success");
        playSound('win');
        nextQuestion();
    } catch (e) {
        console.error("Error buying lives:", e);
        toast("حدث خطأ أثناء الشراء، حاول مرة أخرى", "error");
    }
};

window.cancelRevive = function() {
    document.getElementById('revive-modal').classList.remove('active');
    endQuiz();
};


function checkMarathonStatus() {
    const btn = getEl('btn-marathon-start');
    if (marathonInterval) clearInterval(marathonInterval);

    if (!userProfile || !userProfile.lastMarathonDate) {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');

btn.innerHTML = `<span class="text-lg font-bold text-black">أكمل النور</span> <span class="material-symbols-rounded text-black">local_fire_department</span>`;
        return;
    }

    const lastPlayed = userProfile.lastMarathonDate.toMillis ? userProfile.lastMarathonDate.toMillis() : new Date(userProfile.lastMarathonDate).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const diff = now - lastPlayed;

    if (diff < twentyFourHours) {
        btn.disabled = true;
        btn.classList.add('cursor-not-allowed');
        
        const updateTimer = () => {
            const currentNow = Date.now();
            const timeLeft = twentyFourHours - (currentNow - lastPlayed);
            
            if (timeLeft <= 0) {
                clearInterval(marathonInterval);
                checkMarathonStatus();
                return;
            }

            const h = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((timeLeft % (1000 * 60)) / 1000);

            // تعريب الساعة
            const pad = (n) => n.toString().padStart(2, '0');
            const timeStr = `${pad(h)}:${pad(m)}:${pad(s)}`;
            const arTime = timeStr.replace(/\d/g, d => ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'][d]);

            btn.innerHTML = `
                <span class="text-lg font-mono font-bold text-black" dir="ltr">
                    ${arTime}
                </span> 
                <span class="material-symbols-rounded text-black">lock_clock</span>
            `;
        };

        updateTimer();
        marathonInterval = setInterval(updateTimer, 1000);
    } else {
        btn.disabled = false;
        btn.classList.remove('cursor-not-allowed');
        btn.innerHTML = `<span class="text-lg font-bold text-black">(أكمل النور)</span> <span class="material-symbols-rounded text-black">local_fire_department</span>`;

    }
}


async function checkWhatsNew() {
    try {
        const docRef = doc(db, "system", "whats_new");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            if (!data.isActive || !data.message) return;

            const serverTime = data.updatedAt ? data.updatedAt.toMillis() : 0;
            const localTime = parseInt(localStorage.getItem('last_seen_news_time') || '0');

            if (serverTime > localTime) {
                const contentEl = getEl('news-content');
                contentEl.innerHTML = data.message;
 
                
                const modal = getEl('news-modal');
                modal.classList.add('active');

                getEl('close-news-btn').onclick = () => {
                    localStorage.setItem('last_seen_news_time', serverTime);
                    modal.classList.remove('active');
                    playSound('win'); 
                };
            }
        }
      } catch (e) {
        console.error("News fetch error:", e);
    }
}

bind('btn-force-review-confirm', 'click', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    getEl('review-mistakes-btn').click();
});


// --- دالة تحويل الأرقام وتنسيقها ---
function formatNumberAr(num, compact = false) {
    if (num === null || num === undefined || isNaN(num)) return '٠';
    
    const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    const toAr = (n) => n.toString().replace(/\d/g, d => map[d]).replace(/,/g, '،'); // استبدال الأرقام والفواصل

    // 1. الوضع المختصر (للشريط العلوي والمتصدرين)
    if (compact) {
        if (num >= 1000000) {
            return toAr((num / 1000000).toFixed(1)) + " مليون";
        }
        if (num >= 1000) {
            // هنا نستخدم "ألف" بالهمزة كما طلبت للتمييز عن الرقم 1
            return toAr((num / 1000).toFixed(1)) + " ألف"; 
        }
    }
    
    // 2. الوضع العادي (للحقيبة والمتجر والنقاط الحية) - يضيف فواصل الآلاف
    return toAr(Number(num).toLocaleString('en-US'));
}



function sanitizeUserData(data) {
    let wasFixed = false;
    const cleanData = { ...data };
    // balance هو الرصيد/العملة (بديل highScore القديم)
    const b = Number(cleanData.balance);
    const hs = Number(cleanData.highScore);
    const mergedBalance = Math.max(Number.isFinite(b) ? b : 0, Number.isFinite(hs) ? hs : 0);

    // ترحيل/دمج تلقائي + إبقاء الحقل القديم متزامناً
    if (!Number.isFinite(b) || !Number.isFinite(hs) || mergedBalance !== b || mergedBalance !== hs) {
        cleanData.balance = mergedBalance;
        cleanData.highScore = mergedBalance; // legacy sync
        wasFixed = true;
    }

    if (!cleanData.stats || typeof cleanData.stats !== 'object') {
        cleanData.stats = {};
        wasFixed = true;
    }

    const statFields = [
        'quizzesPlayed', 'totalCorrect', 'totalQuestions', 'bestRoundScore',
        'totalHardQuizzes', 'noHelperQuizzesCount', 'maxStreak', 'fastAnswerCount'
    ];

    statFields.forEach(field => {
        if (typeof cleanData.stats[field] !== 'number' || isNaN(cleanData.stats[field])) {
            cleanData.stats[field] = 0;
            wasFixed = true;
        }
    });

    if (!cleanData.stats.topicCorrect || typeof cleanData.stats.topicCorrect !== 'object') {
        cleanData.stats.topicCorrect = {};
        wasFixed = true;
    }
    
    if (!Array.isArray(cleanData.stats.lastPlayedDates)) {
        cleanData.stats.lastPlayedDates = [];
        wasFixed = true;
    }

    if (!cleanData.inventory || typeof cleanData.inventory !== 'object') {
        cleanData.inventory = { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'] };
        wasFixed = true;
    } else {
        if (typeof cleanData.inventory.lives !== 'number' || isNaN(cleanData.inventory.lives)) {
            cleanData.inventory.lives = 0;
            wasFixed = true;
        }
        if (!cleanData.inventory.helpers) cleanData.inventory.helpers = {};
        ['fifty', 'hint', 'skip'].forEach(h => {
            if (typeof cleanData.inventory.helpers[h] !== 'number' || isNaN(cleanData.inventory.helpers[h])) {
                cleanData.inventory.helpers[h] = 0;
                wasFixed = true;
            }
        });
        if (!Array.isArray(cleanData.inventory.themes)) {
            cleanData.inventory.themes = ['default'];
            wasFixed = true;
        }
        if (!Array.isArray(cleanData.inventory.frames)) {
            cleanData.inventory.frames = ['default']; 
            wasFixed = true;
        }
    } 
    
    if (!cleanData.equippedFrame) {
        cleanData.equippedFrame = 'default';
        wasFixed = true;
    }

    if (!Array.isArray(cleanData.badges)) { cleanData.badges = ['beginner']; wasFixed = true; }
    if (!Array.isArray(cleanData.favorites)) { cleanData.favorites = []; wasFixed = true; }
    if (!Array.isArray(cleanData.seenQuestions)) { cleanData.seenQuestions = []; wasFixed = true; }
    if (!Array.isArray(cleanData.seenMarathonIds)) { cleanData.seenMarathonIds = []; wasFixed = true; }
    if (!Array.isArray(cleanData.wrongQuestionsBank)) { cleanData.wrongQuestionsBank = []; wasFixed = true; }

    // 🎁 حقول دورة المكافأة اليومية (لتوافق الحسابات القديمة)
    if (typeof cleanData.lastDailyRewardDate !== 'string') {
        cleanData.lastDailyRewardDate = '';
        wasFixed = true;
    }
    const streakDay = Number(cleanData.dailyRewardStreakDay);
    if (!Number.isFinite(streakDay) || streakDay < 0 || streakDay > 7) {
        cleanData.dailyRewardStreakDay = 0;
        wasFixed = true;
    } else {
        cleanData.dailyRewardStreakDay = Math.floor(streakDay);
    }

    return { cleanData, wasFixed };
}

// --- نظام الإشعارات المحلي ---
const NOTIF_KEY = 'ahlulbayt_local_notifs_v1';

function addLocalNotification(title, body, icon='info') {
    // 1. جلب القائمة القديمة
    let list = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
    
    // 2. إنشاء الإشعار الجديد
    const newNotif = {
        id: Date.now(),
        title: title,
        body: body,
        icon: icon,
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('ar-EG'),
        read: false
    };
    
    // 3. الإضافة في البداية
    list.unshift(newNotif);
    
    // 4. الحفاظ على الحد الأقصى (30)
    if (list.length > 30) list = list.slice(0, 30);
    
    // 5. الحفظ
    localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
    
    // 6. تحديث الواجهة
    updateNotifUI();
    playSound('click'); // صوت خفيف للتنبيه
}
// دالة الاشعارات
function updateNotifUI(){const list=JSON.parse(localStorage.getItem(NOTIF_KEY)||'[]');const badge=document.getElementById('notif-badge');const bottomBadge=document.getElementById('bottom-notif-badge');const container=document.getElementById('notif-list');const unread=list.filter(n=>!n.read).length;if(unread>0){badge.classList.remove('hidden');badge.classList.add('pulse-red');if(bottomBadge){bottomBadge.classList.remove('hidden');bottomBadge.classList.add('pulse-red')}}else{badge.classList.add('hidden');badge.classList.remove('pulse-red');if(bottomBadge){bottomBadge.classList.add('hidden');bottomBadge.classList.remove('pulse-red')}}container.innerHTML='';if(list.length===0){container.innerHTML='<p class="text-center text-slate-500 text-xs py-6">لا توجد إشعارات</p>';return}const tpl=document.getElementById('notif-template');list.forEach(n=>{const clone=tpl.content.cloneNode(true);const item=clone.querySelector('.notif-item');const icon=clone.querySelector('.notif-icon');clone.querySelector('.notif-title').textContent=n.title;clone.querySelector('.notif-body').textContent=n.body;clone.querySelector('.notif-date').textContent=`${n.date} - ${n.time}`;icon.textContent=n.icon;let c='text-slate-400';if(n.icon==='emoji_events')c='text-amber-400';else if(n.icon==='monetization_on')c='text-green-400';else if(n.icon==='lock_reset')c='text-red-400';icon.classList.add(c);if(n.read){item.classList.add('opacity-70','border-transparent')}else{item.classList.add('bg-slate-800/30','border-amber-500')}container.appendChild(clone)})}


// فتح/غلق القائمة
bind('notif-btn', 'click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    const isHidden = dropdown.classList.contains('hidden');
    
    // إغلاق أي نوافذ أخرى
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    
    if (isHidden) {
        dropdown.classList.remove('hidden');
        updateNotifUI(); // للتأكد من الرسم
        
        // تعليم الكل كمقروء بمجرد الفتح (لإيقاف الوميض)
        let list = JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]');
        if (list.some(n => !n.read)) {
            list.forEach(n => n.read = true);
            localStorage.setItem(NOTIF_KEY, JSON.stringify(list));
            // نحدث الواجهة فوراً لإزالة النقطة الحمراء
            updateNotifUI();
        }
    } else {
        dropdown.classList.add('hidden');
    }
});

// إغلاق القائمة عند النقر خارجها
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notif-dropdown');
    const btn = document.getElementById('notif-btn');
    if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

bind('clear-notif-btn', 'click', (e) => {
    e.stopPropagation();
    localStorage.removeItem(NOTIF_KEY);
    updateNotifUI();
});

// استدعاء التحديث عند بدء التشغيل
document.addEventListener('DOMContentLoaded', () => {
    updateNotifUI();
});

// --- دالة حساب التقدم والمستوى (النسخة الشاملة لكل الأوسمة) ---
function getBadgeProgress(badge) {
    const stats = userProfile.stats || {};
    let currentScore = 0;

    // 1. حساب النقاط الحالية
    if (badge.type === 'topic') {
        if (stats.topicCorrect) {
            // جلب قائمة المواضيع الفرعية لهذا القسم (إن وجدت)
            // هذا السطر هو المسؤول عن جعل الوسام يشمل كل مواضيع القسم
            const categorySubTopics = topicsData[badge.topicKey] || [];

            Object.keys(stats.topicCorrect).forEach(playedTopic => {
                // تنظيف النصوص من المسافات لضمان التطابق
                const pTopic = playedTopic.trim();
                const bKey = badge.topicKey.trim();

                // الحالة 1: تطابق مباشر (لأوسمة المعصومين المحددة)
                // مثال: لعب "سيرة الإمام علي" والوسام هو "عاشق الإمام علي"
                const isDirectMatch = pTopic === bKey || pTopic.includes(bKey) || bKey.includes(pTopic);
                
                // الحالة 2: الموضوع الملعوب هو جزء من قائمة هذا التصنيف (لأوسمة التبحر العامة)
                // مثال: لعب "واقعة كربلاء" والوسام هو "التاريخ"
                const isSubTopicMatch = categorySubTopics.includes(pTopic);

                if (isDirectMatch || isSubTopicMatch) {
                    currentScore += stats.topicCorrect[playedTopic];
                }
            });
        }
    } else if (badge.type === 'score') {
        currentScore = Number(userProfile.balance ?? userProfile.highScore ?? 0);
    } else if (badge.type === 'streak') {
        currentScore = stats.maxStreak || 0;
    } else if (badge.type === 'counter') {
        currentScore = stats[badge.statKey] || 0;
    }

    // 2. تحديد المستوى الحالي
    let activeLevel = badge.levels[0]; 
    let currentTierColor = 'locked';   
    let nextTierLabel = badge.levels[0].label;
    
    // معرفة أقصى مستوى تم الوصول إليه
    for (let i = 0; i < badge.levels.length; i++) {
        const level = badge.levels[i];
        
        if (currentScore >= level.target) {
            if (i === badge.levels.length - 1) {
                // الوصول للختم النهائي
                activeLevel = level;
                currentTierColor = level.color; // سيأخذ legendary أو diamond
                nextTierLabel = 'مكتمل';
            } else {
                // انتقل للمستوى التالي
                activeLevel = badge.levels[i + 1];
                currentTierColor = level.color; 
                nextTierLabel = badge.levels[i + 1].label;
            }
        } else {
            // هذا هو المستوى الحالي المستهدف
            activeLevel = level;
            if (i > 0) currentTierColor = badge.levels[i-1].color;
            nextTierLabel = level.label;
            break; 
        }
    }

    // 3. حساب النسبة المئوية
    let percent = 0;
    if (activeLevel.target > 0) {
        percent = Math.floor((currentScore / activeLevel.target) * 100);
    }
    if (percent > 100) percent = 100;

    return {
        current: currentScore,
        max: activeLevel.target,
        percent: percent,
        activeLevel: activeLevel,
        tier: currentTierColor, 
        isMaxed: currentScore >= badge.levels[badge.levels.length-1].target
    };
}

// 2. دالة الترتيب الذكي (Smart Sorting)
function sortBadgesSmartly() {
    return badgesData.sort((a, b) => {
        // فحص هل الوسام مختوم بالكامل (الذهبي)
        const progA = getBadgeProgress(a);
        const progB = getBadgeProgress(b);
        
        const finishedA = progA.isMaxed;
        const finishedB = progB.isMaxed;
        
        // القاعدة 1: غير المكتمل يظهر قبل المكتمل (المختوم)
        if (finishedA && !finishedB) return 1;
        if (!finishedA && finishedB) return -1;
        
        // القاعدة 2: الأقرب للاكتمال يظهر أولاً
        return progB.percent - progA.percent; 
    });
}

/* =========================================
   نظام طابور الجوائز الجديد (New Queue System)
   ========================================= */

// 1. دالة التحقق من الأوسمة (المعدلة)
async function checkAndUnlockBadges() {
    let newUnlocks = [];
    
    badgesData.forEach(badge => {
        const progressData = getBadgeProgress(badge);
        badge.levels.forEach(level => {
            const uniqueLevelId = `${badge.id}_lvl${level.id}`;
            if (progressData.current >= level.target && !userProfile.badges.includes(uniqueLevelId)) {
                newUnlocks.push({ badge: badge, level: level, uniqueId: uniqueLevelId });
            }
        });
    });

    if (newUnlocks.length > 0) {
        let totalScoreAdded = 0;
        
        newUnlocks.forEach(unlock => {
            const r = unlock.level.rewards;
            const bName = unlock.badge.name;
            const lName = unlock.level.label;

            userProfile.badges.push(unlock.uniqueId);
            
            if (r.score) { userProfile.balance = Number(userProfile.balance ?? userProfile.highScore ?? 0) + r.score; userProfile.highScore = userProfile.balance; totalScoreAdded += r.score; }
            if (r.lives) userProfile.inventory.lives = (userProfile.inventory.lives || 0) + r.lives;
            if (r.hint) userProfile.inventory.helpers.hint = (userProfile.inventory.helpers.hint || 0) + r.hint;
            if (r.fifty) userProfile.inventory.helpers.fifty = (userProfile.inventory.helpers.fifty || 0) + r.fifty;
            if (r.skip) userProfile.inventory.helpers.skip = (userProfile.inventory.helpers.skip || 0) + r.skip;

            // إشعار فوري لكل وسام
            addLocalNotification('إنجاز جديد 🏆', `مبروك! حصلت على وسام "${bName}" - ${lName}`, 'emoji_events');

            // إضافة للطابور
            window.rewardQueue.push(unlock);
        });

        if (!isGuestMode() && effectiveUserId) {
            await updateDoc(doc(db, "users", effectiveUserId), {
                badges: userProfile.badges,
                balance: userProfile.balance,
                highScore: userProfile.balance,
                inventory: userProfile.inventory
            });
        } else {
            scheduleGuestSave(true);
        }

        updateProfileUI();
        processRewardQueue(); // بدء العرض
        return true;
    }
    return false;
}

// 2. دالة معالجة الطابور (الجديدة)
function processRewardQueue() {
    if (window.rewardQueue.length === 0) return;
    const nextReward = window.rewardQueue.shift();
    showRewardModal(nextReward.badge, nextReward.level);
    playSound('applause');
    // إذا أضفنا دالة الاهتزاز لاحقاً ستعمل هنا
    
}
function showRewardModal(badge, level) {
    const modal = getEl('reward-modal');
    const box = getEl('reward-content-area');
    
    // 1. توليد HTML الجوائز
    let rewardsHtml = '';
    if (level.rewards) {
        if (level.rewards.score) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-amber-400 text-2xl block mb-1">monetization_on</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.score)}</span></div>`;
        if (level.rewards.lives) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-red-500 text-2xl block mb-1">favorite</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.lives)}</span></div>`;
        if (level.rewards.hint) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-yellow-400 text-2xl block mb-1">lightbulb</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.hint)}</span></div>`;
        if (level.rewards.skip) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-green-400 text-2xl block mb-1">skip_next</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.skip)}</span></div>`;
        if (level.rewards.fifty) rewardsHtml += `<div class="reward-item-box"><span class="material-symbols-rounded text-blue-400 text-2xl block mb-1">percent</span><span class="text-white text-xs font-bold">+${formatNumberAr(level.rewards.fifty)}</span></div>`;
    }

    // 2. إعداد الألوان للأيقونة والإطار والعنوان
    let titleColor = 'text-white';
    let borderColor = 'border-white'; 
    let iconColor = 'text-white'; // متغير جديد للون الأيقونة
    let levelName = level.label;

    if (level.color === 'bronze') { 
        titleColor = 'text-red-500'; 
        borderColor = 'border-red-500'; 
        iconColor = 'text-amber-700'; // لون برونزي للنجمة
    } else if (level.color === 'silver') { 
        titleColor = 'text-slate-200'; 
        borderColor = 'border-slate-300'; 
        iconColor = 'text-slate-300'; 
    } else if (level.color === 'gold') { 
        titleColor = 'text-amber-400'; 
        borderColor = 'border-amber-400'; 
        iconColor = 'text-amber-400'; 
    } else if (level.color === 'diamond') { 
        titleColor = 'text-cyan-400'; 
        borderColor = 'border-cyan-400'; 
        iconColor = 'text-cyan-400'; 
    } else if (level.color === 'legendary') { 
        titleColor = 'text-red-600 animate-pulse'; 
        borderColor = 'border-red-600'; 
        iconColor = 'text-red-600'; 
    }

    // 3. بناء واجهة النافذة (تم استبدال img بـ div يحتوي على أيقونة)
    box.innerHTML = `
        <div class="mx-auto mb-4 w-24 h-24 rounded-full border-4 ${borderColor} bg-slate-900 flex items-center justify-center shadow-2xl">
            <span class="material-symbols-rounded text-6xl ${iconColor} drop-shadow-lg">star</span>
        </div>
        <h3 class="text-xl font-bold text-white font-heading mb-1">إنجاز جديد!</h3>
        <p class="${titleColor} text-lg font-bold mb-2">${badge.name}</p>
        <span class="text-xs bg-slate-800 px-3 py-1 rounded-full border border-white/10 mb-4 inline-block">${levelName}</span>
        <p class="text-slate-400 text-sm mb-6 px-4">${badge.desc}</p>
        <div class="text-xs text-slate-500 mb-2">-- الجوائز --</div>
        <div class="reward-items-grid">${rewardsHtml}</div>
    `;
    
    // 4. إعداد زر الاستلام
    const claimBtn = modal.querySelector('.btn-gold-action');
    const newBtn = claimBtn.cloneNode(true);
    claimBtn.parentNode.replaceChild(newBtn, claimBtn);
    
    newBtn.textContent = (window.rewardQueue.length > 0) ? "استلام والتالي >>" : "استلام الجوائز";
    
    newBtn.onclick = () => {
        modal.classList.remove('active');
        playSound('click');
        setTimeout(() => { processRewardQueue(); }, 300);
    };

    // 5. المؤثرات والعرض
    launchConfetti();
    modal.classList.add('active'); 
}

function showMotivator() {
    // البحث عن أوسمة لم تختم بعد
    const candidates = badgesData.filter(b => {
        const prog = getBadgeProgress(b);
        return !prog.isMaxed && b.type !== 'streak'; // نستثني الستريك لأنه يتصفر
    });
    
    let bestCandidate = null;
    let highestPercent = 0;

    candidates.forEach(b => {
        const prog = getBadgeProgress(b);
        if (prog.percent >= 60 && prog.percent < 100) { 
            if (prog.percent > highestPercent) {
                highestPercent = prog.percent;
                bestCandidate = b;
            }
        }
    });

    if (bestCandidate) {
        const prog = getBadgeProgress(bestCandidate);
        const remaining = prog.max - prog.current;
        const msg = `أنت قريب! بقي ${formatNumberAr(remaining)} للحصول على مستوى جديد في "${bestCandidate.name}"`;
        
        toast(`🚀 ${msg}`, 'success'); 
        playSound('hint');
    }
}


/* =========================================
   Global Navigation Handlers (Back Button & Click Outside)
   ========================================= */

    // أولوية 2: نحن داخل اللعبة ولا توجد نوافذ مفتوحة
    if (quizState.active) {
        window.history.pushState({ view: 'playing' }, "", ""); // منع الرجوع

        window.showConfirm(
            "مغادرة المسابقة",
            "هل تريد الانسحاب؟ سيتم احتساب النقاط والإجابات الصحيحة الحالية.",
            "logout",
            async () => {
                quizState.active = false; 
                
                // نسخ نفس منطق الحفظ الشامل هنا أيضاً
                if (quizState.score > 0 || quizState.correctCount > 0) {
                    try {
                        const userRef = doc(db, "users", effectiveUserId);
                        const currentTopic = quizState.contextTopic;
                        const safeCorrect = quizState.correctCount || 0;
                        
                        const updates = {
                        balance: increment(quizState.score),
                        highScore: increment(quizState.score),
                            "stats.quizzesPlayed": increment(1),
                            "stats.totalCorrect": increment(safeCorrect), // ✅
                            "stats.totalQuestions": increment(quizState.idx) // ✅
                        };

                        if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
                            updates[`stats.topicCorrect.${currentTopic}`] = increment(safeCorrect);
                        }

                        // الأسبوعي
                        const wKey = getCurrentWeekKey();
                        let newWeekly = userProfile.weeklyStats || { key: wKey, correct: 0 };
                        if (newWeekly.key !== wKey) newWeekly = { key: wKey, correct: 0 };
                        newWeekly.correct += safeCorrect;
                        updates.weeklyStats = newWeekly;

                        // الشهري
                        const mKey = getCurrentMonthKey();
                        let newMonthly = userProfile.monthlyStats || { key: mKey, correct: 0 };
                        if (newMonthly.key !== mKey) newMonthly = { key: mKey, correct: 0 };
                        newMonthly.correct += safeCorrect;
                        updates.monthlyStats = newMonthly;

                        await updateDoc(userRef, updates);

                        // تحديث محلي
                        userProfile.balance = (Number(userProfile.balance ?? userProfile.highScore ?? 0)) + quizState.score;
                    userProfile.highScore = userProfile.balance;
                        if(userProfile.stats) {
                            userProfile.stats.totalCorrect = (userProfile.stats.totalCorrect || 0) + safeCorrect;
                            if (currentTopic && currentTopic !== 'عام') {
                                userProfile.stats.topicCorrect[currentTopic] = (userProfile.stats.topicCorrect[currentTopic] || 0) + safeCorrect;
                            }
                        }
                        userProfile.weeklyStats = newWeekly;
                        userProfile.monthlyStats = newMonthly;

                        toast(`تم حفظ ${quizState.score} نقطة و ${safeCorrect} إجابة`, "success");
                    } catch (e) { console.error(e); }
                }
                
                navToHome();
            }
        );
    }

// 2. معالجة النقر على الخلفية المعتمة لإغلاق النوافذ
document.addEventListener('click', (e) => {
    const isOverlay = e.target.classList.contains('modal-overlay');
    const isSideMenuOverlay = (e.target.id === 'side-menu-overlay');

    if (isOverlay || isSideMenuOverlay) {
        // منع إغلاق النوافذ الإجبارية بالنقر خارجها
        // ✅ تم إضافة ban-modal لمنع تجاوز الحظر عبر النقر خارج النافذة
        if (e.target.id === 'force-review-modal' || e.target.id === 'auth-loading' || e.target.id === 'revive-modal' || e.target.id === 'ban-modal') {
            if(window.playSound) window.playSound('lose');
            const box = e.target.querySelector('.modal-box');
            if(box) { box.classList.add('shake'); setTimeout(()=>box.classList.remove('shake'), 500); }
            return;
        }

        // الإغلاق اليدوي
        if(isOverlay) e.target.classList.remove('active');
        if(isSideMenuOverlay) toggleMenu(false);
    }
});

/* =========================================
   Step 3: Haptics & Animations (Magic Touch)
   ========================================= */


// 2. دالة تحريك الأرقام (العداد المتدحرج)
function animateValue(obj, start, end, duration) {
    if(!obj) return;
    if(start === end) { obj.textContent = formatNumberAr(end); return; }
    
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        // معادلة Ease-Out لجعل الحركة ناعمة في النهاية
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        const currentVal = Math.floor(progress * (end - start) + start);
        obj.textContent = formatNumberAr(currentVal); // استخدام دالة التعريب
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.textContent = formatNumberAr(end); // ضمان الرقم النهائي بدقة
        }
    };
    window.requestAnimationFrame(step);
}


/* =========================================
   Skeleton Loading Logic
   ========================================= */
function renderSkeleton(type, count=5) {
    let html = '';
    
    if (type === 'leaderboard') {
        const container = getEl('leaderboard-list');
        if(!container) return;
        
        container.innerHTML = '';
        container.classList.remove('hidden'); // إظهار الحاوية
        
        for(let i=0; i<count; i++) {
            html += `
            <div class="sk-row skeleton-box">
                <div class="skeleton sk-circle shrink-0"></div>
                <div class="flex-1 space-y-2">
                    <div class="skeleton sk-line long"></div>
                    <div class="skeleton sk-line short"></div>
                </div>
                <div class="skeleton sk-line tiny"></div>
            </div>`;
        }
        container.innerHTML = html;
        
    } else if (type === 'quiz') {
        // تنظيف الواجهة القديمة
        getEl('question-text').innerHTML = '<div class="skeleton sk-line long mx-auto mb-2"></div><div class="skeleton sk-line short mx-auto"></div>';
                const box = getEl('options-container');
    
    // تنظيف المحتوى السابق
    box.innerHTML = ''; 

    // --- منطق تبديل شكل الخيارات (قائمة vs شبكة) ---
    if (quizState.mode === 'marathon') {
        // 1. تفعيل وضع الشبكة
        box.classList.add('options-grid-mode');
        // 2. هام جداً: إزالة كلاسات التباعد العمودي الخاصة بـ Tailwind
        // (إذا لم نحذفها، ستخرب شكل الشبكة)
        box.classList.remove('space-y-1', 'space-y-2', 'space-y-3'); 
    } else {
        // 1. إزالة وضع الشبكة
        box.classList.remove('options-grid-mode');
        // 2. إعادة كلاس التباعد العمودي للقائمة العادية
        box.classList.add('space-y-1'); 
    }

    
    box.innerHTML = ''; // تفريغ المحتوى القديم

        
        for(let i=0; i<4; i++) {
            box.innerHTML += `<div class="skeleton sk-btn"></div>`;
        }
    }
}

/* =========================================
   Step 5: Audio Preferences (SFX Only)
   ========================================= */

