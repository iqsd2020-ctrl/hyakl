const CONFIG = {
  // Change this when you deploy a new build (forces new cache names)
  version: "4.0.10",

  // Local assets only (no external URLs here)
  staticAssets: [
    "./",                 // root (usually serves index.html)
    "./index.html",        // explicit fallback
    "./js/data.js",
    "./js/main.js?v=4.0.5",
    "./js/main/part-00-core.js?v=4.0.5",
    "./js/main/part-01-profile-and-setup.js?v=4.0.5",
    "./js/main/part-02-quiz-engine.js?v=4.0.5",
    "./js/main/part-03-ui-nav-leaderboard.js?v=4.0.5",
    "./js/main/part-04-reset-admin.js?v=4.0.5",
    "./js/main/part-05-shop-bag.js?v=4.0.5",
    "./js/main/part-06-settings-misc.js?v=4.0.5",
    "./js/main/part-99-init.js?v=4.0.5",
    "./js/daily_quests.js?v=4.0.5",
    "./js/giftday.js?v=4.0.5",
    "./js/auth.js?v=4.0.5",
    
    "./manifest.json",
    "./style.css?v=4.7",
    "./tailwind-lib.js",
    "./fonts.css",
    "./fonts/Amiri/Amiri-Regular.ttf",
    "./fonts/Amiri/Amiri-Italic.ttf",
    "./fonts/Amiri/Amiri-Bold.ttf",
    "./fonts/Amiri/Amiri-BoldItalic.ttf",
    "./fonts/ReemKufi/static/ReemKufi-Regular.ttf",
    "./fonts/ReemKufi/static/ReemKufi-Medium.ttf",
    "./fonts/ReemKufi/static/ReemKufi-SemiBold.ttf",
    "./fonts/ReemKufi/static/ReemKufi-Bold.ttf",
    /* فعّل هذا فقط إذا أضفت ملف الأيقونات محليًا
    "./fonts/MaterialSymbolsRounded.woff2",
    */
    "./Icon.png",
   
  ],
};

const CACHE_PREFIX = "ahlulbayt-quiz";
const PRECACHE = `${CACHE_PREFIX}-precache-${CONFIG.version}`;
const RUNTIME = `${CACHE_PREFIX}-runtime-${CONFIG.version}`;
const FONT_CACHE = `${CACHE_PREFIX}-fonts-v1`;

const OFFLINE_FALLBACK_URL = new URL("./", self.registration.scope).href;

function isHttpUrl(u) {
  return /^https?:\/\//i.test(u);
}

function isGoogleFonts(url) {
  return (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  );
}

function isFirebaseOrGoogleApi(url) {
  // Avoid caching API calls (Firestore/Auth/RTDB/FCM etc.)
  return (
    url.hostname.includes("firebase") ||
    url.hostname.endsWith("firebaseapp.com") ||
    url.hostname.endsWith("firebaseio.com") ||
    url.hostname.includes("googleapis.com")
  );
}

async function putIfCacheable(cacheName, request, response) {
  try {
    if (!response) return;
    // Cache OK responses; allow opaque for cross-origin fonts if needed
    const cacheable = response.ok || response.type === "opaque";
    if (!cacheable) return;

    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch (_) {
    // no-op
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);

    // Defensive filter: ensure we never precache external URLs
    const precacheUrls = (CONFIG.staticAssets || []).filter((u) => !isHttpUrl(u));

    // Cache one-by-one so a single missing file doesn't break the whole install
    for (const url of precacheUrls) {
      try {
        const req = new Request(url, { cache: "reload" });
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
      } catch (_) {
        // skip failed asset
      }
    }

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Delete old caches from previous versions
    const keys = await caches.keys();
    await Promise.all(
      keys.map((key) => {
        const isOurCache =
          key.startsWith(`${CACHE_PREFIX}-precache-`) ||
          key.startsWith(`${CACHE_PREFIX}-runtime-`);
        const isCurrent = key === PRECACHE || key === RUNTIME || key === FONT_CACHE;
        if (isOurCache && !isCurrent) return caches.delete(key);
        return null;
      })
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Google Fonts: stale-while-revalidate
  if (isGoogleFonts(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const cached = await cache.match(req);

      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      return cached || (await fetchPromise) || Response.error();
    })());
    return;
  }

  // Don’t cache API traffic (Firestore/Auth/etc.)
  if (isFirebaseOrGoogleApi(url)) return;

  // Navigations: network-first with offline fallback
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok && url.origin === self.location.origin) {
          await putIfCacheable(RUNTIME, req, fresh);
        }
        return fresh;
      } catch (_) {
        const cached = await caches.match(req);
        if (cached) return cached;

        const fallback = await caches.match(OFFLINE_FALLBACK_URL, { ignoreSearch: true });
        if (fallback) return fallback;

        const indexUrl = new URL("./index.html", self.registration.scope).href;
        const indexFallback = await caches.match(indexUrl, { ignoreSearch: true });
        return indexFallback || Response.error();
      }
    })());
    return;
  }

  // ✅ Data JSON (Noor): network-first to allow daily updates of question counts/content
  if (url.origin === self.location.origin && url.pathname.includes('/Data/Noor/') && url.pathname.endsWith('.json')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) await putIfCacheable(RUNTIME, req, fresh);
        return fresh;
      } catch (_) {
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  // Same-origin assets: cache-first, then fetch and store in runtime
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) await putIfCacheable(RUNTIME, req, fresh);
        return fresh;
      } catch (_) {
        return Response.error();
      }
    })());
    return;
  }

  // Other cross-origin: network-first with cache fallback
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (_) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});


