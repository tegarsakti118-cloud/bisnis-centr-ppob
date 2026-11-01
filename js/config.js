// ==========================================
// NEXORA v2.1 - HELPER UMUM
// (Versi cloud: data TIDAK lagi disimpan di localStorage.
//  getAppData / saveAppData lama dihapus karena bentrok dengan app.js)
// ==========================================

function formatRupiah(number) {
  const n = Number(number) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(n);
}

// Cegah XSS: semua teks dari user / database yang masuk ke innerHTML wajib lewat sini
function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ID unik (anti tabrakan walau dibuat di milidetik yang sama)
function genId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}${rand}`;
}

// Kunci tanggal lokal "YYYY-MM-DD" (bukan UTC, supaya "hari ini" benar di WIB)
function localDateKey(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localMonthKey(dateInput) {
  return localDateKey(dateInput).slice(0, 7);
}
