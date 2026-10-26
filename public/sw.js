// scripts/build-pwa.mjs thay mã phiên bản và danh sách tệp sau khi Vite build.
const CACHE_NAME = 'mcq-genius-shell-__BUILD_ID__';
const BUILD_ASSETS = __BUILD_ASSETS__;
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', ...BUILD_ASSETS];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('mcq-genius-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Bài thi được chia sẻ cần tải từ máy chủ; không lưu nội dung của người khác vào cache.
  if (request.mode === 'navigate') {
    if (url.pathname.startsWith('/exam/')) return;
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        return (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Chỉ lưu tài nguyên giao diện; ảnh câu hỏi nằm trong IndexedDB và dữ liệu đồng bộ nằm ở Supabase.
  if (!/\.(?:js|mjs|css|png|svg|ico|webp|woff2?)$/i.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
