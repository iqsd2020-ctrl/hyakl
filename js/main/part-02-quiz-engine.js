// ==========================================
// ✅ دالة اختيار الإجابة (التصميم المصحح للوضع الليلي)
// ==========================================
function selectAnswer(idx, btn) {
    if(!quizState.active || quizState.processingAnswer) return;
    quizState.processingAnswer = true; 

    // ✅ صوت النقر على زر الإجابة فقط
    if (typeof playSound === 'function') playSound('answer_click');

    const answerTime = Date.now() - quizState.startTime;
    const q = quizState.questions[quizState.idx];
    const isCorrect = idx === q.correctAnswer;
    const btns = document.querySelectorAll('.option-btn');

    // ✅ تثبيت التصميم: لا نعيد كتابة className (هذا كان يسبب تغيّر شكل رقم الخيار)
    // نكتفي بإضافة/إزالة كلاسات حالة (صحيح/خطأ) مع الحفاظ على تصميم القالب.
    btns.forEach(b => b.classList.remove('btn-correct', 'btn-incorrect'));
    
    // تقليل شفافية الخيارات الأخرى للتركيز على ما تم اختياره
    btns.forEach(b => {
        b.classList.add('pointer-events-none');
        if(b !== btn) b.classList.add('opacity-50'); 
    });
    
    const qBankIdx = userProfile.wrongQuestionsBank.findIndex(x => x.question === q.question);

    // --- منطق الماراثون ---
    if (quizState.mode === 'marathon') {
        if (!quizState.tempMarathonIds) quizState.tempMarathonIds = [];
        if (q.id) quizState.tempMarathonIds.push(q.id);

        if (quizState.tempMarathonIds.length >= 5) {
            const batchIds = [...quizState.tempMarathonIds];
            quizState.tempMarathonIds = []; 
            if (!isGuestMode() && effectiveUserId) {
                updateDoc(doc(db, "users", effectiveUserId), {
                    seenMarathonIds: arrayUnion(...batchIds)
                }).catch(e => console.error("Auto-save failed:", e));
            } else {
                scheduleGuestSave();
            }
            if(!userProfile.seenMarathonIds) userProfile.seenMarathonIds = [];
            userProfile.seenMarathonIds = [...new Set([...userProfile.seenMarathonIds, ...batchIds])];
        }
    }

    if(isCorrect) {
        // --- حالة الإجابة الصحيحة ---
        if (answerTime <= 5000) { quizState.fastAnswers++; }
        if (quizState.mode === 'marathon') userProfile.stats.marathonCorrectTotal = (userProfile.stats.marathonCorrectTotal || 0) + 1;
        if (quizState.contextTopic === "مراجعة الأخطاء") userProfile.stats.reviewedMistakesCount = (userProfile.stats.reviewedMistakesCount || 0) + 1;

        let basePoints = 5;
        let multiplier = 1;
        let multiplierText = "";

        if (quizState.mode === 'marathon') {
            quizState.streak++;
            if(quizState.streak > userProfile.stats.maxStreak) { userProfile.stats.maxStreak = quizState.streak; }
            quizState.marathonCorrectStreak = (quizState.marathonCorrectStreak || 0) + 1;
            if(quizState.marathonCorrectStreak === 15) {
                userProfile.inventory.lives++;
                if (!isGuestMode() && effectiveUserId) {
                    updateDoc(doc(db, "users", effectiveUserId), { "inventory.lives": userProfile.inventory.lives });
                } else {
                    scheduleGuestSave();
                }
                toast("🎉 إنجاز رائع! حصلت على قلب إضافي", "success");
                quizState.lives++;
                renderLives();
                quizState.marathonCorrectStreak = 0;
            }
            if (quizState.streak >= 15) { multiplier = 4; multiplierText = "x4 🪙"; }
            else if (quizState.streak >= 9) { multiplier = 3; multiplierText = "x3 ✨"; }
            else if (quizState.streak >= 5) { multiplier = 2; multiplierText = "x2🔸"; }
        } else {
            quizState.streak = 0;
        }

        let pointsAdded = Math.floor(basePoints * multiplier);

        // ✅ تلوين الإجابة الصحيحة بدون إعادة كتابة className
        if(btn) {
            btn.classList.add('btn-correct');
            btn.classList.remove('btn-incorrect');
            showFloatingFeedback(btn, `+${pointsAdded}`, 'text-emerald-400');
        }

        quizState.score += pointsAdded;
        quizState.correctCount++;
        
        // تحديث المهام
        if (quizState.mode === 'marathon') dq_updateQuestProgress(3, 1);
        const questTopic = q.topic || quizState.contextTopic;
        if (questTopic && (questTopic.includes('المعصومين') || questTopic.includes('أهل البيت') || questTopic.includes('الإمام') || questTopic.includes('النبي'))) dq_updateQuestProgress(1, 1);
        if (questTopic && (questTopic.includes('مهدي') || questTopic.includes('حجة') || questTopic.includes('منتظر') || questTopic.includes('قائم') || questTopic.includes('الظهور') || questTopic.includes('السفراء') || questTopic.includes('الغيبة') || questTopic.includes('دولة العدل'))) dq_updateQuestProgress(4, 1);

        const scoreEl = getEl('live-score-text');
        scoreEl.textContent = formatNumberAr(quizState.score);
        scoreEl.classList.remove('score-pop'); void scoreEl.offsetWidth; scoreEl.classList.add('score-pop');

        if(qBankIdx > -1) userProfile.wrongQuestionsBank.splice(qBankIdx, 1);
        const currentTopic = q.topic || quizState.contextTopic;
        if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
            userProfile.stats.topicCorrect[currentTopic] = (userProfile.stats.topicCorrect[currentTopic] || 0) + 1;
        }

        getEl('feedback-text').innerHTML = `<span class="text-green-400">إجابة صحيحة! (+${formatNumberAr(pointsAdded)})</span> ${multiplierText ? `<span class="text-amber-400 text-xs bg-slate-800 px-2 py-1 rounded-full border border-amber-500/30">${multiplierText}</span>` : ''}`;
        getEl('feedback-text').className = "text-center mt-2 font-bold h-6 flex justify-center items-center gap-2";

        if(q.explanation && quizState.enrichmentEnabled) {
            setTimeout(() => showEnrichment(q.explanation), transitionDelay);
            return;
        }
        setTimeout(nextQuestion, transitionDelay);

    } else {
        // --- حالة الإجابة الخاطئة ---
        quizState.marathonCorrectStreak = 0;
        quizState.fastAnswers = 0;

        // ✅ تلوين الإجابة الخاطئة بدون إعادة كتابة className
        if(btn) {
            btn.classList.add('btn-incorrect');
            btn.classList.remove('btn-correct');
            const deductDisplay = (quizState.score >= 2) ? 2 : quizState.score;
            showFloatingFeedback(btn, `-${deductDisplay}`, 'text-red-400');
        }

        // ✅ [تعديل التصميم] كشف الإجابة الصحيحة (بنفس الستايل الداكن)
        if(q.correctAnswer >= 0 && q.correctAnswer < btns.length) {
            const correctBtn = btns[q.correctAnswer];
            correctBtn.classList.remove('opacity-50', 'pointer-events-none'); // جعلها واضحة
            
            // تطبيق تلوين الصحيح بدون إعادة كتابة className
            correctBtn.classList.add('btn-correct');
            correctBtn.classList.remove('btn-incorrect');
        }

        // بقية منطق الخسارة
        if (quizState.mode === 'marathon') {
            if (quizState.streak >= 10) { quizState.streak = 5; toast("تم تفعيل حماية الستريك! انخفض إلى 5 بدلاً من 0", "info"); }
            else if (quizState.streak >= 5) { quizState.streak = 2; }
            else { quizState.streak = 0; }
        } else {
            quizState.streak = 0;
        }

        if(quizState.lives > 3) {
            userProfile.inventory.lives = Math.max(0, userProfile.inventory.lives - 1);
            if (!isGuestMode() && effectiveUserId) {
                updateDoc(doc(db, "users", effectiveUserId), { "inventory.lives": userProfile.inventory.lives });
            } else {
                scheduleGuestSave();
            }
        }
        quizState.lives--;

        const deductionTarget = 3;
        let deductedFromRound = 0;
        let deductedFromBalance = 0;

        if (quizState.score >= deductionTarget) {
            quizState.score -= deductionTarget;
            deductedFromRound = deductionTarget;
        } else {
            deductedFromRound = quizState.score;
            quizState.score = 0;
            const remainingToDeduct = deductionTarget - deductedFromRound;

            const currentBalance = Number(userProfile.balance ?? userProfile.highScore ?? 0);

            if (currentBalance >= remainingToDeduct) {
                userProfile.balance = currentBalance - remainingToDeduct;
                deductedFromBalance = remainingToDeduct;
            } else {
                deductedFromBalance = currentBalance;
                userProfile.balance = 0;
            }
            userProfile.highScore = userProfile.balance; // legacy sync

            if (deductedFromBalance > 0) {
                if (!isGuestMode() && effectiveUserId) {
                    updateDoc(doc(db, "users", effectiveUserId), { balance: userProfile.balance, highScore: userProfile.balance });
                } else {
                    scheduleGuestSave();
                }
                updateProfileUI();
            }
}

        getEl('live-score-text').textContent = formatNumberAr(quizState.score);

        renderLives();
        getEl('quiz-proper').classList.add('shake'); setTimeout(()=>getEl('quiz-proper').classList.remove('shake'),500);
        if(qBankIdx === -1) userProfile.wrongQuestionsBank.push(q);

        if (quizState.lives <= 0) {
            getEl('feedback-text').innerHTML = 'نفدت المحاولات! <span class="material-symbols-rounded align-middle text-sm">heart_broken</span>';
            getEl('feedback-text').className = "text-center mt-2 font-bold h-6 text-red-500";
            setTimeout(showReviveModal, transitionDelay);
            return;
        }

        const totalDeducted = deductedFromRound + deductedFromBalance;
        const deductionText = totalDeducted > 0 ? `(-${formatNumberAr(totalDeducted)})` : `(+${formatNumberAr(0)})`;

        getEl('feedback-text').textContent = `إجابة خاطئة ${deductionText}`;
        getEl('feedback-text').className = "text-center mt-2 font-bold h-6 text-red-400";

        updateStreakUI();
        quizState.history.push({ q: q.question, options: q.options, correct: q.correctAnswer, user: idx, isCorrect, topic: q.topic || quizState.contextTopic, fast: (isCorrect && answerTime <= 5000) });
        setTimeout(nextQuestion, transitionDelay);
    }
}

bind('helper-report', 'click', async () => {
    if (isGuestMode()) {
        toast("هذه الميزة تتطلب حساباً. سجّل عبر Google لحفظ ومزامنة بياناتك.", "info");
        showGuestLinkGoogleModal();
        return;
    }
    const q = quizState.questions[quizState.idx];
    const reportData = {
        questionId: q.id || 'N/A', 
        questionText: q.question,
        topic: q.topic || quizState.contextTopic,
        reportedByUserId: effectiveUserId,
        reportedByUsername: userProfile.username,
        timestamp: serverTimestamp() 
    };
    try {
        await setDoc(doc(collection(db, "reports")), reportData);
        toast("✅ تم إرسال السؤال للمطورين للمراجعة التلقائية. شكراً لمساعدتك!", "success");
    } catch (e) {
        console.error("Error sending report:", e);
        toast("❌ فشل إرسال الإبلاغ. الرجاء المحاولة لاحقاً.", "error");
    }
});

bind('share-text-button', 'click', () => {
    if (!userProfile.stats.shareCount) userProfile.stats.shareCount = 0;
    userProfile.stats.shareCount++;
    
    if (effectiveUserId) {
        updateDoc(doc(db, "users", effectiveUserId), {
            "stats.shareCount": userProfile.stats.shareCount
        }).catch(console.error);
    }

    const score = formatNumberAr(quizState.score);
    const correct = formatNumberAr(quizState.correctCount);
    const total = formatNumberAr(quizState.questions.length);
    const accuracy = formatNumberAr(Math.round((quizState.correctCount / quizState.questions.length) * 100));
    
    const message = `🕌 من وحي أهل البيت (ع) 🌟\n` + `لقد حصلت على ${score} نقطة في: ${quizState.contextTopic}!\n` + `✅ الإجابات الصحيحة: ${correct}/${total} (${accuracy}%)\n` + `هل يمكنك تحدي رقمي؟\n` + `#مسابقة_أهل_البيت #ثقافة_شيعية`;
    if (navigator.share) {
        navigator.share({ title: 'تحدي المعرفة - من وحي أهل البيت (ع)', text: message }).then(() => toast('تمت مشاركة النتيجة بنجاح!'));
    } else {
        navigator.clipboard.writeText(message).then(() => { toast('تم نسخ النتيجة إلى الحافظة! شاركها مع أصدقائك.'); });
    }
});

function getCurrentWeekKey() {
    const d = new Date();
    const day = d.getDay(); // 0 (الأحد) - 6 (السبت)
    // حساب العودة لآخر يوم جمعة
    const diff = (day + 2) % 7; 
    
    const lastFriday = new Date(d);
    lastFriday.setDate(d.getDate() - diff);
    
    // التعديل: استخدام التاريخ المحلي يدوياً لمنع مشاكل التوقيت العالمي UTC
    const year = lastFriday.getFullYear();
    const month = String(lastFriday.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(lastFriday.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${dayOfMonth}`;
}

async function endQuiz() {
    // عند إنهاء الجولة، نوقف حالة اللعب ونزيل تأثير الوميض الأحمر إن كان مفعلاً
    quizState.active = false;
    clearLowHealthVignette();

    hide('quiz-proper'); 
    show('results-area');
    
    const safeCorrectCount = Number(quizState.correctCount) || 0;
    const safeTotalQuestions = Number(quizState.questions.length) || 0;
    const accuracy = safeTotalQuestions > 0 ? Math.round((safeCorrectCount / safeTotalQuestions) * 100) : 0;

    animateValue(getEl('card-score'), 0, quizState.score, 500);
 
    getEl('card-username').textContent = userProfile.username;
    getEl('card-difficulty').textContent = quizState.difficulty;
    
    getEl('card-correct-count').innerHTML = `<span class="material-symbols-rounded text-green-400 text-sm align-middle">check_circle</span> ${formatNumberAr(safeCorrectCount)}`;
    getEl('card-wrong-count').innerHTML = `<span class="material-symbols-rounded text-red-400 text-sm align-middle">cancel</span> ${formatNumberAr(safeTotalQuestions - safeCorrectCount)}`;

    let msg = "حاول مرة أخرى";
    if(accuracy === 100) { 
        msg = "أداء مبهر! درجة كاملة"; 
    } else if(accuracy >= 80) msg = "أداء ممتاز!";
    else if(accuracy >= 50) msg = "جيد جداً";
    
    // ✅ نمط الرسالة حسب الفوز/الخسارة (أو نفاد القلوب)
    const isLossResult = (Number(quizState.lives) || 0) <= 0;
    try {
        const sc = getEl('score-card');
        if (sc) {
            sc.classList.remove('result-win', 'result-loss');
            sc.classList.add(isLossResult ? 'result-loss' : 'result-win');
        }
    } catch (_) {}

    getEl('final-message').textContent = isLossResult ? 'نفدت القلوب! حاول مرة أخرى 💔' : msg;

    // ✅ صوت النتيجة (فوز/خسارة) في واجهة النتيجة فقط
    // - فوز: عندما تنتهي الجولة واللاعب ما زال لديه قلوب
    // - خسارة: عند إنهاء الجولة بعد نفاد القلوب (أو بعد إلغاء الإنعاش)
    if (typeof playSound === 'function') {
        playSound(isLossResult ? 'result_loss' : 'result_win');
    }

    const stats = userProfile.stats || {};
    
    const oldTotalCorrect = Number(stats.totalCorrect) || 0;
    const oldTotalQs = Number(stats.totalQuestions) || 0;
    const oldBestScore = Number(stats.bestRoundScore) || 0;
    const oldQuizzesPlayed = Number(stats.quizzesPlayed) || 0;
    
    const currentTodayStr = new Date().toISOString().split('T')[0];
    let lastPlayedDates = Array.isArray(stats.lastPlayedDates) ? stats.lastPlayedDates.filter(d => d !== currentTodayStr).slice(-6) : [];
    if(!lastPlayedDates.includes(currentTodayStr)) lastPlayedDates.push(currentTodayStr);

    const now = new Date();
    const currentHour = now.getHours();
    const isFriday = now.getDay() === 5;
    const isNight = (currentHour >= 0 && currentHour < 5);
    const isMorning = (currentHour >= 5 && currentHour < 9);
    const isAfternoon = (currentHour >= 15 && currentHour < 18);
    const isPerfect = safeCorrectCount === safeTotalQuestions && safeTotalQuestions > 0;

    if (quizState.mode === 'marathon') {
        const currentMarathonScore = quizState.score;
        const maxMarathon = stats.maxMarathonScore || 0;
        if (currentMarathonScore > maxMarathon) {
            stats.maxMarathonScore = currentMarathonScore;
        }
    }

    const newStats = {
        quizzesPlayed: oldQuizzesPlayed + 1,
        totalCorrect: oldTotalCorrect + safeCorrectCount,
        totalQuestions: oldTotalQs + safeTotalQuestions,
        bestRoundScore: Math.max(oldBestScore, quizState.score),
        topicCorrect: stats.topicCorrect || {},
        lastPlayedDates: lastPlayedDates,
        totalHardQuizzes: Number(stats.totalHardQuizzes) || 0,
        noHelperQuizzesCount: (Number(stats.noHelperQuizzesCount) || 0) + (!quizState.usedHelpers ? 1 : 0),
        maxStreak: Math.max((Number(stats.maxStreak) || 0), quizState.streak), 
        fastAnswerCount: (Number(stats.fastAnswerCount) || 0) + (quizState.fastAnswers >= 5 ? 1 : 0),
        enrichmentCount: stats.enrichmentCount || 0,
        explanationsViewed: stats.explanationsViewed || 0,
        marathonCorrectTotal: stats.marathonCorrectTotal || 0,
        reviewedMistakesCount: stats.reviewedMistakesCount || 0,
        nightPlayCount: (stats.nightPlayCount || 0) + (isNight ? 1 : 0),
        morningPlayCount: (stats.morningPlayCount || 0) + (isMorning ? 1 : 0),
        afternoonPlayCount: (stats.afternoonPlayCount || 0) + (isAfternoon ? 1 : 0),
        fridayPlayCount: (stats.fridayPlayCount || 0) + (isFriday ? 1 : 0),
        perfectRounds: (stats.perfectRounds || 0) + (isPerfect ? 1 : 0),
        itemsBought: stats.itemsBought || 0,
        survivorWins: (stats.survivorWins || 0) + (quizState.lives === 1 && safeCorrectCount > 0 ? 1 : 0),
        strategicWins: (stats.strategicWins || 0) + (quizState.hasUsedHelperInSession && safeCorrectCount > 0 ? 1 : 0),
        maxMarathonScore: stats.maxMarathonScore || 0
    };

    let levelReward = null;
    try {
        if (typeof computePlayerLevelProgress === 'function') {
            const oldLevel = computePlayerLevelProgress(oldTotalCorrect).level;
            const newLevel = computePlayerLevelProgress(newStats.totalCorrect).level;
            const gainedLevels = Math.max(0, newLevel - oldLevel);
            if (gainedLevels > 0) {
                levelReward = {
                    score: 100 * gainedLevels,
                    lives: 2 * gainedLevels,
                    fifty: 2 * gainedLevels,
                    hint: 2 * gainedLevels,
                    skip: 2 * gainedLevels
                };
            }
        }
    } catch (_) {}

    const currentTopic = quizState.contextTopic;
    if (currentTopic && currentTopic !== 'عام' && currentTopic !== 'مراجعة الأخطاء') {
        const oldTopicScore = Number(newStats.topicCorrect[currentTopic]) || 0;
        newStats.topicCorrect[currentTopic] = oldTopicScore + safeCorrectCount;
    }

    const currentWeekKey = getCurrentWeekKey();
    let weeklyStats = userProfile.weeklyStats || { key: '', correct: 0 };
    if (weeklyStats.key !== currentWeekKey) { weeklyStats = { key: currentWeekKey, correct: 0 }; }
    weeklyStats.correct += safeCorrectCount;

    const currentMonthKey = getCurrentMonthKey();
    let monthlyStats = userProfile.monthlyStats || { key: '', correct: 0 };
    
    // التحقق من تصفير الشهر وحفظ الفائز
    if (monthlyStats.key && monthlyStats.key !== currentMonthKey) {
        // هذا يعني أننا في شهر جديد، والبيانات القديمة تخص الشهر الماضي
        if (!isGuestMode()) {
            try {
                saveMonthlyWinner(monthlyStats.key);
            } catch(e) { console.error("Error saving monthly winner:", e); }
        }
        
        monthlyStats = { key: currentMonthKey, correct: 0 };
    } else if (!monthlyStats.key) {
        monthlyStats.key = currentMonthKey;
    }
    
    monthlyStats.correct += safeCorrectCount;

    // ✅ نحتسب الأسئلة التي عُرضت فعلياً فقط (بدلاً من كل الأسئلة المحمّلة)
    // لمنع فقدان أسئلة لم تُعرض بسبب انتهاء القلوب/الخروج.
    const playedIds = (quizState.presentedIds && typeof quizState.presentedIds.size === 'number' && quizState.presentedIds.size > 0)
        ? Array.from(quizState.presentedIds)
        : quizState.questions.filter(q => q && q.id).map(q => q.id);

    const isTrueFalseMode = quizState.mode === 'truefalse';

    // ✅ نظام عدم التكرار:
    // - الأوضاع العامة: seenQuestions
    // - صح/خطأ: trueFalseSeen (منفصل حتى لا يلوّث نظام التكرار الرئيسي)
    const oldSeen = Array.isArray(userProfile.seenQuestions) ? userProfile.seenQuestions : [];
    let updatedSeenQuestions = oldSeen;

    const oldTfSeen = Array.isArray(userProfile.trueFalseSeen) ? userProfile.trueFalseSeen : [];
    let updatedTrueFalseSeen = [...new Set([...oldTfSeen, ...playedIds])];
    const MAX_TF_SEEN = 2000;
    if (updatedTrueFalseSeen.length > MAX_TF_SEEN) {
        updatedTrueFalseSeen = updatedTrueFalseSeen.slice(-MAX_TF_SEEN);
    }

    if (!isTrueFalseMode) {
        updatedSeenQuestions = [...new Set([...oldSeen, ...playedIds])];
        // ✅ سقف أعلى للصرامة ضد التكرار (مع حماية حجم الوثيقة)
        const MAX_PROFILE_SEEN = 12000;
        const KEEP_PROFILE_SEEN = 10000;
        if (updatedSeenQuestions.length > MAX_PROFILE_SEEN) {
            updatedSeenQuestions = updatedSeenQuestions.slice(-KEEP_PROFILE_SEEN);
        }
    }

    let updatedWrongQuestionsBank = Array.isArray(userProfile.wrongQuestionsBank) ? userProfile.wrongQuestionsBank : [];
    if (updatedWrongQuestionsBank.length > 15) updatedWrongQuestionsBank = updatedWrongQuestionsBank.slice(-15);

    let updatedSeenMarathon = userProfile.seenMarathonIds || [];
    if (quizState.mode === 'marathon') {
        const playedMarathonIds = quizState.questions
            .slice(0, quizState.idx + 1)
            .map(q => q.id);
        updatedSeenMarathon = [...new Set([...updatedSeenMarathon, ...playedMarathonIds])];
    }

    // ============================
    // Guest Mode: حفظ محلي فقط
    // ============================
    if (isGuestMode()) {
        userProfile.balance = (Number(userProfile.balance ?? userProfile.highScore ?? 0)) + quizState.score;
        userProfile.highScore = userProfile.balance;
        if (levelReward) {
            userProfile.balance += levelReward.score;
            userProfile.highScore = userProfile.balance;
            if (!userProfile.inventory) userProfile.inventory = { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'], frames: ['default'] };
            if (!userProfile.inventory.helpers) userProfile.inventory.helpers = { fifty: 0, hint: 0, skip: 0 };
            userProfile.inventory.lives = (userProfile.inventory.lives || 0) + levelReward.lives;
            userProfile.inventory.helpers.fifty = (userProfile.inventory.helpers.fifty || 0) + levelReward.fifty;
            userProfile.inventory.helpers.hint = (userProfile.inventory.helpers.hint || 0) + levelReward.hint;
            userProfile.inventory.helpers.skip = (userProfile.inventory.helpers.skip || 0) + levelReward.skip;
        }
        userProfile.stats = newStats;
        userProfile.weeklyStats = weeklyStats;
        userProfile.monthlyStats = monthlyStats;
        userProfile.wrongQuestionsBank = updatedWrongQuestionsBank;
        userProfile.seenQuestions = updatedSeenQuestions;
        try { userProfile.__seenQuestionsSet = new Set(updatedSeenQuestions.map(String)); } catch (_) {}
        userProfile.seenMarathonIds = updatedSeenMarathon;
        if (quizState.mode === 'truefalse') {
            userProfile.trueFalseSeen = updatedTrueFalseSeen;
        }

        updateProfileUI();
        scheduleGuestSave(true);

        setTimeout(async () => {
            const gotBadge = await checkAndUnlockBadges();
            if (!gotBadge) { showMotivator(); }
        }, 700);

        addLocalNotification('نهاية جولة', `أتممت جولة في "${quizState.contextTopic}". النتيجة: ${quizState.score} نقطة.`, 'key');
        renderReviewArea();

        // رسالة التشجيع على التسجيل
        setTimeout(() => showGuestEndRoundPrompt(), 900);
        return;
    }

    const firestoreUpdates = {
        balance: increment(quizState.score + (levelReward ? levelReward.score : 0)),
        highScore: increment(quizState.score + (levelReward ? levelReward.score : 0)),
        stats: newStats,
        weeklyStats: weeklyStats,
        monthlyStats: monthlyStats,
        wrongQuestionsBank: updatedWrongQuestionsBank,
        seenMarathonIds: updatedSeenMarathon
    };

    if (levelReward) {
        firestoreUpdates['inventory.lives'] = increment(levelReward.lives);
        firestoreUpdates['inventory.helpers.fifty'] = increment(levelReward.fifty);
        firestoreUpdates['inventory.helpers.hint'] = increment(levelReward.hint);
        firestoreUpdates['inventory.helpers.skip'] = increment(levelReward.skip);
    }

    // ✅ seenQuestions للأوضاع العامة، و trueFalseSeen لوضع صح/خطأ
    if (quizState.mode === 'truefalse') {
        firestoreUpdates.trueFalseSeen = updatedTrueFalseSeen;
    } else {
        firestoreUpdates.seenQuestions = updatedSeenQuestions;
    }

    try {
        await updateDoc(doc(db, "users", effectiveUserId), firestoreUpdates);
        
        userProfile.balance = (Number(userProfile.balance ?? userProfile.highScore ?? 0)) + quizState.score;
                    userProfile.highScore = userProfile.balance;
        if (levelReward) {
            userProfile.balance += levelReward.score;
            userProfile.highScore = userProfile.balance;
            if (!userProfile.inventory) userProfile.inventory = { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'], frames: ['default'] };
            if (!userProfile.inventory.helpers) userProfile.inventory.helpers = { fifty: 0, hint: 0, skip: 0 };
            userProfile.inventory.lives = (userProfile.inventory.lives || 0) + levelReward.lives;
            userProfile.inventory.helpers.fifty = (userProfile.inventory.helpers.fifty || 0) + levelReward.fifty;
            userProfile.inventory.helpers.hint = (userProfile.inventory.helpers.hint || 0) + levelReward.hint;
            userProfile.inventory.helpers.skip = (userProfile.inventory.helpers.skip || 0) + levelReward.skip;
        }
        userProfile.stats = newStats;
        userProfile.weeklyStats = weeklyStats;
        userProfile.monthlyStats = monthlyStats;
        userProfile.wrongQuestionsBank = updatedWrongQuestionsBank;
        userProfile.seenQuestions = updatedSeenQuestions;
        try { userProfile.__seenQuestionsSet = new Set(updatedSeenQuestions.map(String)); } catch (_) {}
        userProfile.seenMarathonIds = updatedSeenMarathon;
        if (quizState.mode === 'truefalse') {
            userProfile.trueFalseSeen = updatedTrueFalseSeen;
        }

        updateProfileUI(); 

        setTimeout(async () => {
            const gotBadge = await checkAndUnlockBadges();
            if (!gotBadge) { showMotivator(); }
        }, 1000);

    } catch(e) {
        console.error("Error saving quiz results:", e);
        toast("تم حفظ النقاط محلياً مؤقتاً لضعف الاتصال", "info");
        userProfile.balance = (Number(userProfile.balance ?? userProfile.highScore ?? 0)) + quizState.score;
                    userProfile.highScore = userProfile.balance;
        if (levelReward) {
            userProfile.balance += levelReward.score;
            userProfile.highScore = userProfile.balance;
            if (!userProfile.inventory) userProfile.inventory = { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'], frames: ['default'] };
            if (!userProfile.inventory.helpers) userProfile.inventory.helpers = { fifty: 0, hint: 0, skip: 0 };
            userProfile.inventory.lives = (userProfile.inventory.lives || 0) + levelReward.lives;
            userProfile.inventory.helpers.fifty = (userProfile.inventory.helpers.fifty || 0) + levelReward.fifty;
            userProfile.inventory.helpers.hint = (userProfile.inventory.helpers.hint || 0) + levelReward.hint;
            userProfile.inventory.helpers.skip = (userProfile.inventory.helpers.skip || 0) + levelReward.skip;
        }
        userProfile.stats = newStats;
        userProfile.weeklyStats = weeklyStats;
        userProfile.monthlyStats = monthlyStats;
        // ✅ حتى مع فشل الحفظ في السيرفر: نثبّت ذاكرة الأسئلة محلياً لمنع التكرار
        userProfile.seenQuestions = updatedSeenQuestions;
        try { userProfile.__seenQuestionsSet = new Set(updatedSeenQuestions.map(String)); } catch (_) {}
        userProfile.seenMarathonIds = updatedSeenMarathon;
        if (quizState.mode === 'truefalse') {
            userProfile.trueFalseSeen = updatedTrueFalseSeen;
        }
        updateProfileUI();
    }

    addLocalNotification('نهاية جولة', `أتممت جولة في "${quizState.contextTopic}". النتيجة: ${quizState.score} نقطة.`, 'key');
    renderReviewArea();
}


function renderReviewArea(){const box=getEl('review-items-container');box.innerHTML='';show('review-area');getEl('review-area').querySelector('h3').textContent="مراجعة الاسئلة ذات الاجابة الخطأ";const tpl=document.getElementById('review-card-template');quizState.history.forEach((h,i)=>{const clone=tpl.content.cloneNode(true);const div=clone.querySelector('.review-item');const qEl=clone.querySelector('.rev-q');const optsBox=clone.querySelector('.rev-opts');const ansEl=clone.querySelector('.rev-ans');div.classList.add(h.isCorrect?'bg-green-900/20':'bg-red-900/20',h.isCorrect?'border-green-800':'border-red-800');qEl.innerHTML=`<span class="material-symbols-rounded ${h.isCorrect?'text-green-400':'text-red-500'} align-middle text-lg">${h.isCorrect?'check_circle':'cancel'}</span> ${formatNumberAr(i+1)}. ${h.q}`;h.options.forEach((o,idx)=>{const sp=document.createElement('span');let cls='block mr-2 text-slate-400';if(idx===h.correct)cls='block mr-2 text-green-400 font-bold';if(idx===h.user)cls=h.isCorrect?'block mr-2 text-green-300 font-bold underline':'block mr-2 text-red-400 line-through';sp.className=cls;sp.textContent=`- ${o}`;optsBox.appendChild(sp)});if(!h.isCorrect){ansEl.textContent=`الصحيح كان: ${h.options[h.correct]}`;ansEl.classList.remove('hidden')}box.appendChild(clone)})}


function updateHelpersUI() {
    const helperIds = ['helper-fifty-fifty', 'helper-hint', 'helper-skip'];
    const isUsed = quizState.usedHelpers; // هل تم استخدام مساعدة في هذا السؤال؟
    const isTrueFalse = quizState.mode === 'truefalse'; // هل تم استخدام مساعدة في هذا السؤال؟

    helperIds.forEach(id => {
        const btn = getEl(id);

        // ✅ صح/خطأ: تعطيل (50/50) و(تلميح) لأن الخيارات خياران فقط
        if (isTrueFalse && (id === 'helper-fifty-fifty' || id === 'helper-hint')) {
            btn.classList.add('hidden');
            btn.disabled = true;
            const oldBadge = btn.querySelector('.count-badge');
            if (oldBadge) oldBadge.remove();
            return;
        } else {
            btn.classList.remove('hidden');
        }
        
        // إذا تم استخدام مساعدة، نعطل كل الأزرار
        // إذا لم يتم، نفعلها
        btn.disabled = isUsed; 
        
        if (isUsed) {
            btn.classList.add('opacity-30', 'cursor-not-allowed', 'grayscale');
            btn.classList.remove('hover:text-amber-400');
        } else {
            btn.classList.remove('opacity-30', 'cursor-not-allowed', 'grayscale');
            btn.classList.add('hover:text-amber-400');
        }

        // إزالة أي شارة قديمة وإعادة رسمها
        const typeKey = id.replace('helper-', '').replace('-fifty', ''); // fifty, hint, skip
        const oldBadge = btn.querySelector('.count-badge');
        if(oldBadge) oldBadge.remove();

        const count = userProfile.inventory.helpers[typeKey === 'fifty-fifty' ? 'fifty' : typeKey] || 0;
        if(count > 0) {
            const badge = document.createElement('span');
            badge.className = 'count-badge';
            badge.textContent = `x${count}`;
            btn.style.position = 'relative';
            btn.appendChild(badge);
        }
    });
    
    // زر الإبلاغ يبقى مفعلاً دائماً
    getEl('helper-report').disabled = false;
}

async function useHelper(type, cost, actionCallback) {
    if(!quizState.active) return;

    // ✅ صح/خطأ: لا نسمح بـ 50/50 أو التلميح حتى لو تم استدعاؤهما برمجياً
    if (quizState.mode === 'truefalse' && (type === 'fifty' || type === 'hint')) {
        toast('هذه المساعدة غير متاحة في (صح/خطأ) لأن الخيارات خياران فقط.', 'info');
        return;
    }

    if (quizState.usedHelpers) {
        toast("عذراً، يسمح بمساعدة واحدة فقط لكل سؤال! 🚫", "error");
        playSound('lose');
        return;
    }

    const hasInventory = userProfile.inventory.helpers[type] > 0;
    if (!hasInventory && quizState.score < cost) {
        toast(`رصيدك غير كافٍ! تحتاج ${cost} نقطة.`, "error");
        return;
    }

    quizState.usedHelpers = true;
    quizState.hasUsedHelperInSession = true;
    actionCallback(); 
        // المهمة 2: استخدام 5 مساعدات (ID: 2)
    dq_updateQuestProgress(2, 1);

    updateHelpersUI(); 
    
    if(hasInventory) {
        userProfile.inventory.helpers[type]--;

        const helperLabelAr = ({
            fifty: 'حذف إجابتين',
            hint: 'تلميح',
            skip: 'تخطي'
        }[type]) || 'مساعدة';

        toast(`تم استخدام ${helperLabelAr} من الحقيبة`);

        if (!isGuestMode() && effectiveUserId) {
            updateDoc(doc(db, "users", effectiveUserId), { [`inventory.helpers.${type}`]: userProfile.inventory.helpers[type] }).catch(console.error);
        } else {
            scheduleGuestSave();
        }
    } else {
        quizState.score -= cost;
        getEl('live-score-text').textContent = formatNumberAr(quizState.score);
        toast(`تم خصم ${cost} نقطة`);
    }
}


bind('helper-fifty-fifty', 'click', () => {
    useHelper('fifty', 4, () => {
        const q = quizState.questions[quizState.idx];
        const opts = Array.from(document.querySelectorAll('.option-btn'));
        if (!opts.length) return;

        const indices = opts.map((_, i) => i).sort(() => Math.random() - 0.5);
        const removeTarget = Math.min(2, Math.max(0, opts.length - 1));
        let removed = 0;

        indices.forEach(i => {
            if (i !== q.correctAnswer && removed < removeTarget) {
                opts[i].classList.add('option-hidden');
                removed++;
            }
        });
    });
});

bind('helper-hint', 'click', () => {
    useHelper('hint', 3, () => {
        const q = quizState.questions[quizState.idx];
        const opts = Array.from(document.querySelectorAll('.option-btn'));
        if (!opts.length) return;

        // Hint: remove one wrong option if possible
        const removeTarget = opts.length > 2 ? 1 : 0;
        if (removeTarget === 0) {
            toast('التلميح غير متاح لهذا السؤال.', 'info');
            return;
        }

        const indices = opts.map((_, i) => i).sort(() => Math.random() - 0.5);
        let removed = 0;

        indices.forEach(i => {
            if (i !== q.correctAnswer && removed < removeTarget) {
                opts[i].classList.add('option-hidden');
                removed++;
            }
        });
    });
});

bind('helper-skip', 'click', () => {
    useHelper('skip', 1, () => {
        nextQuestion();
    });
});

bind('action-fav', 'click', async () => {
    const q = quizState.questions[quizState.idx];
    const isAlreadyFavorite = userProfile.favorites.some(fav => fav.question === q.question);
    if (!isAlreadyFavorite) {
        // وضع الضيف: حفظ محلي فقط
        if (isGuestMode() || !effectiveUserId) {
            userProfile.favorites.push(q);
            scheduleGuestSave(true);
            toast("تم الحفظ في المفضلة");
            return;
        }
        await updateDoc(doc(db,"users",effectiveUserId),{favorites:arrayUnion(q)});
        userProfile.favorites.push(q); 
        toast("تم الحفظ في المفضلة");
    } else { toast("السؤال موجود بالفعل في المفضلة", "error"); }
});

/* =========================================
   Step 2: Smart Navigation Logic
   ========================================= */

