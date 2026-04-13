const CACHE_NAME = "duee-web-v14";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/app.css",
  "/app.js",
  "/manifest.webmanifest",
  "/logo.png",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
];
const CACHEABLE_PATHS = new Set(STATIC_ASSETS);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }

  if (!CACHEABLE_PATHS.has(url.pathname)) {
    return;
  }

  event.respondWith(handleStaticAssetRequest(event.request, url.pathname));
});

async function handleNavigationRequest(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put("/index.html", response.clone());
    return response;
  } catch {
    const cachedPage = await caches.match("/index.html");
    if (cachedPage) {
      return cachedPage;
    }
    throw new Error("Network unavailable and no cached page is available.");
  }
}

async function handleStaticAssetRequest(request, pathname) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(pathname);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(pathname, response.clone());
      }
      return response;
    });

  if (cached) {
    networkFetch.catch(() => {});
    return cached;
  }

  return networkFetch;
}
