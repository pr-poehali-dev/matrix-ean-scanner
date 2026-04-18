const CACHE = 'scanpro-v1';

const PRECACHE = [
  '/',
  '/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Не кэшируем запросы к бэкенду и внешним сервисам
  if (
    url.hostname === 'functions.poehali.dev' ||
    url.hostname === 'mc.yandex.ru' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    e.request.method !== 'GET'
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => {
          // Офлайн: отдаём главную страницу для навигации
          if (e.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
    })
  );
});
