// Кэширует только "оболочку" приложения (HTML/CSS/JS/манифест).
// Данные словаря и записи живут в IndexedDB (см. db.js) — это отдельный механизм.

const CACHE_NAME = 'wordbook-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // API-запросы никогда не кэшируем сервис-воркером — там своя логика fallback (см. app.js)
  if (request.url.includes('/api/')) return;

  // Сеть в приоритете: пока онлайн, всегда отдаём свежий файл с сервера и
  // заодно обновляем им кэш — старая версия из кэша идёт в ход только как
  // запасной вариант для офлайна (или если сеть реально недоступна).
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
  );
});
