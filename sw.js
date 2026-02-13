const CONFIG = {
  version: "7.0.17",
  staticAssets: [
    "./",
    "./index.html",
    "./js/data.js",
    "./js/main.js",
    "./js/main/part-00-core.js",
    "./js/main/part-01-profile-and-setup.js",
    "./js/main/part-02-quiz-engine.js",
    "./js/main/part-03-ui-nav-leaderboard.js",
    "./js/main/part-04-reset-admin.js",
    "./js/main/part-05-shop-bag.js",
    "./js/main/part-06-settings-misc.js",
    "./js/main/part-07-truefalse.js",
    "./js/main/part-99-init.js",
    "./js/daily_quests.js",
    "./js/giftday.js",
    "./js/auth.js", 
    "./js/challenge.js",
    "./manifest.json",
    "./style.css",
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
    "./fonts/MaterialSymbolsRounded.woff2",
    "./Icon.png",
  ],
};
const CACHE_PREFIX = "ahlulbayt-quiz";
const PRECACHE = `${CACHE_PREFIX}-precache-${CONFIG.version}`;
const RUNTIME = `${CACHE_PREFIX}-runtime-${CONFIG.version}`;
const FONT_CACHE = `${CACHE_PREFIX}-fonts-${CONFIG.version}`;
const OFFLINE_FALLBACK_URL = new URL("./index.html", self.registration.scope).href;
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
    const cacheable = response.ok || response.type === "opaque";
    if (!cacheable) return;
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  } catch (_) {
  }
}
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    const precacheUrls = (CONFIG.staticAssets || []).filter((u) => !isHttpUrl(u));
    for (const url of precacheUrls) {
      try {
        const abs = new URL(url, self.registration.scope).href;
        const req = new Request(abs, { cache: "reload" });
        const res = await fetch(req);
        if (res && res.ok) await cache.put(req, res.clone());
      } catch (_) {
      }
    }
    try { await self.skipWaiting(); } catch (_) {}
  })());
});
self.addEventListener("message", (event) => {
  const data = event && event.data;
  if (data && data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((key) => {
        const isOurCache = key.startsWith(`${CACHE_PREFIX}-`);
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
  if (req.method !== "GET") return;
  const url = new URL(req.url);
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
      event.waitUntil(fetchPromise);
      return cached || (await fetchPromise) || Response.error();
    })());
    return;
  }
  if (isFirebaseOrGoogleApi(url)) return;
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then(async (fresh) => {
          if (fresh && fresh.ok && url.origin === self.location.origin) {
            await putIfCacheable(RUNTIME, req, fresh);
          }
          return fresh;
        })
        .catch(() => null);
      event.waitUntil(fetchPromise);
      if (cached) return cached;
      const fresh = await fetchPromise;
      if (fresh) return fresh;
      const fallback = await caches.match(OFFLINE_FALLBACK_URL, { ignoreSearch: true });
      return fallback || Response.error();
    })());
    return;
  }
  if (url.origin === self.location.origin && url.pathname.includes('/Data/Noor/') && url.pathname.endsWith('.json')) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then(async (fresh) => {
          if (fresh && fresh.ok) await putIfCacheable(RUNTIME, req, fresh);
          return fresh;
        })
        .catch(() => null);
      event.waitUntil(fetchPromise);
      if (cached) return cached;
      const fresh = await fetchPromise;
      return fresh || Response.error();
    })());
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then(async (fresh) => {
          if (fresh && fresh.ok) await putIfCacheable(RUNTIME, req, fresh);
          return fresh;
        })
        .catch(() => null);
      event.waitUntil(fetchPromise);
      if (cached) return cached;
      const fresh = await fetchPromise;
      return fresh || Response.error();
    })());
    return;
  }
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (_) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});