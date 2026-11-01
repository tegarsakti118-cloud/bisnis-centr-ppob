// ==========================================
// NEXORA v2.1 - KONFIGURASI SUPABASE TERPUSAT
// Harus dimuat SETELAH CDN @supabase/supabase-js dan SEBELUM app.js
// Satu-satunya tempat yang membuat client Supabase.
// ==========================================
// Jaga-jaga: link reset password yang mendarat di halaman lain (karena Site URL / Redirect URL
// di Supabase belum cocok) dialihkan ke reset.html dengan token tetap terbawa.
if (/type=recovery/.test(window.location.hash) && !/reset\.html$/.test(window.location.pathname)) {
  window.location.replace(new URL('reset.html', window.location.href).href + window.location.hash);
}

(function () {
  const SUPABASE_URL = 'https://qdnegvyomibqjuspjidk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_fOUkYi-g2j6POK-g4Oaqqw__uu5592_';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[Nexora] Library Supabase belum termuat. Periksa koneksi internet / urutan <script>.');
    return;
  }

  if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true // dibutuhkan agar login Google (OAuth) terbaca
      }
    });
  }
})();

// Logout global (dipanggil dari tombol di sidebar)
async function handleLogout() {
  try {
    await window.supabaseClient.auth.signOut();
  } catch (err) {
    console.error('Gagal logout:', err);
  }
  window.location.replace('login.html');
}
