// ==========================================
// NEXORA - SERVICE WORKER
// Tujuan: aplikasi bisa dipasang & tetap terbuka (tampilan) saat sinyal hilang.
//
// ATURAN KEAMANAN DATA:
//   - Permintaan ke Supabase (data, login, token) TIDAK pernah di-cache dan tidak disentuh.
//   - File aplikasi (HTML/CSS/JS) memakai "network-first": saat online selalu ambil versi
//     terbaru dari server, cache hanya dipakai saat offline. Jadi setelah deploy
//     tidak ada risiko tersangkut di kode lama.
//
// Mengubah daftar file di SHELL? Naikkan VERSION agar cache lama dibersihkan.
// ==========================================
const VERSION = 'nexora-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL = [
  './',
  'index.html',
  'login.html',
  'register.html',
  'forgot.html',
  'reset.html',
  'manifest.json',
  'css/style.css',
  'js/supabase.js',
  'js/auth-ui.js',
  'js/config.js',
  'js/app.js',
  'js/features.js',
  'js/pwa.js',
  'img/nexora-logo.png',
  'img/favicon.ico',
  'img/favicon-32.png',
  'img/favicon-16.png',
  'img/apple-touch-icon.png',
  'img/nexora-icon-192.png',
  'img/nexora-icon-512.png',
  'img/nexora-maskable-512.png'
];

// Library pihak ketiga yang boleh disimpan untuk tampilan offline
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Satu file gagal (mis. belum di-upload) tidak boleh menggagalkan seluruh instalasi
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await cache.match('index.html');
      if (fallback) return fallback;
    }
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Selain itu (Supabase, dll.): tidak ditangani -> langsung ke jaringan, tidak pernah di-cache.
});
