const CACHE_NAME = 'mercearia-cache-v1';
const ASSETS = [
    './index.html',
    './home.html',
    './index.css',
    '/app.js',
    '/auth.js',
    '/img/favicon.png',
    '/img/icon-192.png',
    '/img/icon-512.png'
];

const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([...ASSETS, ...EXTERNAL_ASSETS]);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        return caches.delete(name);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Ignorar requisições ao Supabase (API dinâmica)
    if (url.hostname.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                return response;
            }
            return fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            });
        })
    );
});
