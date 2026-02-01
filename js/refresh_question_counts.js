// js/refresh_question_counts.js
// زر تحديث عدد الأسئلة يدوياً من الإعدادات (بدون تغيير منطق التحديث اليومي)

export function initManualQuestionCountsRefresh({ getEl, fetchSystemCounts, toast, playSound } = {}) {
    const tryBind = () => {
        const btn = (typeof getEl === 'function')
            ? getEl('refresh-question-counts-btn')
            : document.getElementById('refresh-question-counts-btn');

        if (!btn) return false;

        // منع تكرار الربط إذا تم استدعاء الدالة أكثر من مرة
        if (btn.dataset.bound === '1') return true;
        btn.dataset.bound = '1';

        const originalHTML = btn.innerHTML;
        let busy = false;

        btn.addEventListener('click', async () => {
            if (busy) return;
            busy = true;

            try {
                if (typeof playSound === 'function') playSound('click');

                btn.disabled = true;
                btn.innerHTML =
                    '<span class="material-symbols-rounded animate-spin text-base text-cyan-300">refresh</span>' +
                    ' جارٍ التحديث...';

                // Force: إعادة الحساب فوراً حتى لو كان نفس اليوم
                if (typeof fetchSystemCounts === 'function') {
                    await fetchSystemCounts(true);
                }

                if (typeof toast === 'function') toast('تم تحديث عدد الأسئلة');
            } catch (e) {
                console.error('manual question counts refresh failed:', e);
                if (typeof toast === 'function') toast('تعذر تحديث عدد الأسئلة', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
                busy = false;
            }
        });

        return true;
    };

    // غالباً DOM جاهز لأن main.js في آخر الصفحة، لكن نضمن الربط في كل الحالات
    if (!tryBind()) {
        document.addEventListener('DOMContentLoaded', tryBind, { once: true });
    }
}