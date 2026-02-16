// ==========================================
// 🧹 تنظيف شامل: حذف الكاش + إلغاء Service Worker + حذف بيانات المتصفح
// (Hard Reset - بدون المساس ببيانات السيرفر)
// ==========================================
async function deleteAllIndexedDB() {
    try {
        if (!('indexedDB' in window)) return;

        // بعض المتصفحات تدعم databases()
        if (indexedDB.databases) {
            const dbs = await indexedDB.databases();
            if (!Array.isArray(dbs)) return;

            await Promise.all(dbs.map(dbInfo => {
                const name = dbInfo && dbInfo.name;
                if (!name) return Promise.resolve();
                return new Promise(resolve => {
                    const req = indexedDB.deleteDatabase(name);
                    req.onsuccess = () => resolve();
                    req.onerror = () => resolve();
                    req.onblocked = () => resolve();
                });
            }));
        }
    } catch (_) {}
}

async function hardResetAppAndReload() {
    // 1) حذف التخزين المحلي
    try { localStorage.clear(); } catch (_) {}
    try { sessionStorage.clear(); } catch (_) {}

    // 2) حذف Cache Storage
    try {
        if (typeof caches !== 'undefined' && caches.keys) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
    } catch (_) {}

    // 3) حذف IndexedDB (يحتوي أحياناً على Firebase/Auth/PWA بيانات)
    await deleteAllIndexedDB();

    // 4) إلغاء Service Worker بالكامل
    try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
        }
    } catch (_) {}

    // 5) محاولة حذف الكوكيز (أفضل جهد)
    try {
        document.cookie.split(';').forEach(c => {
            const eqPos = c.indexOf('=');
            const name = (eqPos > -1 ? c.substr(0, eqPos) : c).trim();
            if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        });
    } catch (_) {}

    // 6) إعادة تحميل “نظيفة” مع كسر كاش المتصفح
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('fresh', Date.now().toString());
        window.location.replace(url.toString());
    } catch (_) {
        window.location.reload();
    }
}




initManualQuestionCountsRefresh({ getEl, fetchSystemCounts, toast, playSound });

bind('clear-cache-btn', 'click', () => { 
    window.showConfirm(
        "مسح البيانات",
        "هل أنت متأكد؟ سيتم حذف البيانات المحفوظة محلياً وتسجيل الخروج. لن يتم حذف حسابك من السيرفر.",
        "delete_forever",
        async () => {
            await hardResetAppAndReload();
        }
    );
});

bind('nav-about', 'click', () => openModal('about-modal'));

bind('user-profile-btn', 'click', () => {
    openModal('user-modal'); 
    
    // 1. تعبئة البيانات الأساسية
    getEl('edit-username').value = userProfile.username;
    getEl('edit-gender-male').checked = false;
    getEl('edit-gender-female').checked = false;
    if (userProfile.gender === 'male') getEl('edit-gender-male').checked = true;
    else if (userProfile.gender === 'female') getEl('edit-gender-female').checked = true;
    
    // 2. عرض تاريخ الانضمام
    let joinDateStr = "غير معروف";
    if (userProfile.createdAt) {
        const dateObj = userProfile.createdAt.toDate ? userProfile.createdAt.toDate() : new Date(userProfile.createdAt);
        joinDateStr = dateObj.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    getEl('profile-join-date').textContent = `انضم في: ${joinDateStr}`;

    // 3. عرض الصورة الشخصية + الإطار (التعديل الجديد) 🌟
    const avatarContainer = document.querySelector('#user-modal .relative.w-24.h-24');
    
    // أ) تنظيف أي إطار قديم لمنع التكرار
    const oldFrame = avatarContainer.querySelector('.avatar-frame-overlay');
    if (oldFrame) oldFrame.remove();

    // ب) عرض الصورة أو الأيقونة
    const guestMode = (typeof isGuestMode === 'function') && isGuestMode();
    const googlePhotoUrl = (!guestMode && window.auth && window.auth.currentUser && window.auth.currentUser.photoURL) ? sanitizeImageUrl(window.auth.currentUser.photoURL) : '';
    if(userProfile.customAvatar) {
         getEl('profile-img-preview').src = userProfile.customAvatar;
         show('profile-img-preview');
         hide('profile-icon-preview');
         show('delete-custom-avatar');
    } else if (guestMode) {
         getEl('profile-img-preview').src = 'Icon.png';
         show('profile-img-preview');
         hide('profile-icon-preview');
         hide('delete-custom-avatar');
    } else if (googlePhotoUrl) {
         getEl('profile-img-preview').src = googlePhotoUrl;
         show('profile-img-preview');
         hide('profile-icon-preview');
         hide('delete-custom-avatar');
    } else {
         hide('profile-img-preview');
         const iconBox = getEl('profile-icon-preview');
         if (iconBox) iconBox.innerHTML = '<span class="text-[10px] font-bold text-slate-300 text-center leading-tight px-1">ضع صورتك هنا</span>';
         show('profile-icon-preview');
         hide('delete-custom-avatar');
    }

    // ج) إضافة الإطار المختار (إن وجد)
    const currentFrameId = userProfile.equippedFrame || 'default';
    if (currentFrameId !== 'default') {
        const frameObj = getFrameById(currentFrameId);
        if (frameObj) {
            const frameDiv = document.createElement('div');
            // نضيف pointer-events-none لضمان إمكانية الضغط على زر تغيير الصورة
            frameDiv.className = `avatar-frame-overlay ${frameObj.cssClass}`;
            frameDiv.style.pointerEvents = 'none'; 
            avatarContainer.appendChild(frameDiv);
        }
    }
    
    // 4. عرض الإحصائيات
    const stats = userProfile.stats || {};
    const totalQ = stats.totalQuestions || 0;
    const totalC = stats.totalCorrect || 0;
    const accuracy = totalQ > 0 ? Math.round((totalC / totalQ) * 100) : 0;

    getEl('profile-stat-score').textContent = formatNumberAr(Number(userProfile.balance ?? userProfile.highScore ?? 0));
    getEl('profile-stat-played').textContent = formatNumberAr(stats.quizzesPlayed || 0);
    getEl('profile-stat-correct').textContent = formatNumberAr(totalC);
    getEl('profile-stat-accuracy').textContent = `%${formatNumberAr(accuracy)}`;

    // 5. عرض الأوسمة
    const badgesContainer = getEl('profile-badges-display');
    badgesContainer.innerHTML = '';
    badgesContainer.className = 'grid grid-cols-3 gap-4 justify-items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800 min-h-[100px] max-h-[300px] overflow-y-auto';

    if (userProfile.badges && userProfile.badges.length > 0) {
        const bestBadges = {};
        userProfile.badges.forEach(bid => {
            if (bid === 'beginner') return;
            const [baseId, lvlPart] = bid.split('_lvl');
            const level = parseInt(lvlPart) || 1;
            if (!bestBadges[baseId] || level > bestBadges[baseId].level) {
                bestBadges[baseId] = { id: bid, baseId: baseId, level: level };
            }
        });

        const finalBadges = Object.values(bestBadges);

        if (finalBadges.length === 0) {
            badgesContainer.className = 'flex justify-center items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800 min-h-[80px]';
            badgesContainer.innerHTML = '<span class="text-xs text-slate-500">لم تحصل على أوسمة خاصة بعد</span>';
        } else {
            finalBadges.forEach(item => {
                const bObj = badgesMap[item.baseId];
                if(bObj) {
                    let tierName = 'برونزي';
                    let glowStyle = 'box-shadow: 0 0 10px rgba(180, 83, 9, 0.4); border-color: #b45309;';
                    let tierColorHex = '#b45309';

                    if(item.level === 2) { 
                        tierName = 'فضي'; 
                        glowStyle = 'box-shadow: 0 0 12px rgba(203, 213, 225, 0.6); border-color: #cbd5e1;';
                        tierColorHex = '#cbd5e1';
                    } else if(item.level === 3) { 
                        tierName = 'ذهبي'; 
                        glowStyle = 'box-shadow: 0 0 15px rgba(251, 191, 36, 0.8); border-color: #fbbf24;';
                        tierColorHex = '#fbbf24';
                    } else if(item.level === 4) { 
                        tierName = 'ماسي'; 
                        glowStyle = 'box-shadow: 0 0 15px rgba(34, 211, 238, 0.8); border-color: #22d3ee;';
                        tierColorHex = '#22d3ee';
                    } else if(item.level === 5) { 
                        tierName = 'أسطوري'; 
                        glowStyle = 'box-shadow: 0 0 20px rgba(239, 68, 68, 0.9); border-color: #ef4444; animation: pulse-slow 2s infinite;';
                        tierColorHex = '#ef4444';
                    }

                    const badgeDiv = document.createElement('div');
                    badgeDiv.className = 'flex flex-col items-center gap-2 group cursor-pointer';
                    
badgeDiv.innerHTML = `
    <div class="relative w-14 h-14 rounded-full border-2 bg-slate-800 transition transform group-hover:scale-110 duration-300 flex items-center justify-center" style="${glowStyle}">
        <span class="material-symbols-rounded text-3xl" style="color: ${tierColorHex}">star</span>
    </div>
    <div class="text-center">
        <span class="block text-[10px] text-white font-bold leading-tight">${bObj.name}</span>
        <span class="block text-[9px] font-mono mt-0.5" style="color: ${tierColorHex}; opacity: 0.9">(${tierName})</span>
    </div>
`;
                    badgesContainer.appendChild(badgeDiv);
                }
            });
        }
    } else {
        badgesContainer.className = 'flex justify-center items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800 min-h-[80px]';
        badgesContainer.innerHTML = '<span class="text-xs text-slate-500">لا توجد أوسمة</span>';
    }
});


bind('save-user-btn', 'click', async () => { 
    const n = getEl('edit-username').value.trim();
    
    const updates = {};
    let change = false;

    // 1. معالجة تغيير الاسم داخل التطبيق
    if (n && n !== userProfile.username) {
        try {
            await updateUsername(effectiveUserId, n);
            userProfile.username = n;
            updates.username = n;
            change = true;
        } catch (e) {
            console.error(e);
            toast(e?.message || 'خطأ أثناء تحديث الاسم', 'error');
            return;
        }
    }

    // 2. معالجة الصورة الرمزية
    if (userProfile.tempCustomAvatar) {
        updates.customAvatar = userProfile.tempCustomAvatar;
        userProfile.customAvatar = userProfile.tempCustomAvatar;
        change = true;
        userProfile.tempCustomAvatar = null; 
    } else if (userProfile.deleteCustom) {
        updates.customAvatar = null;
        userProfile.customAvatar = null;
        change = true;
        userProfile.deleteCustom = false;
    }

    const genderChecked = document.querySelector('input[name="edit-gender"]:checked');
    const g = genderChecked ? genderChecked.value : '';
    if (g && g !== userProfile.gender) {
        updates.gender = g;
        userProfile.gender = g;
        change = true;
    }

    // تنفيذ الحفظ
    if(change) {
        const btn = getEl('save-user-btn');
        btn.disabled = true;
        btn.textContent = "جاري الحفظ...";

        try {
            await updateDoc(doc(db,"users",effectiveUserId), updates);
            updateProfileUI(); 
            
            if (updates.customAvatar) addLocalNotification('تحديث الملف', 'تم تغيير الصورة الشخصية', 'account_circle');
            if (updates.username) addLocalNotification('تحديث الملف', `تم تغيير الاسم إلى ${updates.username}`, 'badge');

            toast("✅ تم حفظ التغييرات بنجاح");
        } catch(e) {
            console.error(e);
            toast("حدث خطأ أثناء الحفظ", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "حفظ التعديلات";
        }
    } else {
        toast("لم تقم بأي تغييرات");
    }
});


bind('avatar-upload', 'change', handleImageUpload);
bind('delete-custom-avatar', 'click', () => {
    userProfile.tempCustomAvatar = null;
    userProfile.deleteCustom = true;
    hide('profile-img-preview');
    show('profile-icon-preview');
    hide('delete-custom-avatar');
});

bind('restart-button', 'click', navToHome);


function getCurrentMonthKey() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

async function saveMonthlyWinner(monthKey) {
    try {
        // 1. أولاً: نتحقق هل تم تسجيل فائز لهذا الشهر مسبقاً؟
        const winnerDocRef = doc(db, "winners", monthKey);
        const winnerDocSnap = await getDoc(winnerDocRef);

        // إذا كان المستند موجوداً، لا تفعل شيئاً وتوقف فوراً
        // هذا يمنع استبدال البطل الحقيقي بشخص آخر لاحقاً
        if (winnerDocSnap.exists()) {
            console.log(`🏆 فائز شهر ${monthKey} مسجل مسبقاً، لن يتم الاستبدال.`);
            return;
        }

        // 2. إذا لم يكن مسجلاً، نقوم بالبحث عنه وحفظه (الكود الأصلي)
        const q = query(collection(db, "users"), where("monthlyStats.key", "==", monthKey), orderBy("monthlyStats.correct", "desc"), limit(1));
        const s = await getDocs(q);
        if (!s.empty) {
            const winnerData = s.docs[0].data();
            const winnerId = s.docs[0].id;
            await setDoc(winnerDocRef, {
                userId: winnerId,
                username: winnerData.username || "لاعب مجهول",
                photoURL: winnerData.photoURL || "", // حقل احتياطي
                score: winnerData.monthlyStats.correct,
                monthKey: monthKey,
                timestamp: serverTimestamp()
            });
            console.log(`🏆 تم حفظ فائز الشهر ${monthKey}: ${winnerData.username}`);
        }
    } catch(e) {
        console.error("Failed to save monthly winner:", e);
    }
}

