// Konfigurasi Supabase Terpusat SakaPay v2.1
const SUPABASE_URL = 'https://qdnegvyomibqjuspjidk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fOUkYi-g2j6POK-g4Oaqqw__uu5592_';

// Pastikan hanya mendefinisikan client sekali secara global
if (!window.supabaseClient) {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

let currentUser = null;

async function handleLogout() {
  await window.supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}
