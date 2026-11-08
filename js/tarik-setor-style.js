// ==========================================
// NEXORA - Tampilan form Tarik Setor (layout baru)
// Hanya mengubah TAMPILAN untuk layanan: Setor Tunai, Transfer Bank Lain,
// Transfer Sesama, Setor Pinjaman, Virtual Account, dan semua Topup.
// Tarik Tunai TIDAK diubah. Tidak ada field atau logika perhitungan yang berubah;
// ID elemen tetap sama, hanya urutan dan susunan kolom yang diatur lewat CSS.
// ==========================================
(function () {
  'use strict';

  const CSS = `
    #tarik-setor-form.tsk-mode {
      display: grid !important;
      grid-template-columns: 1fr 1fr;
      gap: 14px !important;
    }
    #tarik-setor-form.tsk-mode > .form-group { grid-column: 1 / -1; }
    #tarik-setor-form.tsk-mode > .form-group:has(#ts-admin-bank),
    #tarik-setor-form.tsk-mode > .form-group:has(#ts-admin-agen) { grid-column: auto; }
    #tarik-setor-form.tsk-mode .form-group label { font-size: 12px; font-weight: 700; letter-spacing: .2px; }
    #tarik-setor-form.tsk-mode .form-group:has(#ts-account) label { color: #60a5fa; }
    #tarik-setor-form.tsk-mode .form-group:has(#ts-service) label { color: #a78bfa; }
    #tarik-setor-form.tsk-mode .form-group:has(#ts-admin-bank) label { color: #38bdf8; }
    #tarik-setor-form.tsk-mode .form-group:has(#ts-admin-agen) label { color: #34d399; }
    #tarik-setor-form.tsk-mode .form-group:has(#ts-pay-method) label { color: #818cf8; }
    #tarik-setor-form.tsk-mode .form-group:has(#ts-customer) label,
    #tarik-setor-form.tsk-mode .form-group:has(#ts-notes) label { color: #94a3b8; }
    #tarik-setor-form.tsk-mode > button[type="submit"] { grid-column: 1 / -1; }
  `;

  const SETOR_LAYANAN = [
    'Setor Tunai', 'Transfer Bank Lain', 'Transfer Sesama', 'Setor Pinjaman', 'Virtual Account'
  ];

  function isTarget(service) {
    return SETOR_LAYANAN.indexOf(service) !== -1 || /^Topup /.test(service || '');
  }

  function apply() {
    const form = document.getElementById('tarik-setor-form');
    const sel = document.getElementById('ts-service');
    if (!form || !sel) return;
    form.classList.toggle('tsk-mode', isTarget(sel.value));
  }

  function init() {
    if (!document.getElementById('tsk-style')) {
      const st = document.createElement('style');
      st.id = 'tsk-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    apply();
    // ganti layanan -> susunan langsung ikut berubah
    document.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'ts-service') apply();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
