// js/frames.js

export const framesData = [
    { id: 'default', name: 'بدون إطار', price: 0, cssClass: '' },
    
    // --- المجموعة الكلاسيكية (تم الاحتفاظ بها) ---
    { id: 'gold', name: 'الإطار الذهبي', price: 1300, cssClass: 'frame-gold' },
    { id: 'fire', name: 'الإطار المشتعل', price: 2600, cssClass: 'frame-fire' },
    { id: 'floral', name: 'إطار الربيع', price: 800, cssClass: 'frame-floral' },
    { id: 'diamond', name: 'الإطار الماسي', price: 4200, cssClass: 'frame-diamond' },
    { id: 'neon', name: 'إطار النيون', price: 2100, cssClass: 'frame-neon' },
    { id: 'sun', name: 'شمس الولاية', price: 3400, cssClass: 'frame-sun' },
    { id: 'eagle', name: 'جناح النسر', price: 3000, cssClass: 'frame-eagle' },
    { id: 'star', name: 'نجمة الصباح', price: 1700, cssClass: 'frame-star' },
    { id: 'tech', name: 'السايبر الرقمي', price: 2600, cssClass: 'frame-tech' },
    { id: 'energy', name: 'طاقة البرق', price: 2800, cssClass: 'frame-energy' },
    { id: 'ruby', name: 'ياقوت أحمر', price: 1900, cssClass: 'frame-ruby' },
    { id: 'nature', name: 'غصن الزيتون', price: 1200, cssClass: 'frame-nature' },
    { id: 'hex', name: 'درع سداسي', price: 1500, cssClass: 'frame-hex' },
    { id: 'ghost', name: 'الطيف الأبيض', price: 4500, cssClass: 'frame-ghost' },

    // --- الإطارات التي تم إصلاحها (Fixes) ---
    { id: 'galaxy', name: 'مجرة الفلك', price: 5100, cssClass: 'frame-galaxy-fixed' }, // تم الإصلاح
    { id: 'dark_matter', name: 'المادة المظلمة', price: 6000, cssClass: 'frame-dark-matter-fixed' }, // تم الإصلاح
    { id: 'rgb', name: 'ألوان الطيف', price: 6500, cssClass: 'frame-rgb-fixed' }, // تم الإصلاح

    // --- مجموعة الروحانيات والنور (جديد) ---
    { id: 'nur_ala_nur', name: 'نور على نور', price: 5500, cssClass: 'frame-nur' },
    { id: 'angelic_wing', name: 'الجناح الملائكي', price: 4800, cssClass: 'frame-angelic' },
    { id: 'crescent_moon', name: 'هلال العيد', price: 3200, cssClass: 'frame-crescent' },
    { id: 'kufic_gold', name: 'زخرفة كوفية', price: 4200, cssClass: 'frame-kufic' },
    { id: 'heaven_gate', name: 'أبواب الجنان', price: 8000, cssClass: 'frame-heaven' },

    // --- مجموعة العناصر الطبيعية الخارقة (جديد) ---
    { id: 'blizzard', name: 'عاصفة الجليد', price: 3800, cssClass: 'frame-blizzard' },
    { id: 'thunder_storm', name: 'الصاعقة', price: 4500, cssClass: 'frame-thunder' },
    { id: 'ocean_depth', name: 'عمق المحيط', price: 3600, cssClass: 'frame-ocean' },
    { id: 'sand_storm', name: 'عاصفة الصحراء', price: 2500, cssClass: 'frame-sand' },
    { id: 'emerald_flow', name: 'الزمرد السائل', price: 5200, cssClass: 'frame-emerald' },

    // --- مجموعة السايبر والمستقبل (جديد) ---
    { id: 'glitch_art', name: 'الخلل الرقمي', price: 4000, cssClass: 'frame-glitch' },
    { id: 'scanner', name: 'الماسح الضوئي', price: 2800, cssClass: 'frame-scanner' },
    { id: 'hud_circle', name: 'النظام الذكي', price: 3700, cssClass: 'frame-hud' },
    { id: 'cyber_pulse', name: 'نبض السايبر', price: 2700, cssClass: 'frame-cyber-pulse' },
    { id: 'matrix', name: 'المصفوفة', price: 3000, cssClass: 'frame-matrix' },

    // --- مجموعة الجواهر والأحجار الكريمة (جديد) ---
    { id: 'amethyst', name: 'الجمشت البنفسجي', price: 3900, cssClass: 'frame-amethyst' },
    { id: 'sapphire_ring', name: 'خاتم الياقوت', price: 4200, cssClass: 'frame-sapphire' },
    { id: 'pearl_shell', name: 'اللؤلؤة المكنونة', price: 4700, cssClass: 'frame-pearl' },
    
    // --- مجموعة الأساطير والخيال (جديد) ---
    { id: 'phoenix', name: 'ريشة العنقاء', price: 7700, cssClass: 'frame-phoenix' },
    { id: 'dragon_breath', name: 'أنفاس التنين', price: 7200, cssClass: 'frame-dragon-breath' },
    { id: 'mystic_aura', name: 'الهالة الصوفية', price: 5300, cssClass: 'frame-mystic' },
    { id: 'time_portal', name: 'بوابة الزمن', price: 6400, cssClass: 'frame-time' },
    { id: 'infinity', name: 'إطار اللانهاية', price: 8500, cssClass: 'frame-infinity' }
];

// فهرس سريع للوصول إلى الإطارات بالـ id (لتقليل تكلفة .find المتكررة)
const _framesById = new Map(framesData.map(f => [f.id, f]));

/**
 * إرجاع كائن الإطار حسب id، مع fallback إلى default
 */
export function getFrameById(frameId = 'default') {
  return _framesById.get(frameId) || _framesById.get('default') || framesData[0];
}

/**
 * اسم الإطار حسب id
 */
export function getFrameName(frameId = 'default') {
  return getFrameById(frameId).name;
}

/**
 * CSS class للإطار حسب id
 */
export function getFrameCssClass(frameId = 'default') {
  return getFrameById(frameId).cssClass || '';
}