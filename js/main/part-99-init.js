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

        // لا يوجد مستخدم مسجّل: إذا كانت جلسة الضيف مفعّلة سابقاً، ادخل كضيف.
        let guestActive = false;
        try { guestActive = localStorage.getItem(GUEST_SESSION_KEY) === '1'; } catch (_) {}

        hide('auth-loading');
        if (guestActive) {
            enterGuestMode({ silent: true });
            return;
        }

        show('login-area');
        show('login-view');
        hide('bottom-nav');
    }
});

