// js/daily_quests.js
import { doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { topicsData } from "./data.js";

// ==============================
// ✅ Dependencies injected from main.js
// ==============================
let db = null;
let effectiveUserId = null;
let userProfile = null;

let toast = null;
let openBag = null;
let switchBagTab = null;
let isGuestMode = null;
let scheduleGuestSave = null;
let playSound = null;
let updateProfileUI = null;
let launchConfetti = null;
let addLocalNotification = null;
let getCurrentWeekKey = null;
let getCurrentMonthKey = null;

/**
 * اربط هذا الملف مع سياق التطبيق من main.js.
 * استدعِ هذه الدالة عند تغيّر userProfile أو effectiveUserId.
 */
export function bindDailyQuestsDeps(deps) {
  db = deps.db;
  effectiveUserId = deps.effectiveUserId;
  userProfile = deps.userProfile;

  toast = deps.toast;
  openBag = deps.openBag;
  switchBagTab = deps.switchBagTab;
  isGuestMode = deps.isGuestMode;
  scheduleGuestSave = deps.scheduleGuestSave;
  playSound = deps.playSound;
  updateProfileUI = deps.updateProfileUI;
  launchConfetti = deps.launchConfetti;
  addLocalNotification = deps.addLocalNotification;
  getCurrentWeekKey = deps.getCurrentWeekKey;
  getCurrentMonthKey = deps.getCurrentMonthKey;
}

// --- دوال واجهة المستخدم للمهام ---

// 1. فتح النافذة وتحديث البيانات
export function openQuestModal() {
  const modal = document.getElementById("quest-modal");
  modal.classList.remove("quest-hidden");
  // تأخير بسيط لتفعيل الأنيميشن
  setTimeout(() => {
    modal.classList.add("active");
  }, 10);

  renderQuestList(); // تحديث القائمة عند الفتح
}

// 2. إغلاق النافذة
export function closeQuestModal() {
  const modal = document.getElementById("quest-modal");
  modal.classList.remove("active");
  setTimeout(() => {
    modal.classList.add("quest-hidden");
  }, 300);
}

// دالة توجيه المهام الذكية (مصححة حسب ملف data.js)
async function executeQuestAction(taskId) {
  // 1. إغلاق نافذة المهام
  closeQuestModal();

  // 2. التعامل مع كل مهمة
  switch (taskId) {
    case 1: // المعصومين
      if (document.getElementById("category-select")) {
        // ✅ المفتاح الدقيق كما هو في ملف data.js
        const catKey = "المعصومون (عليهم السلام)";

        // ضبط القائمة المنسدلة
        document.getElementById("category-select").value = catKey;

        // جلب المواضيع الفرعية من المتغير المستورد topicsData
        let subTopics = [];
        if (typeof topicsData !== "undefined" && topicsData[catKey]) {
          subTopics = topicsData[catKey];
        }

        // اختيار موضوع عشوائي
        if (subTopics.length > 0) {
          const randomTopic = subTopics[Math.floor(Math.random() * subTopics.length)];
          document.getElementById("topic-select").value = randomTopic;

          // تحديث النص الظاهر
          const txtTop = document.getElementById("txt-topic-display");
          if (txtTop) txtTop.textContent = randomTopic;
        } else {
          // احتياط في حال الفشل
          document.getElementById("topic-select").value = "";
        }

        // تحديث نص القسم الرئيسي
        const txtCat = document.getElementById("txt-category-display");
        if (txtCat) txtCat.textContent = "المعصومين (ع)";

        // بدء اللعب
        const startBtn = document.getElementById("ai-generate-btn");
        if (startBtn) startBtn.click();
      }
      break;

    case 4: // المهدوية
      if (document.getElementById("category-select")) {
        // ✅ المفتاح الدقيق كما هو في ملف data.js
        const catKey = "الثقافة المهدوية";
        document.getElementById("category-select").value = catKey;

        let subTopics = [];
        if (typeof topicsData !== "undefined" && topicsData[catKey]) {
          subTopics = topicsData[catKey];
        }

        if (subTopics.length > 0) {
          const randomTopic = subTopics[Math.floor(Math.random() * subTopics.length)];
          document.getElementById("topic-select").value = randomTopic;

          const txtTop = document.getElementById("txt-topic-display");
          if (txtTop) txtTop.textContent = randomTopic;
        } else {
          document.getElementById("topic-select").value = "";
        }

        const txtCat = document.getElementById("txt-category-display");
        if (txtCat) txtCat.textContent = "الثقافة المهدوية";

        const startBtn = document.getElementById("ai-generate-btn");
        if (startBtn) startBtn.click();
      }
      break;

    case 2: // المساعدات -> عشوائي شامل
      if (document.getElementById("category-select")) {
        document.getElementById("category-select").value = "random";
        document.getElementById("topic-select").value = "";

        const txtCat = document.getElementById("txt-category-display");
        if (txtCat) txtCat.textContent = "عشوائي شامل";

        const txtTop = document.getElementById("txt-topic-display");
        if (txtTop) txtTop.textContent = "-- اختر الموضوع --";

        const startBtn = document.getElementById("ai-generate-btn");
        if (startBtn) startBtn.click();
      }
      break;

    case 3: // الماراثون
      const marathonBtn = document.getElementById("btn-marathon-start");
      if (marathonBtn && !marathonBtn.disabled) {
        marathonBtn.click();
      } else {
        toast("ماراثون النور غير متاح حالياً", "info");
      }
      break;

    case 5: // المتجر
      openBag();
      setTimeout(() => {
        const shopTab = document.getElementById("tab-shop");
        if (shopTab) switchBagTab("shop");
      }, 100);
      break;

    default:
      toast("انتقل للقسم المخصص لإنجاز المهمة");
  }
}

export function renderQuestList() {
  const listContainer = document.getElementById("quest-list-container");
  if (!listContainer) return;

  listContainer.innerHTML = "";
  // تنسيق الحاوية لتكون عمودية
  listContainer.className = "flex flex-col gap-1 py-1";

  if (!userProfile.dailyQuests || !userProfile.dailyQuests.tasks) return;
  const template = document.getElementById("quest-item-template");
  let allCompleted = true;

  userProfile.dailyQuests.tasks.forEach((task) => {
    const isCompleted = task.current >= task.target;
    if (!isCompleted) allCompleted = false;

    const clone = template.content.cloneNode(true);
    const rootItem = clone.querySelector(".quest-item");
    const descEl = clone.querySelector(".quest-desc");
    const progressTextEl = clone.querySelector(".quest-progress-text");
    const progressBar = clone.querySelector(".quest-progress-bar");
    const actionContainer = clone.querySelector(".quest-action");
    const iconEl = clone.querySelector(".quest-icon");

    // تعبئة النصوص
    descEl.textContent = task.desc;
    progressTextEl.textContent = `${task.current}/${task.target}`;

    // حساب النسبة المئوية
    const percent = Math.min(100, (task.current / task.target) * 100);

    // --- تحديد لون السائل ---
    let colorClass = "liquid-red"; // افتراضي (أحمر)
    if (percent >= 100) colorClass = "liquid-green"; // مكتمل (أخضر)
    else if (percent >= 60) colorClass = "liquid-cyan"; // متقدم (أزرق)
    else if (percent >= 30) colorClass = "liquid-gold"; // متوسط (ذهبي)

    // تطبيق الكلاسات (هام جداً: نمسح القديم ونضع الجديد)
    progressBar.className = `quest-progress-bar liquid-fill ${colorClass}`;

    // تحديد الأيقونات
    if (task.id === 1) iconEl.textContent = "mosque";
    else if (task.id === 2) iconEl.textContent = "lightbulb";
    else if (task.id === 3) iconEl.textContent = "local_fire_department";
    else if (task.id === 4) iconEl.textContent = "history_edu";
    else if (task.id === 5) iconEl.textContent = "shopping_bag";

    // حالات التفاعل
    if (task.claimed) {
      // تم الاستلام
      actionContainer.innerHTML = `<div class="flex flex-col items-center leading-none"><span class="material-symbols-rounded text-green-500 text-lg mb-0.5 shadow-green-500/50 drop-shadow-lg">check_circle</span><span class="text-[8px] text-green-400 font-bold">منجز</span></div>`;
      progressBar.style.width = "100%";
      rootItem.classList.add("opacity-60", "grayscale-[0.5]");
    } else if (isCompleted) {
      // جاهز للاستلام
      actionContainer.innerHTML = `
                <button class="w-8 h-8 rounded-full bg-amber-400 hover:bg-amber-300 text-black shadow-[0_0_10px_rgba(251,191,36,0.6)] flex items-center justify-center animate-bounce"
                    onclick="event.stopPropagation(); claimSingleReward(${task.id})">
                    <span class="material-symbols-rounded text-lg">redeem</span>
                </button>`;
      // تأخير بسيط للأنيميشن
      setTimeout(() => {
        progressBar.style.width = "100%";
      }, 50);
    } else {
      // قيد التقدم
      rootItem.onclick = (e) => {
        if (e.target.tagName !== "BUTTON") executeQuestAction(task.id);
      };

      actionContainer.innerHTML = `
    <span class="material-symbols-rounded text-lg bg-gradient-to-t from-cyan-400 to-blue-500 bg-clip-text text-transparent animate-pulse group-hover:-translate-x-1 transition-all duration-300">
        chevron_left
    </span>`;

      // تطبيق العرض (Width) بعد قليل لتعمل حركة الانسياب
      setTimeout(() => {
        progressBar.style.width = `${percent}%`;
      }, 100);
    }

    listContainer.appendChild(clone);
  });

  // إظهار زر الجائزة الكبرى إن وجد
  const grandPrizeArea = document.getElementById("grand-prize-area");
  if (grandPrizeArea) {
    if (allCompleted && !userProfile.dailyQuests.grandPrizeClaimed) grandPrizeArea.classList.remove("hidden");
    else grandPrizeArea.classList.add("hidden");
  }
}

// --- تفعيل الأزرار (Event Listeners) ---
const openBtn = document.getElementById("btn-open-quests");
const closeBtn = document.getElementById("close-quest-btn");
const grandBtn = document.getElementById("claim-grand-prize-btn");

if (openBtn) openBtn.addEventListener("click", openQuestModal);
if (closeBtn) closeBtn.addEventListener("click", closeQuestModal);

if (grandBtn) grandBtn.addEventListener("click", claimGrandPrize);

// ==========================================
// 🎁 نظام المهام اليومية: دوال الاستلام (Logic)
// ==========================================

export async function claimSingleReward(taskId) {
  // 1. العثور على المهمة
  const task = userProfile.dailyQuests.tasks.find((t) => t.id === taskId);
  if (!task) return;

  // 2. التحقق من الأهلية
  if (task.current < task.target) {
    toast("المهمة لم تكتمل بعد!", "error");
    return;
  }
  if (task.claimed) {
    toast("تم استلام هذه الجائزة مسبقاً", "info");
    return;
  }

  // 3. التنفيذ (مكافأة 100 نقطة)
  const REWARD_AMOUNT = 60;

  // أ. تحديث محلي
  task.claimed = true;
  const prevBalance = Number(userProfile.balance ?? userProfile.highScore ?? 0);
  userProfile.balance = prevBalance + REWARD_AMOUNT;
  userProfile.highScore = userProfile.balance; // legacy sync

  // وضع الضيف: حفظ محلي فقط
  if (isGuestMode() || !effectiveUserId) {
    scheduleGuestSave(true);
    playSound("monetization_on");
    toast(`🎉 تم استلام ${REWARD_AMOUNT} نقطة!`);
    renderQuestList();
    updateProfileUI();
    return;
  }
  // ب. حفظ في السيرفر
  try {
    await updateDoc(doc(db, "users", effectiveUserId), {
      "dailyQuests.tasks": userProfile.dailyQuests.tasks,
      balance: userProfile.balance,
      highScore: userProfile.balance,
    });

    // ج. مؤثرات النجاح
    playSound("monetization_on"); // صوت النقود إذا وجد أو win
    toast(`🎉 تم استلام ${REWARD_AMOUNT} نقطة!`);

    // د. تحديث الواجهة
    renderQuestList();
    updateProfileUI(); // لتحديث عداد النقاط العلوي
  } catch (e) {
    console.error("Reward Claim Error", e);
    toast("خطأ في الاتصال، حاول مجدداً", "error");
    task.claimed = false; // تراجع في حال الخطأ
    userProfile.balance = prevBalance;
    userProfile.highScore = prevBalance;
  }
}

export async function claimGrandPrize() {
  // 1. التحقق من اكتمال جميع المهام
  const allDone = userProfile.dailyQuests.tasks.every((t) => t.current >= t.target);
  if (!allDone) {
    toast("يجب إكمال جميع المهام أولاً!", "error");
    return;
  }
  if (userProfile.dailyQuests.grandPrizeClaimed) {
    toast("لقد استلمت الجائزة الكبرى لهذا اليوم!", "info");
    return;
  }

  // 2. جائزة اكمال المهام اليومية
  const BONUS_CORRECT = 0; // لا نضيف إجابات صحيحة (لتجنب تضخيم المتصدرين)
  const BONUS_COINS = 200; // مكافأة اقتصادية (عملات)
  const BONUS_LIVES = 1; // جوائز إضافية (قلب)
  const BONUS_HINT = 1; // جوائز إضافية (تلميح)

  // 3. تجهيز الإحصائيات الأسبوعية والشهرية (لضمان ظهور الزيادة في المتصدرين)
  const wKey = getCurrentWeekKey();
  let wStats = userProfile.weeklyStats || { key: wKey, correct: 0 };
  if (wStats.key !== wKey) wStats = { key: wKey, correct: 0 };
  wStats.correct += BONUS_CORRECT;

  const mKey = getCurrentMonthKey();
  let mStats = userProfile.monthlyStats || { key: mKey, correct: 0 };
  if (mStats.key !== mKey) mStats = { key: mKey, correct: 0 };
  mStats.correct += BONUS_CORRECT;

  // 4. التحديث المحلي
  userProfile.dailyQuests.grandPrizeClaimed = true;

  // تحديث عدادات الإجابات الصحيحة محلياً
  userProfile.stats.totalCorrect = (userProfile.stats.totalCorrect || 0) + BONUS_CORRECT;
  userProfile.weeklyStats = wStats;
  userProfile.monthlyStats = mStats;

  // تحديث المخزون
  userProfile.inventory.lives += BONUS_LIVES;
  userProfile.inventory.helpers.hint += BONUS_HINT;

  // وضع الضيف: إضافة العملات محلياً وحفظ داخل المتصفح فقط
  if (isGuestMode() || !effectiveUserId) {
    const prevBalance = Number(userProfile.balance ?? userProfile.highScore ?? 0);
    userProfile.balance = prevBalance + BONUS_COINS;
    userProfile.highScore = userProfile.balance;
    scheduleGuestSave(true);

    launchConfetti();
    playSound("applause");

    const rewardDetails = `تم إضافة: ${BONUS_COINS} نقطة، ${BONUS_LIVES} قلب، و ${BONUS_HINT} تلميح لرصيدك!`;
    toast(`${rewardDetails}`, "success");
    addLocalNotification("مكافئة اكمال المهام اليومية✨ ", rewardDetails, "military_tech");

    renderQuestList();
    updateProfileUI();
    return;
  }

  // 5. الحفظ في السيرفر
  try {
    await updateDoc(doc(db, "users", effectiveUserId), {
      "dailyQuests.grandPrizeClaimed": true,

      // إضافة 100 للعدد الكلي للإجابات الصحيحة
      "stats.totalCorrect": increment(BONUS_CORRECT),

      // ✅ مكافأة العملات
      balance: increment(BONUS_COINS),
      highScore: increment(BONUS_COINS),

      // تحديث إحصائيات الأسبوع والشهر (للمتصدرين)
      weeklyStats: wStats,
      monthlyStats: mStats,

      // تحديث المخزون
      "inventory.lives": userProfile.inventory.lives,
      "inventory.helpers.hint": userProfile.inventory.helpers.hint,
    });

    // 6. الاحتفال
    launchConfetti(); // قصاصات ورقية
    playSound("applause"); // تصفيق

    // 6. الاحتفال ورسالة التفاصيل الكاملة
    launchConfetti(); // قصاصات ورقية
    playSound("applause"); // تصفيق

    // نص الرسالة المفصل
    const rewardDetails = `تم إضافة: ${BONUS_COINS} نقطة، ${BONUS_LIVES} قلب، و ${BONUS_HINT} تلميح لرصيدك!`;

    // عرض رسالة منبثقة بالتفاصيل
    toast(` ${rewardDetails}`, "success");

    // حفظ إشعار محلي بالتفاصيل
    addLocalNotification("مكافئة اكمال المهام اليومية✨ ", rewardDetails, "military_tech");

    renderQuestList();
    updateProfileUI();
  } catch (e) {
    console.error("Grand Prize Error", e);
    toast("خطأ في استلام الجائزة", "error");
    // تراجع في حال الخطأ
    userProfile.dailyQuests.grandPrizeClaimed = false;
    userProfile.stats.totalCorrect -= BONUS_CORRECT;
    // تراجع عن العملات في حال الخطأ
    userProfile.balance = Math.max(0, Number(userProfile.balance ?? userProfile.highScore ?? 0) - BONUS_COINS);
    userProfile.highScore = userProfile.balance;
  }
}

// --- دالة مركزية لتحديث تقدم المهام ---
export function updateQuestProgress(questId, amount = 1) {
  // 1. التحقق من وجود بيانات المهام
  if (!userProfile.dailyQuests || !userProfile.dailyQuests.tasks) return;

  // 2. البحث عن المهمة المطلوبة
  const taskIndex = userProfile.dailyQuests.tasks.findIndex((t) => t.id === questId);
  if (taskIndex === -1) return;

  const task = userProfile.dailyQuests.tasks[taskIndex];

  // 3. إذا كانت المهمة مكتملة مسبقاً، لا تفعل شيئاً
  if (task.current >= task.target) return;

  const prevCurrent = task.current;

  // 4. زيادة العداد
  task.current += amount;

  // منع العداد من تجاوز الهدف
  if (task.current > task.target) task.current = task.target;

  if (prevCurrent < task.target && task.current === task.target) {
    if (typeof addLocalNotification === "function") addLocalNotification("اكتمال مهمة يومية فردية", `اكتملت المهمة: ${task.desc}`, "task_alt");
  }

  // 5. حفظ التحديث في السيرفر
  if (effectiveUserId) {
    updateDoc(doc(db, "users", effectiveUserId), {
      dailyQuests: userProfile.dailyQuests,
    }).catch((err) => console.log("Quest Update Error", err));
  }

  // 6. تحديث الواجهة (الشارة الحمراء على الزر)
  updateProfileUI();
}

// --- تهيئة نظام المهام اليومية ---
export function initDailyQuests() {
  const today = new Date().toLocaleDateString("en-CA"); // تاريخ اليوم بصيغة ثابتة YYYY-MM-DD

  // 1. إذا لم يكن لدى المستخدم سجل مهام أصلاً، أو إذا كان التاريخ مختلفاً (يوم جديد)
  if (!userProfile.dailyQuests || userProfile.dailyQuests.date !== today) {
    userProfile.dailyQuests = {
      date: today,
      grandPrizeClaimed: false, // هل استلم الجائزة الكبرى؟
      tasks: [
        // المعرف 1: حل 50 سؤال في المعصومين
        { id: 1, current: 0, target: 50, claimed: false, desc: "حل 50 سؤال في قسم المعصومين" },
        // المعرف 2: استعمال 5 مساعدات
        { id: 2, current: 0, target: 5, claimed: false, desc: "استخدم 5 وسائل مساعدة" },
        // المعرف 3: حل 10 أسئلة ماراثون (النور)
        { id: 3, current: 0, target: 10, claimed: false, desc: "أكمل 10 أسئلة في تحدي النور" },
        // المعرف 4: حل 20 سؤال مهدوي
        { id: 4, current: 0, target: 20, claimed: false, desc: "حل 20 سؤال عن الثقافة المهدوية" },
        // المعرف 5: شراء عنصر من المتجر
        { id: 5, current: 0, target: 1, claimed: false, desc: "اشترِ أي عنصر من المتجر" },
      ],
    };
    // حفظ التهيئة الجديدة في السيرفر فوراً
    if (effectiveUserId) {
      updateDoc(doc(db, "users", effectiveUserId), { dailyQuests: userProfile.dailyQuests }).catch((err) =>
        console.log("Quest Init Error", err)
      );
    }
  }
}

// ==============================
// ✅ Expose for inline handlers + compatibility
// ==============================
try {
  window.openQuestModal = openQuestModal;
  window.closeQuestModal = closeQuestModal;
  window.renderQuestList = renderQuestList;
  window.claimSingleReward = claimSingleReward;
  window.claimGrandPrize = claimGrandPrize;
  window.updateQuestProgress = updateQuestProgress;
  window.initDailyQuests = initDailyQuests;
} catch (_) {}