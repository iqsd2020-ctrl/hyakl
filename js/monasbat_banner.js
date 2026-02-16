/* js/monasbat_banner.js
   عرض تاريخ هجري + مناسبة اليوم من Data/monasbat.json
   - بدون أي تصميم داخل الجافاسكربت (فقط تحديث DOM)
*/

const MONASBAT_URL = "./Data/monasbat.json";
const MAX_LOOKAHEAD_DAYS = 370;

const ARABIC_INDIC_DIGITS = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];
const HIJRI_MONTHS_CANON = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الثاني",
  "جمادى الأول",
  "جمادى الآخر",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
];

function toArabicIndic(input) {
  const s = String(input);
  return s.replace(/\d/g, d => ARABIC_INDIC_DIGITS[Number(d)]);
}

function normalizeDigits(str) {
  if (!str) return "";
  return String(str)
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function normalizeArabic(str) {
  return String(str || "")
    .trim()
    // إزالة التشكيل
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    // إزالة التطويل
    .replace(/\u0640/g, "")
    // توحيد بعض الحروف
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTH_MAP = (() => {
  const m = new Map();

  // خرائط مباشرة للأسماء القياسية
  for (const name of HIJRI_MONTHS_CANON) {
    m.set(normalizeArabic(name), name);
  }

  // مرادفات شائعة بين المصادر/المتصفحات
  m.set(normalizeArabic("ربيع الآخر"), "ربيع الثاني");
  m.set(normalizeArabic("ربيع الثاني"), "ربيع الثاني");

  m.set(normalizeArabic("جمادى الأولى"), "جمادى الأول");
  m.set(normalizeArabic("جمادى الاولى"), "جمادى الأول");
  m.set(normalizeArabic("جمادى الاول"), "جمادى الأول");
  m.set(normalizeArabic("جمادى الأول"), "جمادى الأول");

  m.set(normalizeArabic("جمادى الآخرة"), "جمادى الآخر");
  m.set(normalizeArabic("جمادى الاخرة"), "جمادى الآخر");
  m.set(normalizeArabic("جمادى الثانية"), "جمادى الآخر");
  m.set(normalizeArabic("جمادى الثانيه"), "جمادى الآخر");
  m.set(normalizeArabic("جمادى الآخر"), "جمادى الآخر");

  m.set(normalizeArabic("ذي القعدة"), "ذو القعدة");
  m.set(normalizeArabic("ذو القعدة"), "ذو القعدة");

  m.set(normalizeArabic("ذي الحجة"), "ذو الحجة");
  m.set(normalizeArabic("ذو الحجة"), "ذو الحجة");

  return m;
})();

function canonicalizeMonth(monthStr) {
  const raw = String(monthStr || "").trim();
  // إذا جاء الشهر رقمًا (1-12)
  const num = parseInt(normalizeDigits(raw), 10);
  if (!Number.isNaN(num) && num >= 1 && num <= 12) {
    return HIJRI_MONTHS_CANON[num - 1];
  }
  const key = normalizeArabic(raw);
  return MONTH_MAP.get(key) || raw;
}

function createHijriFormatter() {
  const candidates = [
    // خيار calendar في options (حديث)
    { locale: "ar-IQ", options: { calendar: "islamic-umalqura", day: "numeric", month: "long", year: "numeric" } },
    { locale: "ar-SA", options: { calendar: "islamic-umalqura", day: "numeric", month: "long", year: "numeric" } },
    { locale: "ar",    options: { calendar: "islamic-umalqura", day: "numeric", month: "long", year: "numeric" } },

    { locale: "ar-IQ", options: { calendar: "islamic", day: "numeric", month: "long", year: "numeric" } },
    { locale: "ar-SA", options: { calendar: "islamic", day: "numeric", month: "long", year: "numeric" } },
    { locale: "ar",    options: { calendar: "islamic", day: "numeric", month: "long", year: "numeric" } },

    // خيار locale extension (احتياطي)
    { locale: "ar-IQ-u-ca-islamic-umalqura", options: { day: "numeric", month: "long", year: "numeric" } },
    { locale: "ar-SA-u-ca-islamic-umalqura", options: { day: "numeric", month: "long", year: "numeric" } },
    { locale: "ar-u-ca-islamic-umalqura",    options: { day: "numeric", month: "long", year: "numeric" } },

    { locale: "ar-IQ-u-ca-islamic", options: { day: "numeric", month: "long", year: "numeric" } },
    { locale: "ar-SA-u-ca-islamic", options: { day: "numeric", month: "long", year: "numeric" } },
    { locale: "ar-u-ca-islamic",    options: { day: "numeric", month: "long", year: "numeric" } },
  ];

  for (const c of candidates) {
    try {
      const fmt = new Intl.DateTimeFormat(c.locale, c.options);
      const cal = (fmt.resolvedOptions().calendar || "").toLowerCase();
      // تأكد أنه فعلاً إسلامي وليس ميلادي
      if (cal.includes("islamic")) {
        // تجربة سريعة للتأكد من عدم رمي خطأ
        fmt.format(new Date());
        return fmt;
      }
    } catch (_) {}
  }

  // آخر حل: قد يعرض ميلادي في بعض الأجهزة القديمة، لكن لا نكسر التطبيق
  return new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric" });
}

const HIJRI_FMT = createHijriFormatter();

function getHijriParts(dateObj) {
  const parts = HIJRI_FMT.formatToParts(dateObj);
  const dayPart = parts.find(p => p.type === "day")?.value || "";
  const monthPart = parts.find(p => p.type === "month")?.value || "";
  const yearPart = parts.find(p => p.type === "year")?.value || "";

  const dayNum = parseInt(normalizeDigits(dayPart), 10);
  const yearNum = parseInt(normalizeDigits(yearPart), 10);

  const monthCanon = canonicalizeMonth(monthPart);

  return {
    dayNum: Number.isNaN(dayNum) ? null : dayNum,
    yearNum: Number.isNaN(yearNum) ? null : yearNum,
    monthName: monthCanon,
    dayDisp: Number.isNaN(dayNum) ? String(dayPart).trim() : toArabicIndic(dayNum),
    yearDisp: Number.isNaN(yearNum) ? String(yearPart).trim() : toArabicIndic(yearNum),
  };
}

function parseTitle1(title1) {
  const s = String(title1 || "").trim();
  const m = s.match(/^([0-9٠-٩۰-۹]+)\s*(.+)$/);
  if (!m) return null;
  const dayNum = parseInt(normalizeDigits(m[1]), 10);
  if (Number.isNaN(dayNum)) return null;
  const month = canonicalizeMonth(m[2]);
  return { dayNum, month };
}

function buildEventsIndex(monasbatData) {
  const index = new Map(); // key: "day-month" => array of items
  for (const tab of (monasbatData || [])) {
    for (const item of (tab.items || [])) {
      const parsed = parseTitle1(item.title1);
      if (!parsed) continue;
      const key = `${parsed.dayNum}-${parsed.month}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(item);
    }
  }
  return index;
}

function firstMeaningfulLine(text) {
  const lines = String(text || "").split("\n").map(l => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  // إزالة بادئات زخرفية شائعة مثل 🔸
  return lines[0].replace(/^[•\-\u2022🔸]+/g, "").trim();
}

function composeTodayText(_hijri, items) {
  const desc = (items || []).map(it => String(it.title2 || "").trim()).filter(Boolean).join("\n\n");
  const fallback = (items && items[0] && items[0].title2)
    ? String(items[0].title2).trim()
    : (items && items[0] && items[0].title1)
      ? `مناسبة اليوم: ${String(items[0].title1).trim()}`
      : "مناسبة اليوم: غير متاحة";

  return desc || fallback;
}

function composeUpcomingText(hijriUpcoming, item) {
  const dayMonth = `${toArabicIndic(hijriUpcoming.dayNum)} ${hijriUpcoming.monthName}`;
  const shortTitle = firstMeaningfulLine(item?.title2) || String(item?.title1 || "").trim() || "مناسبة";
  return `المناسبة القادمة: ${shortTitle} في ${dayMonth}`;
}

async function loadMonasbatJson() {
  const res = await fetch(MONASBAT_URL, { cache: "default" });
  if (!res.ok) throw new Error("Failed to load monasbat.json");
  return await res.json();
}

async function renderMonasbatBanner() {
  const bannerEl = document.getElementById("monasbat-banner");
  const dateEl = document.getElementById("monasbat-hijri-date");
  const textEl = document.getElementById("monasbat-text");
  if (!dateEl || !textEl) return;

  const labelEl = bannerEl
    ? Array.from(bannerEl.querySelectorAll("div")).find(el => (el.textContent || "").trim() === "المناسبات")
    : null;

  const iconSpan = bannerEl ? bannerEl.querySelector("span.material-symbols-rounded") : null;
  const iconBoxEl = iconSpan ? iconSpan.closest("div") : null;

  function setFolded(folded) {
    if (folded) {
      textEl.style.display = "none";
      if (labelEl) labelEl.style.display = "none";
      if (iconBoxEl) iconBoxEl.style.display = "none";
      if (bannerEl) bannerEl.style.cursor = "pointer";
    } else {
      textEl.style.display = "";
      if (labelEl) labelEl.style.display = "";
      if (iconBoxEl) iconBoxEl.style.display = "";
      if (bannerEl) bannerEl.style.cursor = "";
    }
  }

  const today = new Date();
  const hijriToday = getHijriParts(today);

  // عرض التاريخ الهجري دائمًا
  if (hijriToday.dayNum && hijriToday.yearNum && hijriToday.monthName) {
    dateEl.textContent = `${hijriToday.dayDisp}/${hijriToday.monthName}/${hijriToday.yearDisp}`;
  } else {
    // احتياط: لو تعذر استخراج أجزاء الهجري بشكل صحيح
    dateEl.textContent = HIJRI_FMT.format(today);
  }

  try {
    const monasbatData = await loadMonasbatJson();
    const index = buildEventsIndex(monasbatData);

    // مناسبة اليوم
    if (hijriToday.dayNum && hijriToday.monthName) {
      const todayKey = `${hijriToday.dayNum}-${hijriToday.monthName}`;
      const todayItems = index.get(todayKey);
      if (todayItems && todayItems.length) {
        setFolded(false);
        textEl.textContent = composeTodayText(hijriToday, todayItems);
        return;
      }
    }

    // إن لم توجد مناسبة اليوم: ابحث عن الأقرب القادمة
    let found = null;
    for (let i = 1; i <= MAX_LOOKAHEAD_DAYS; i++) {
      const d = new Date(today.getTime());
      d.setDate(d.getDate() + i);

      const hijri = getHijriParts(d);
      if (!hijri.dayNum || !hijri.monthName) continue;

      const key = `${hijri.dayNum}-${hijri.monthName}`;
      const items = index.get(key);
      if (items && items.length) {
        found = { hijri, item: items[0] };
        break;
      }
    }

    if (found) {
      textEl.textContent = composeUpcomingText(found.hijri, found.item);
    } else {
      textEl.textContent = "المناسبة القادمة: غير متاحة";
    }

    let isFolded = true;
    setFolded(true);

    if (bannerEl) {
      bannerEl.addEventListener("click", () => {
        isFolded = !isFolded;
        setFolded(isFolded);
      });
    }
  } catch (_) {
    // في حال فشل تحميل الملف لأي سبب
    setFolded(false);
    textEl.textContent = "المناسبة القادمة: غير متاحة";
  }
}

document.addEventListener("DOMContentLoaded", renderMonasbatBanner);