const CACHE_NAME = 'mercearia-cache-v2';
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

// Instalação do Service Worker
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Força o novo SW a se tornar o SW atual imediatamente
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([...ASSETS, ...EXTERNAL_ASSETS]);
        })
    );
});

// Ativação e limpeza de cache
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(), // Permite que o novo SW tome controle das páginas imediatamente
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((name) => {
                        if (name !== CACHE_NAME) {
                            return caches.delete(name);
                        }
                    })
                );
            })
        ])
    );
});

// Estratégia de Fetch: Network-First (Tenta rede, se falhar vai pro cache)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Ignorar requisições ao Supabase (API dinâmica)
    if (url.hostname.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Atualiza o cache com a resposta nova da rede
                if (networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Se a rede falhar (offline), busca no cache
                return caches.match(event.request);
            })
    );
});
