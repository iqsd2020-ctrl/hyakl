/* =========================================================
   🎁 giftday.js — نظام المكافأة اليومية (Streak Cycle 7 أيام)

   - يُستورد ديناميكيًا من main.js لتخفيف الحمل على main.js
   - يعتمد على نافذة HTML الحالية: #daily-reward-modal
   - يعيد API بسيط:
       const api = createGiftdayAPI(ctx)
       api.checkAndShowDailyReward()
       api.claimDailyReward()

   ✅ عدّل هذا القسم فقط لتغيير المكافآت:
   ========================================================= */

const GIFTDAY_TABLE = {
  1: { points: 100, lives: 1, helpers: { hint: 0, skip: 0, fifty: 0 } },
  2: { points: 0,   lives: 2, helpers: { hint: 0, skip: 0, fifty: 0 } },
  3: { points: 100, lives: 1, helpers: { hint: 1, skip: 0, fifty: 0 } }, // "مساعدة" = تلميح
  4: { points: 150, lives: 0, helpers: { hint: 0, skip: 1, fifty: 0 } },
  5: { points: 200, lives: 1, helpers: { hint: 0, skip: 0, fifty: 1 } }, // fifty = حذف إجابتين
  6: { points: 250, lives: 1, helpers: { hint: 1, skip: 1, fifty: 0 } },
  7: { points: 500, lives: 2, helpers: { hint: 2, skip: 2, fifty: 2 } }  // الجائزة الكبرى
};

function __getDailyRewardPackage(day) {
  return GIFTDAY_TABLE[day] || GIFTDAY_TABLE[1];
}

// ---------- Date helpers ----------
function __dateKey(d = new Date()) {
  // نفس الأسلوب المستخدم في المشروع لتوحيد السلوك
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function __yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return __dateKey(d);
}

function __calcNextDailyRewardState(profile) {
  const today = __dateKey();
  const yesterday = __yesterdayKey();
  const last = (profile && typeof profile.lastDailyRewardDate === 'string') ? profile.lastDailyRewardDate : '';
  const streak = Number(profile?.dailyRewardStreakDay) || 0;

  // إذا استلم اليوم: غير مؤهل
  if (last === today) {
    const safeDay = (streak >= 1 && streak <= 7) ? streak : 1;
    return { eligible: false, day: safeDay, today };
  }

  // إذا استلم أمس: يكمل السلسلة
  if (last === yesterday && streak >= 1 && streak <= 7) {
    const nextDay = (streak === 7) ? 1 : (streak + 1);
    return { eligible: true, day: nextDay, today };
  }

  // غير ذلك: انقطاع -> يرجع لليوم 1
  return { eligible: true, day: 1, today };
}

function __renderDailyRewardModal(modal, day, reward, ctx) {
  if (!modal) return;

  const formatNumberAr = ctx?.formatNumberAr;

  // عنوان اليوم
  const h3 = modal.querySelector('h3');
  if (h3) {
    const dTxt = (typeof formatNumberAr === 'function') ? formatNumberAr(day, true) : String(day);
    const allTxt = (typeof formatNumberAr === 'function') ? formatNumberAr(7, true) : '7';
    h3.textContent = `المكافأة اليومية`;
  }

  // صندوق عرض المكافأة (في HTML عندك هو div له class bg-slate-800/60)
  const box = modal.querySelector('div.bg-slate-800\\/60');
  if (!box) return;

  const items = [];

  const pushItem = (value, label, valueClass) => {
    if (!value) return;
    const vTxt = (typeof formatNumberAr === 'function') ? `+${formatNumberAr(value, true)}` : `+${value}`;
    items.push(`
      <div class="text-center">
        <span class="block ${valueClass} font-bold text-2xl font-heading">${vTxt}</span>
        <span class="text-[10px] text-slate-400">${label}</span>
      </div>
    `);
  };

  pushItem(reward.points, 'نقطة', 'text-amber-400');
  pushItem(reward.lives, 'قلب', 'text-red-500');
  pushItem(reward.helpers?.hint, 'تلميح', 'text-sky-300');
  pushItem(reward.helpers?.skip, 'تخطي', 'text-violet-300');
  pushItem(reward.helpers?.fifty, 'حذف إجابتين', 'text-emerald-300');

  // فواصل
  box.innerHTML = items
    .filter(Boolean)
    .join('<div class="w-px h-10 bg-slate-600"></div>');
}

// =========================================================
// Public API
// =========================================================

export function createGiftdayAPI(ctx) {
  // ctx getters لتفادي التقاط قيم قديمة عند تسجيل الدخول/الخروج
  const getUserProfile = ctx?.getUserProfile || (() => ctx?.userProfile);
  const getEffectiveUserId = ctx?.getEffectiveUserId || (() => ctx?.effectiveUserId);

  const isGuestMode = ctx?.isGuestMode;
  const scheduleGuestSave = ctx?.scheduleGuestSave;

  const db = ctx?.db;
  const doc = ctx?.doc;
  const updateDoc = ctx?.updateDoc;

  const toast = ctx?.toast;
  const updateProfileUI = ctx?.updateProfileUI;
  const playSound = ctx?.playSound;
  const launchConfetti = ctx?.launchConfetti;
  const addLocalNotification = ctx?.addLocalNotification;

  async function checkAndShowDailyReward() {
    const userProfile = getUserProfile();
    if (!userProfile) return;

    const state = __calcNextDailyRewardState(userProfile);
    if (!state.eligible) return;

    const modal = document.getElementById('daily-reward-modal');
    if (!modal) return;

    const reward = __getDailyRewardPackage(state.day);
    modal.dataset.rewardDay = String(state.day);
    __renderDailyRewardModal(modal, state.day, reward, ctx);

    setTimeout(() => {
      modal.classList.add('active');
      if (typeof playSound === 'function') playSound('streak');
    }, 1500);
  }

  async function claimDailyReward() {
    const modal = document.getElementById('daily-reward-modal');
    if (!modal) return;

    const btn = modal.querySelector('button');
    if (!btn) return;

    // منع النقر المتكرر
    btn.disabled = true;
    btn.textContent = 'جاري الاستلام...';

    try {
      const userProfile = getUserProfile();
      if (!userProfile) throw new Error('No profile loaded');

      const state = __calcNextDailyRewardState(userProfile);
      if (!state.eligible) {
        if (typeof toast === 'function') toast('لقد استلمت مكافأة اليوم بالفعل');
        modal.classList.remove('active');
        return;
      }

      const day = Number(modal.dataset.rewardDay) || state.day;
      const reward = __getDailyRewardPackage(day);

      // ضمان وجود البنية
      if (!userProfile.inventory) userProfile.inventory = { lives: 0, helpers: { fifty: 0, hint: 0, skip: 0 }, themes: ['default'], frames: ['default'] };
      if (!userProfile.inventory.helpers) userProfile.inventory.helpers = { fifty: 0, hint: 0, skip: 0 };

      // 1) تحديث القيم محلياً
      const prevBalance = Number(userProfile.balance ?? userProfile.highScore ?? 0) || 0;
      userProfile.balance = prevBalance + (Number(reward.points) || 0);
      userProfile.highScore = userProfile.balance; // legacy sync

      userProfile.inventory.lives = (Number(userProfile.inventory.lives) || 0) + (Number(reward.lives) || 0);

      userProfile.inventory.helpers.hint  = (Number(userProfile.inventory.helpers.hint)  || 0) + (Number(reward.helpers?.hint)  || 0);
      userProfile.inventory.helpers.skip  = (Number(userProfile.inventory.helpers.skip)  || 0) + (Number(reward.helpers?.skip)  || 0);
      userProfile.inventory.helpers.fifty = (Number(userProfile.inventory.helpers.fifty) || 0) + (Number(reward.helpers?.fifty) || 0);

      userProfile.lastDailyRewardDate = state.today;
      userProfile.dailyRewardStreakDay = day;

      // 2) الحفظ (مسجل -> Firestore، ضيف -> localStorage)
      const guest = (typeof isGuestMode === 'function') ? !!isGuestMode() : false;
      const effectiveUserId = getEffectiveUserId();

      if (!guest && effectiveUserId && db && doc && updateDoc) {
        await updateDoc(doc(db, 'users', effectiveUserId), {
          balance: userProfile.balance,
          highScore: userProfile.balance,
          'inventory.lives': userProfile.inventory.lives,
          'inventory.helpers.hint': userProfile.inventory.helpers.hint,
          'inventory.helpers.skip': userProfile.inventory.helpers.skip,
          'inventory.helpers.fifty': userProfile.inventory.helpers.fifty,
          lastDailyRewardDate: state.today,
          dailyRewardStreakDay: day
        });
      } else {
        if (typeof scheduleGuestSave === 'function') scheduleGuestSave(true);
      }

      // 3) تحديث الواجهة والمؤثرات
      if (typeof updateProfileUI === 'function') updateProfileUI();

      if (day === 7) {
        if (typeof playSound === 'function') playSound('applause');
        if (typeof launchConfetti === 'function') launchConfetti();
      } else {
        if (typeof playSound === 'function') playSound('click');
      }

      const parts = [];
      const fmt = (n) => (typeof ctx?.formatNumberAr === 'function') ? ctx.formatNumberAr(n, true) : String(n);

      if (reward.points) parts.push(`${fmt(reward.points)} نقطة`);
      if (reward.lives) parts.push(`${fmt(reward.lives)} قلب`);
      if (reward.helpers?.hint) parts.push(`${fmt(reward.helpers.hint)} تلميح`);
      if (reward.helpers?.skip) parts.push(`${fmt(reward.helpers.skip)} تخطي`);
      if (reward.helpers?.fifty) parts.push(`${fmt(reward.helpers.fifty)} حذف إجابتين`);

      if (typeof toast === 'function') toast(`تم استلام: ${parts.join(' + ')}`);
      if (typeof addLocalNotification === 'function') {
        addLocalNotification('مكافأة يومية', `تم استلام مكافأة اليوم ${day}/7`, 'card_giftcard');
      }

      modal.classList.remove('active');

    } catch (e) {
      console.error('Error claiming reward:', e);
      if (typeof toast === 'function') toast('حدث خطأ في الاتصال', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'استلام المكافأة';
    }
  }

  return {
    checkAndShowDailyReward,
    claimDailyReward
  };
}
