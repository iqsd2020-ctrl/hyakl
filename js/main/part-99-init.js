// Part 99: Final initialization (auth listener registered last for safety)

onAuthStateChanged(auth, async (user) => {
    if (user) {

        // ✅ منع أي "فلاش" + إظهار رسالة واضحة أثناء تجهيز الحساب
        try {
            if (window.__googleRedirectFailSafeTimer) {
                clearTimeout(window.__googleRedirectFailSafeTimer);
                window.__googleRedirectFailSafeTimer = null;
            }
        } catch (_) {}
        try {
            show('auth-loading');
            const p = document.querySelector('#auth-loading p');
            if (p) p.textContent = 'تم تسجيل الدخول بنجاح… جارٍ تجهيز حسابك الآن';
            hide('login-area');
            hide('bottom-nav');
        } catch (_) {}

        // تم تسجيل الدخول (Google/Email): أوقف وضع الضيف (إن وُجد) ثم حمّل ملف المستخدم.
        isGuest = false;
        setGuestSessionActive(false);
        currentUser = user;
        effectiveUserId = user.uid;

        try {
            await ensureUserProfileExists(user);

            // إذا كان هناك مزامنة معلّقة من وضع الضيف (Popup/Redirect) نفّذها الآن قبل التحميل.
            await syncGuestIfPending(user);

            await loadProfile(effectiveUserId);
            setupPresenceSystem();
            window.toArabicDigits = window.toArabicDigits || function (value) {
                const s = (value === null || value === undefined) ? '' : String(value);
                if (!/\d/.test(s)) return s;
                return s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
            };
            try { initChallengeSystem(); } catch(e) { console.error('Challenge init failed', e); }
            hide('auth-loading');
            hide('login-area');
            navToHome();
        } catch (e) {
            console.error('Error ensuring user profile', e);
            hide('auth-loading');
            show('login-area');
            show('login-view');
        }
    } else {
        // ✅ إن كان هناك Redirect Google قيد التنفيذ: لا تُظهر شاشة الدخول، ابقِ على التحميل برسالة واضحة
        let redirectPending = false;
        try { redirectPending = sessionStorage.getItem('__google_redirect_pending') === '1'; } catch (_) {}
        if (!redirectPending) {
            try { redirectPending = localStorage.getItem('__google_redirect_pending') === '1'; } catch (_) {}
        }

        if (redirectPending) {
            try {
                show('auth-loading');
                const p = document.querySelector('#auth-loading p');
                if (p) p.textContent = 'جارٍ إكمال تسجيل الدخول عبر Google… لا تغلق التطبيق';
                hide('login-area');
                hide('bottom-nav');
            } catch (_) {}

            // Fail-safe: إذا لم يكتمل الدخول خلال فترة معقولة، أعد إظهار شاشة الدخول
            try {
                if (window.__googleRedirectFailSafeTimer) clearTimeout(window.__googleRedirectFailSafeTimer);
                window.__googleRedirectFailSafeTimer = setTimeout(() => {
                    try {
                        hide('auth-loading');
                        show('login-area');
                        show('login-view');
                        hide('bottom-nav');
                    } catch (_) {}
                }, 8000);
            } catch (_) {}

            return;
        }

        // لا يوجد مستخدم مسجّل: ادخل مباشرة بوضع الضيف (لا نعرض شاشة تسجيل الدخول)
        hide('auth-loading');
        try { enterGuestMode({ silent: true }); } catch (_) {
            // fallback آمن في حال تعذر تهيئة وضع الضيف لأي سبب
            try { hide('login-area'); } catch (_) {}
            try { show('bottom-nav'); } catch (_) {}
            try { navToHome(); } catch (_) {}
        }
        return;
    }
    // ✅ تحويل الأرقام الظاهرة إلى أرقام عربية (٠١٢٣٤٥٦٧٨٩) أينما ظهرت في واجهة التطبيق
window.toArabicDigits = window.toArabicDigits || function (value) {
    const s = (value === null || value === undefined) ? '' : String(value);
    if (!/\d/.test(s)) return s;
    return s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
};

window.applyArabicDigits = window.applyArabicDigits || function (root) {
    try {
        root = root || document.body;
        if (!root) return;

        const shouldSkip = (el) => {
            if (!el || el.nodeType !== 1) return false;
            return !!el.closest('script,style,noscript,template,textarea,input,select,[contenteditable="true"]');
        };

        const convertTextNode = (node) => {
            const v = node.nodeValue;
            if (!v || !/\d/.test(v)) return;
            const nv = window.toArabicDigits(v);
            if (nv !== v) node.nodeValue = nv;
        };

        if (root.nodeType === 3) {
            convertTextNode(root);
            return;
        }

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue || !/\d/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
                const p = node.parentElement;
                if (!p) return NodeFilter.FILTER_REJECT;
                if (shouldSkip(p)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        let n;
        while ((n = walker.nextNode())) {
            convertTextNode(n);
        }
    } catch (_) {}
};

window.enableArabicDigits = window.enableArabicDigits || function () {
    try {
        if (window.__arabicDigitsEnabled) return;
        window.__arabicDigitsEnabled = true;

        // تطبيق فوري
        try { window.applyArabicDigits(document.body); } catch (_) {}

        // مراقبة أي تحديثات لاحقة في الواجهة
        const mo = new MutationObserver((mutations) => {
            try {
                for (const m of mutations) {
                    if (m.type === 'characterData') {
                        const node = m.target;
                        if (node && node.nodeType === 3) {
                            const p = node.parentElement;
                            if (p && !p.closest('script,style,noscript,template,textarea,input,select,[contenteditable="true"]')) {
                                const v = node.nodeValue;
                                if (v && /\d/.test(v)) {
                                    const nv = window.toArabicDigits(v);
                                    if (nv !== v) node.nodeValue = nv;
                                }
                            }
                        }
                        continue;
                    }

                    if (m.type === 'childList') {
                        m.addedNodes && m.addedNodes.forEach((node) => {
                            if (!node) return;

                            if (node.nodeType === 3) {
                                const p = node.parentElement;
                                if (p && !p.closest('script,style,noscript,template,textarea,input,select,[contenteditable="true"]')) {
                                    const v = node.nodeValue;
                                    if (v && /\d/.test(v)) {
                                        const nv = window.toArabicDigits(v);
                                        if (nv !== v) node.nodeValue = nv;
                                    }
                                }
                            } else if (node.nodeType === 1) {
                                if (!node.closest('script,style,noscript,template,textarea,input,select,[contenteditable="true"]')) {
                                    window.applyArabicDigits(node);
                                }
                            }
                        });
                    }
                }
            } catch (_) {}
        });

        try { mo.observe(document.body, { subtree: true, childList: true, characterData: true }); } catch (_) {}
        window.__arabicDigitsObserver = mo;
    } catch (_) {}
};

try {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { try { window.enableArabicDigits(); } catch (_) {} });
    } else {
        window.enableArabicDigits();
    }
} catch (_) {}
});

