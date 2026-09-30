// TAMASYA V137 canonical service worker. Fresh multi-property baseline.
const APP_SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `tamasya-cache-${encodeURIComponent(APP_SCOPE.pathname)}-`;
const CACHE_NAME = `${CACHE_PREFIX}20261001-enterprise-rc1-audit1`;
const matchAppCache = (request) => caches.open(CACHE_NAME).then((cache) => cache.match(request));
const STATIC_CACHE_DESTINATIONS = new Set(["script", "style", "image", "font", "manifest", "worker"]);

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./icon.svg",
  "./manifest.json",
  "./pos.html",
  "./growth-suite.html",
  "./enterprise-suite.html",
  "./multi-property-foundation.html",
  "./property-setup.html",
  "./assets/notification-settings-addon.js?v=20260814-perf-config1",
  "./assets/api-operation-guard.js?v=20260914-r4-3-operation-retry",
  "./assets/canonical-business-policy.js?v=20260812-final12-video1",
  "./assets/finance-category-usage-picker.js?v=20260817-r7-setup-finance-mapping-ux-fix20",
  "./assets/app-core.js?v=20261001-enterprise-rc1-audit1",
  "./assets/sw-register.js?v=20261001-enterprise-rc1-audit1",
  "./assets/navigation-registry.js?v=20260821-audit15-enterprise-discovery-root",
  "./assets/chunks/vendor-react.js?v=20261001-enterprise-rc1-audit1",
  "./assets/chunks/app-shared.js?v=20261001-enterprise-rc1-audit1",
  "./assets/chunks/app-shell.js?v=20261001-enterprise-rc1-audit1",
  "./assets/chunks/feature-shared.js?v=20261001-enterprise-rc1-audit1",
  "./assets/chunks/dashboard.js?v=20261001-enterprise-rc1-audit1",
  "./assets/chunks/rooms.js?v=20261001-enterprise-rc1-audit1",
  // PERF(offline-ops-1): chunk modul jarang-dipakai tidak lagi diprecache saat
  // install (menghemat ~410 KB pada first load). Semua chunk tetap di-cache saat
  // pertama kali dibuka lewat runtime cache di bawah sehingga offline tetap bekerja.
  "./assets/property-branding.js?v=20260810-v137",
  "./assets/property-setup.css?v=20260818-r7-booking-draft-room-scope-fix27",
  "./assets/property-setup.js?v=20260818-r7-booking-draft-room-scope-fix27",
  "./assets/property-setup-guard.js?v=20260810-v137",
  "./assets/app-core.css?v=20260829-fix37-scrollbar-clip",
  "./assets/pos-minibar.css?v=20260806-48",
  "./assets/pos-minibar.js?v=20260820-fix28r6-audit3-posback",
  "./assets/pos-report-archive-addon.js?v=20260821-audit16-prelock-observer-scope",
  "./assets/website-gps-addon.js?v=20260821-audit16-prelock-observer-scope",
  "./assets/growth-pms-link-addon.js?v=20260910-production-audit-r4-growth-link",
  "./assets/master-data-workspace.js?v=20260821-audit16-prelock-observer-scope",
  "./assets/ui-core.js?v=20260821-audit15-enterprise-discovery-root",
  "./assets/system-health-addon.js?v=20261001-enterprise-rc1-audit1",
  "./assets/flexible-maintenance-addon.js?v=20261001-enterprise-rc1-audit1",
  "./assets/canonical-report-center.js?v=20261001-enterprise-rc1-audit1",
  "./assets/date-display-id.js?v=20260829-fix39-refsafe",
  "./assets/ui-core.css?v=20260829-fix43-dialog-layering",
  "./assets/guest-center.js?v=20260821-audit15-enterprise-discovery-root",
  "./assets/guest-center.css?v=20260815-r7-reservation-root-sync-r3-workflow-root-r4-room-blocker-owner-r5&fix=20260816-ops-guest3",
  "./assets/employee-self-service.js?v=20260821-audit15-enterprise-discovery-root",
  "./assets/employee-self-service.css?v=20260826-fix34-drawerscroll",
  "./assets/website-cms-guard.js?v=20260810-v137",
  "./assets/website-cms-guard.css?v=20260810-v137",
  "./assets/growth-suite.css?v=20260807-growth109",
  "./assets/growth-suite.js?v=20260910-production-audit-r4-growth-suite",
  "./assets/enterprise-suite.js?v=20260910-production-audit-r4-enterprise-suite",
  "./assets/multi-property-foundation.css?v=20260807-enterprise112",
  "./assets/multi-property-foundation.js?v=20260812-final12-video1"
];

function responseCanBeCached(response) {
  if (!response || !response.ok || response.type !== "basic") return false;
  const cacheControl = (response.headers.get("cache-control") || "").toLowerCase();
  return !cacheControl.includes("no-store") && !cacheControl.includes("private");
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});


self.addEventListener("message", (event) => {
  const type = event && event.data ? event.data.type : "";
  if (type === "TAMASYA_SW_STATUS" && event.ports && event.ports[0]) {
    event.ports[0].postMessage({
      type: "TAMASYA_SW_STATUS",
      cacheName: CACHE_NAME,
      precacheCount: ASSETS_TO_CACHE.length,
      scope: self.registration ? self.registration.scope : null
    });
  } else if (type === "TAMASYA_SW_SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Hanya GET same-origin tanpa byte-range yang boleh dipertimbangkan untuk cache.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.headers.has("range")
  ) return;

  // API PHP, route /api, stream, dan asset development tidak pernah dicache.
  if (
    url.pathname.includes("/api/") ||
    url.pathname.endsWith("/api.php") ||
    url.pathname.includes("/sse") ||
    url.pathname.includes("@vite") ||
    url.pathname.includes("@id") ||
    url.pathname.includes("node_modules")
  ) {
    return;
  }

  // Include-only tools and authenticated PHP pages must never become the offline shell.
  const relativePath = url.pathname.startsWith(APP_SCOPE.pathname)
    ? url.pathname.slice(APP_SCOPE.pathname.length) : null;
  if (relativePath === null || /\.php(?:\/|$)/i.test(relativePath) ||
      /^(?:uploads|webpublic)(?:\/|$)/i.test(relativePath)) return;

  const isNavigation =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");

  if (isNavigation && url.pathname.endsWith("/pos.html")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (responseCanBeCached(response)) {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("./pos.html", clone)));
        }
        return response;
      }).catch(async () => (await matchAppCache("./pos.html")) || Response.error())
    );
    return;
  }

  if (isNavigation && url.pathname.endsWith("/growth-suite.html")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (responseCanBeCached(response)) {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("./growth-suite.html", clone)));
        }
        return response;
      }).catch(async () => (await matchAppCache("./growth-suite.html")) || Response.error())
    );
    return;
  }

  if (isNavigation && url.pathname.endsWith("/enterprise-suite.html")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (responseCanBeCached(response)) { const clone=response.clone(); event.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.put("./enterprise-suite.html",clone))); }
        return response;
      }).catch(async () => (await matchAppCache("./enterprise-suite.html")) || Response.error())
    );
    return;
  }

  if (isNavigation && url.pathname.endsWith("/multi-property-foundation.html")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (responseCanBeCached(response)) {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("./multi-property-foundation.html", clone)));
        }
        return response;
      }).catch(async () => (await matchAppCache("./multi-property-foundation.html")) || Response.error())
    );
    return;
  }

  if (isNavigation && url.pathname.endsWith("/property-setup.html")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (responseCanBeCached(response)) {
          const clone = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("./property-setup.html", clone)));
        }
        return response;
      }).catch(async () => (await matchAppCache("./property-setup.html")) || Response.error())
    );
    return;
  }

  if (isNavigation && relativePath !== '' && relativePath !== 'index.html' && /\.[^/]+$/.test(relativePath)) return;

  if (isNavigation) {
    // Network-first: saat online selalu ambil build terbaru. Saat offline,
    // gunakan shell terakhir yang berhasil disimpan.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (responseCanBeCached(response)) {
            const clone = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", clone))
            );
          }
          return response;
        })
        .catch(async () => {
          return (
            (await matchAppCache("./index.html")) ||
            (await matchAppCache("./")) ||
            Response.error()
          );
        })
    );
    return;
  }

  // Hanya aset build yang aman dan teridentifikasi yang menggunakan runtime cache.
  if (!STATIC_CACHE_DESTINATIONS.has(request.destination)) return;
  if (!relativePath.startsWith('assets/') && !['icon.svg','manifest.json'].includes(relativePath)) return;

  // Static assets: stale-while-revalidate untuk kecepatan dan dukungan offline.
  event.respondWith(
    matchAppCache(request).then((cachedResponse) => {
      const networkPromise = fetch(request)
        .then((networkResponse) => {
          if (responseCanBeCached(networkResponse)) {
            const clone = networkResponse.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
            );
          }
          return networkResponse;
        })
        .catch(() => cachedResponse || Response.error());

      return cachedResponse || networkPromise;
    })
  );
});
