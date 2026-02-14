/*
  True/False mode (صح أو خطأ)
  - Uses the main quiz engine UI (quiz-proper) to match Challenge/Marathon flow.
  - Separate anti-repeat memory: userProfile.trueFalseSeen + localStorage.
  - Hearts + win/loss result screen come from the core engine.
*/

(() => {
  const TF_DATA_URL = 'Data/Noor/truefalse.json';

  const tfState = {
    loaded: false,
    questions: [],
    // normalized ids list (string)
    ids: [],
    // current selected round length
    selectedCount: 'all',
    // seen set (string)
    seen: new Set(),
    lastUid: null,
    saveTimer: null,
    needsSave: false,
  };
const TF_UNLOCK_COST = 10000;
  const TF_WAIT_PERIOD_MS = 24 * 60 * 60 * 1000;
  let tfSealTimerInterval = null;

  function tfSealStorageKey() {
    const uid = currentUid();
    return `noor_tf_seal_${uid}`;
  }

  function getTrueFalseSealTimestamp() {
    try {
      if (userProfile && userProfile.trueFalseSealDate) {
        return Number(userProfile.trueFalseSealDate) || 0;
      }
    } catch (_) {}

    try {
      const raw = localStorage.getItem(tfSealStorageKey());
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    } catch (_) {}

    return 0;
  }

  function setTrueFalseSealTimestamp(ts) {
    const n = Number(ts) || Date.now();

    try {
      if (userProfile) userProfile.trueFalseSealDate = n;
    } catch (_) {}

    try { localStorage.setItem(tfSealStorageKey(), String(n)); } catch (_) {}

    try {
      if (typeof isGuestMode === 'function' && isGuestMode()) {
        if (typeof scheduleGuestSave === 'function') scheduleGuestSave();
        return;
      }
      if (window.effectiveUserId && window.db && window.doc && window.updateDoc) {
        updateDoc(doc(db, 'users', effectiveUserId), { trueFalseSealDate: n }).catch(() => {});
      }
    } catch (_) {}
  }

  function clearTrueFalseSealTimestamp() {
    try { localStorage.removeItem(tfSealStorageKey()); } catch (_) {}
    try {
      if (userProfile) delete userProfile.trueFalseSealDate;
    } catch (_) {}

    try {
      if (typeof isGuestMode === 'function' && isGuestMode()) {
        if (typeof scheduleGuestSave === 'function') scheduleGuestSave();
        return;
      }
      if (window.effectiveUserId && window.db && window.doc && window.updateDoc) {
        const payload = {};
        if (typeof deleteField === 'function') payload.trueFalseSealDate = deleteField();
        else payload.trueFalseSealDate = null;
        updateDoc(doc(db, 'users', effectiveUserId), payload).catch(() => {});
      }
    } catch (_) {}
  }

  function closeUnlockModalSafely() {
    const modal = safeEl('unlock-modal');
    if (!modal) return;

    if (tfSealTimerInterval) clearInterval(tfSealTimerInterval);
    tfSealTimerInterval = null;

    modal.classList.remove('active');
    setTimeout(() => modal.classList.add('hidden'), 300);
  }

  function unlockTrueFalseNow(cost) {
    // 1) خصم النقاط عند الدفع فقط
    if (cost > 0) {
      const prevBalance = Number(userProfile.balance ?? userProfile.highScore ?? 0);
      userProfile.balance = Math.max(0, prevBalance - cost);
      userProfile.highScore = userProfile.balance;
    }

    // 2) تصفير ختم صح/خطأ
    tfState.seen = new Set();
    if (userProfile) userProfile.trueFalseSeen = [];
    persistSeenLocal();
    clearTrueFalseSealTimestamp();
    updateTrueFalseCardStats();

    if (typeof updateProfileUI === 'function') updateProfileUI();

    // 3) حفظ (ضيف/مسجل)
    try {
      if (typeof isGuestMode === 'function' && isGuestMode()) {
        if (typeof scheduleGuestSave === 'function') scheduleGuestSave(true);
      } else if (window.effectiveUserId && window.db && window.doc && window.updateDoc) {
        const payload = { trueFalseSeen: [] };
        if (cost > 0) {
          payload.balance = userProfile.balance;
          payload.highScore = userProfile.highScore;
        }
        if (typeof deleteField === 'function') payload.trueFalseSealDate = deleteField();
        else payload.trueFalseSealDate = null;

        updateDoc(doc(db, 'users', effectiveUserId), payload).catch(() => {});
      }
    } catch (_) {}

    if (cost > 0) {
      toast('تم فتح (صح/خطأ) بنجاح!', 'success');
      if (window.playSound) window.playSound('win');
    } else {
      toast('انتهت مدة الانتظار وتم فتح (صح/خطأ) مجاناً.', 'success');
    }
  }

  function showTrueFalseSealModal(sealedTimestamp, countSelToStart) {
    const modal = safeEl('unlock-modal');
    if (!modal) return;

    const timerText = safeEl('unlock-timer');
    const payBtn = safeEl('btn-pay-unlock');
    if (!timerText || !payBtn) return;

    if (tfSealTimerInterval) clearInterval(tfSealTimerInterval);

    // السعر: 10,000
    payBtn.innerHTML = `
        <span class="flex items-center gap-2">
            <span class="material-symbols-rounded">key</span> فتح الآن
        </span>
        <span class="bg-black/20 px-3 py-1 rounded text-xs flex items-center gap-1">
            10,000 <span class="material-symbols-rounded text-[10px]">monetization_on</span>
        </span>
    `;

    modal.classList.remove('hidden');

    const pad = (num) => num.toString().padStart(2, '0');

    const updateCountdown = () => {
      const now = Date.now();
      const timeLeft = TF_WAIT_PERIOD_MS - (now - sealedTimestamp);

      if (timeLeft <= 0) {
        closeUnlockModalSafely();
        unlockTrueFalseNow(0);
        return;
      }

      const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

      timerText.textContent = `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
      timerText.style.direction = "ltr";
    };

    updateCountdown();
    tfSealTimerInterval = setInterval(updateCountdown, 1000);

    payBtn.onclick = () => {
      const bal = Number(userProfile.balance ?? userProfile.highScore ?? 0);

      if (bal >= TF_UNLOCK_COST) {
        closeUnlockModalSafely();

        if (typeof window.showConfirm === 'function') {
          window.showConfirm(
            "فك الختم",
            "هل تريد دفع 10,000 نقطة لإعادة فتح (صح/خطأ) الآن؟",
            "key",
            () => {
              unlockTrueFalseNow(TF_UNLOCK_COST);
              startTrueFalseRound(countSelToStart);
            }
          );
        } else {
          unlockTrueFalseNow(TF_UNLOCK_COST);
          startTrueFalseRound(countSelToStart);
        }
      } else {
        toast("رصيدك غير كافٍ (تحتاج 10,000 نقطة)", "error");
        if (window.playSound) window.playSound('lose');
      }
    };

    const closeBtn = modal.querySelectorAll('button')[1];
    if (closeBtn) {
      closeBtn.onclick = () => {
        closeUnlockModalSafely();
      };
    }

    setTimeout(() => {
      modal.classList.add('active');
    }, 10);

    if (window.playSound) window.playSound('hint');
  }

  function gateTrueFalseIfSealed(countSel) {
    if (!tfState.loaded || !tfState.ids.length) return true;

    rebuildSeenSet();

    const total = tfState.ids.length;
    const done = Array.from(tfState.seen).filter(id => tfState.ids.includes(id)).length;

    if (total > 0 && done >= total) {
      let sealedTimestamp = getTrueFalseSealTimestamp();
      const now = Date.now();

      if (!sealedTimestamp) {
        sealedTimestamp = now;
        setTrueFalseSealTimestamp(now);
      }

      const diff = now - sealedTimestamp;
      if (diff >= TF_WAIT_PERIOD_MS) {
        unlockTrueFalseNow(0);
        return true;
      }

      showTrueFalseSealModal(sealedTimestamp, countSel);
      return false;
    }

    return true;
  }
  // ---------- utils ----------
  function safeEl(id) {
    try { return document.getElementById(id); } catch (_) { return null; }
  }

  function normalizeId(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function currentUid() {
    return (typeof effectiveUserId !== 'undefined' && effectiveUserId) ? effectiveUserId : 'guest';
  }

  function tfStorageKey() {
    const uid = currentUid();
    return `noor_tf_seen_${uid}`;
  }

  function loadSeenFromLocalStorage() {
    try {
      const raw = localStorage.getItem(tfStorageKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeId).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function readProfileTfSeen() {
    try {
      if (!userProfile) return [];
      const a = userProfile.trueFalseSeen;
      if (!Array.isArray(a)) return [];
      return a.map(normalizeId).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function rebuildSeenSet() {
    // Merge profile + localStorage for robustness
    tfState.lastUid = currentUid();
    const merged = new Set();
    for (const id of readProfileTfSeen()) merged.add(id);
    for (const id of loadSeenFromLocalStorage()) merged.add(id);
    tfState.seen = merged;
  }

  function persistSeenLocal() {
    try {
      localStorage.setItem(tfStorageKey(), JSON.stringify(Array.from(tfState.seen)));
    } catch (_) {}
  }

  async function persistSeenRemote() {
    // Debounced + safe; only if logged in
    try {
      if (typeof isGuestMode === 'function' && isGuestMode()) return;
      if (!window.effectiveUserId) return;
      if (!window.db || !window.doc || !window.updateDoc) return;

      // Keep the list bounded to avoid doc bloat
      let list = Array.from(tfState.seen);
      const MAX = 2000;
      if (list.length > MAX) list = list.slice(-MAX);

      await updateDoc(doc(db, 'users', effectiveUserId), { trueFalseSeen: list });
    } catch (_) {
      // Silent; endQuiz will also persist at the end
    }
  }

  function scheduleSeenSave() {
    tfState.needsSave = true;
    persistSeenLocal();

    if (tfState.saveTimer) clearTimeout(tfState.saveTimer);
    tfState.saveTimer = setTimeout(async () => {
      tfState.saveTimer = null;
      if (!tfState.needsSave) return;
      tfState.needsSave = false;
      await persistSeenRemote();
    }, 1200);
  }

  // Exposed for the core renderer (called when the question is presented)
  window.markTrueFalseAsSeen = function markTrueFalseAsSeen(id) {
    const sid = normalizeId(id);
    if (!sid) return;

    // Ensure we have the latest set after login/logout
    if (!tfState.lastUid || tfState.lastUid !== currentUid()) {
      rebuildSeenSet();
    }

    if (!tfState.seen.has(sid)) {
      tfState.seen.add(sid);

      // Mirror into profile (for guest save & UI)
      try {
        if (userProfile) {
          const arr = Array.isArray(userProfile.trueFalseSeen) ? userProfile.trueFalseSeen : [];
          arr.push(sid);
          userProfile.trueFalseSeen = Array.from(new Set(arr.map(normalizeId).filter(Boolean)));
        }
      } catch (_) {}

      scheduleSeenSave();
      updateTrueFalseCardStats();
      try {
        if (tfState.loaded && tfState.ids.length && !getTrueFalseSealTimestamp()) {
          const total = tfState.ids.length;
          const done = Array.from(tfState.seen).filter(id => tfState.ids.includes(id)).length;
          if (done >= total) setTrueFalseSealTimestamp(Date.now());
        }
      } catch (_) {}
    }
  };

  // ---------- UI: Home card + modal stats ----------
  function updateProgressUI(total, done) {
    const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;

    const fillHome = safeEl('tf-home-progress');
    const txtHome = safeEl('tf-home-progress-text');
    const remHome = safeEl('tf-home-remaining');
    const badgeHome = safeEl('tf-home-badge');

    if (fillHome) fillHome.style.width = `${pct}%`;
    if (txtHome) txtHome.textContent = `${formatNumberAr(done)}/${formatNumberAr(total)}`;
    if (remHome) remHome.textContent = `متبقي ${formatNumberAr(Math.max(0, total - done))}`;
    if (badgeHome) {
      if (total > 0 && done >= total) badgeHome.classList.remove('hidden');
      else badgeHome.classList.add('hidden');
    }

    const fillModal = safeEl('tf-modal-progress-fill');
    const txtModal = safeEl('tf-modal-progress-text');
    const remModal = safeEl('tf-modal-remaining');
    if (fillModal) fillModal.style.width = `${pct}%`;
    if (txtModal) txtModal.textContent = `${formatNumberAr(done)}/${formatNumberAr(total)}`;
    if (remModal) remModal.textContent = `متبقي ${formatNumberAr(Math.max(0, total - done))}`;
  }

  window.updateTrueFalseCardStats = function updateTrueFalseCardStats() {
    try {
      if (!tfState.loaded) {
        updateProgressUI(0, 0);
        return;
      }

      rebuildSeenSet();

      const total = tfState.ids.length;
      const done = Array.from(tfState.seen).filter(id => tfState.ids.includes(id)).length;
      updateProgressUI(total, done);
    } catch (_) {
      // noop
    }
  };

  // ---------- Build a round ----------
  function buildRoundQuestions(countSel) {
    rebuildSeenSet();

    const all = tfState.questions.slice();
    const total = all.length;

    const remaining = all.filter(q => q && q.id && !tfState.seen.has(String(q.id)));

    if (countSel === 'all') {
      if (remaining.length > 0) {
        return shuffle(remaining);
      }
      // Completed: review mode
      try { toast('تم ختم صح/خطأ ✅ بدء وضع المراجعة.', 'info'); } catch (_) {}
      return shuffle(all);
    }

    const n = Math.max(1, Number(countSel) || 15);
    if (remaining.length === 0) {
      // Nothing remaining
      try { toast('لا توجد أسئلة متبقية. سيتم بدء وضع المراجعة.', 'info'); } catch (_) {}
      return shuffle(all).slice(0, Math.min(n, total));
    }

    if (remaining.length < n) {
      // Respect anti-repeat: do not fill with old ones
      try { toast(`متبقي ${remaining.length} سؤال فقط في الختم.`, 'info'); } catch (_) {}
      return shuffle(remaining);
    }

    return shuffle(remaining).slice(0, n);
  }

  function startTrueFalseRound(countSel) {
    if (!tfState.loaded || !tfState.questions.length) {
      try { toast('جاري تحميل أسئلة صح/خطأ... حاول بعد لحظات.', 'info'); } catch (_) {}
      return;
    }
if (!gateTrueFalseIfSealed(countSel)) return;
    const roundQs = buildRoundQuestions(countSel);
    if (!roundQs || roundQs.length === 0) {
      try { toast('لا توجد أسئلة متاحة حالياً.', 'error'); } catch (_) {}
      return;
    }

    // Prepare quiz state
    quizState.mode = 'truefalse';
    quizState.contextTopic = 'صح أو خطأ';
    quizState.difficulty = 'صح/خطأ';

    // Important: the core expects this structure
    quizState.questions = roundQs.map(q => ({
      id: normalizeId(q.id),
      topic: 'صح أو خطأ',
      question: q.question,
      options: ['صح', 'خطأ'],
      correctAnswer: q.correctAnswer,
      // keep original fields for review
      _origin: 'truefalse',
    }));

    // Close modal (if open)
    const modal = safeEl('truefalse-rules-modal');
    if (modal) modal.classList.remove('active');

    // Start via main engine
    if (typeof startQuiz === 'function') {
      startQuiz();
    } else {
      try { toast('تعذر بدء الجولة (startQuiz غير متاح).', 'error'); } catch (_) {}
    }
  }

  // ---------- Modal flow ----------
  function setRoundSelection(sel) {
    tfState.selectedCount = sel;
    const btns = Array.from(document.querySelectorAll('.tf-round-btn'));
    btns.forEach(b => {
      if ((b.getAttribute('data-count') || '') === sel) {
        b.classList.add('ring-2', 'ring-amber-400', 'border-amber-500/60');
        b.classList.remove('border-slate-700');
      } else {
        b.classList.remove('ring-2', 'ring-amber-400', 'border-amber-500/60');
        b.classList.add('border-slate-700');
      }
    });

    const note = safeEl('tf-modal-note');
    if (note) {
      if (sel === 'all') note.textContent = 'الجولة «كامل» تلعب كل الأسئلة المتبقية حتى نهاية الختم.';
      else note.textContent = `جولة ${formatNumberAr(Number(sel) || 15)} سؤال من المتبقي في الختم.`;
    }
  }

  function openTrueFalseModal() {
    const modal = safeEl('truefalse-rules-modal');
    if (!modal) return;

    updateTrueFalseCardStats();
    setRoundSelection(tfState.selectedCount);

    modal.classList.add('active');
  }

  async function resetTrueFalseProgress() {
    try {
      rebuildSeenSet();
      tfState.seen = new Set();
      if (userProfile) userProfile.trueFalseSeen = [];
      persistSeenLocal();
clearTrueFalseSealTimestamp();
      if (typeof isGuestMode === 'function' && !isGuestMode() && window.effectiveUserId && window.db) {
        try {
          await updateDoc(doc(db, 'users', effectiveUserId), { trueFalseSeen: [] });
        } catch (_) {}
      }

      updateTrueFalseCardStats();
      toast('تمت إعادة ضبط ختم (صح/خطأ).', 'success');
    } catch (_) {
      toast('تعذر إعادة الضبط.', 'error');
    }
  }

  function bindUI() {
    const startBtn = safeEl('btn-tf-start');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        try { playSound('click'); } catch (_) {}
        openTrueFalseModal();
      });
    }

    // Old view back button -> just go home
    const backOld = safeEl('btn-back-truefalse');
    if (backOld) {
      backOld.addEventListener('click', () => {
        try { playSound('click'); } catch (_) {}
        if (typeof navToHome === 'function') navToHome();
      });
    }

    // selection buttons
    document.querySelectorAll('.tf-round-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        try { playSound('click'); } catch (_) {}
        setRoundSelection(btn.getAttribute('data-count') || '15');
      });
    });

    const confirmBtn = safeEl('btn-tf-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        try { playSound('click'); } catch (_) {}
        startTrueFalseRound(tfState.selectedCount);
      });
    }

    const resetBtn = safeEl('tf-reset-progress');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        try { playSound('click'); } catch (_) {}
        if (typeof showConfirmModal === 'function') {
          showConfirmModal(
            'إعادة ضبط ختم صح/خطأ',
            'سيتم حذف سجل الأسئلة التي عُرضت لك في (صح/خطأ) فقط، وسيعود الختم إلى البداية. هل تريد المتابعة؟',
            async () => { await resetTrueFalseProgress(); }
          );
        } else {
          // fallback
          resetTrueFalseProgress();
        }
      });
    }
  }

  // ---------- Load data ----------
  async function loadTrueFalseQuestions() {
    try {
      const res = await fetch(TF_DATA_URL);
      if (!res.ok) throw new Error('TF fetch failed');
      const data = await res.json();

      // Normalize
      const normalized = (Array.isArray(data) ? data : []).map((item, idx) => {
        const id = normalizeId(item?.id || `tf_${idx + 1}`);
        const question = String(item?.q || '').trim();
        const a = !!item?.a;
        const correctAnswer = a ? 0 : 1; // options: [صح, خطأ]
        return { id, question, correctAnswer };
      }).filter(q => q.id && q.question);

      tfState.questions = normalized;
      tfState.ids = normalized.map(q => normalizeId(q.id));
      tfState.loaded = true;

      rebuildSeenSet();
      updateTrueFalseCardStats();

      // Also refresh modal stats if open
      const modal = safeEl('truefalse-rules-modal');
      if (modal && modal.classList.contains('active')) {
        updateTrueFalseCardStats();
      }
    } catch (e) {
      console.error('TrueFalse load error:', e);
      tfState.loaded = false;
      try { toast('تعذر تحميل أسئلة صح/خطأ.', 'error'); } catch (_) {}
      updateTrueFalseCardStats();
    }
  }

  // init
  function boot() {
    bindUI();
    loadTrueFalseQuestions();

    // Recompute progress after login/logout changes
    setInterval(() => {
      // If user switched, refresh seen key merge
      if (tfState.loaded) updateTrueFalseCardStats();
    }, 6000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
