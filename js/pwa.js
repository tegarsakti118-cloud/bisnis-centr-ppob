// ==========================================
// NEXORA - PWA (pasang aplikasi, banner offline)
// Dimuat di semua halaman. Tidak mengubah logika aplikasi / autentikasi / database.
// ==========================================
(function () {
  'use strict';

  // 1) Daftarkan service worker (hanya di http/https, bukan file://)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('[Nexora] Service worker gagal didaftarkan:', err);
      });
    });
  }

  // 2) Banner offline / kembali online
  const bar = document.createElement('div');
  bar.id = 'offline-bar';
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  let hideTimer = null;

  function showBar(text, isOnline) {
    if (!bar.isConnected) document.body.appendChild(bar);
    clearTimeout(hideTimer);
    bar.textContent = text;
    bar.className = isOnline ? 'online show' : 'show';
    if (isOnline) hideTimer = setTimeout(() => { bar.className = ''; }, 2500);
  }

  window.addEventListener('offline', () => {
    showBar('Offline: data belum bisa disimpan atau dimuat.', false);
  });

  window.addEventListener('online', async () => {
    showBar('Kembali online. Menyegarkan data...', true);
    // Di halaman utama: tarik ulang data cloud supaya angka tidak basi
    try {
      if (typeof fetchCloudData === 'function' && typeof refreshAllViews === 'function' &&
          typeof currentUserId !== 'undefined' && currentUserId) {
        await fetchCloudData();
        refreshAllViews();
      }
    } catch (err) {
      console.warn('[Nexora] Gagal menyegarkan data setelah online:', err);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (!navigator.onLine) {
      showBar('Offline: data belum bisa disimpan atau dimuat.', false);
    }
  });

  // 3) Tombol "Pasang Aplikasi" (Android/Chrome). Di iPhone: Bagikan > Tambah ke Layar Utama.
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('btn-install-app');
    if (btn) btn.hidden = false;
  });

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-install-app');
    if (!btn) return;
    if (deferredPrompt) btn.hidden = false;

    btn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (err) { /* abaikan */ }
      deferredPrompt = null;
      btn.hidden = true;
    });
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const btn = document.getElementById('btn-install-app');
    if (btn) btn.hidden = true;
  });
})();
