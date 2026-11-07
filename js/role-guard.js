// ==========================================
// NEXORA - Pembaca role dari server
// Role, status akun, dan status cabang SELALU dibaca dari database lewat
// fungsi nx_whoami (berdasarkan auth.uid()), bukan dari localStorage.
// Ini hanya pengarah tampilan; penegakan akses sebenarnya ada di RLS/fungsi database.
// ==========================================
(function () {
  const ROLE_LABEL = { super_admin: 'Super Admin', admin_cabang: 'Admin Cabang', employee: 'Karyawan' };
  const BLOCK_MSG = {
    no_session: 'Sesi login tidak ditemukan. Silakan masuk kembali.',
    no_role: 'Akun Anda belum terdaftar di sistem Nexora. Hubungi pemilik bisnis Anda.',
    inactive: 'Akun Anda dinonaktifkan. Hubungi pemilik bisnis Anda.',
    business_inactive: 'Bisnis Anda sedang dinonaktifkan. Hubungi pengelola Nexora.',
    no_branch: 'Akun Anda belum ditugaskan ke cabang. Hubungi pemilik bisnis Anda.',
    branch_inactive: 'Cabang Anda sedang dinonaktifkan. Hubungi pemilik bisnis Anda.'
  };

  async function whoami(client) {
    const { data, error } = await client.rpc('nx_whoami');
    if (error) throw error;
    return data;
  }

  // Halaman -> izin fitur yang dibutuhkan (salah satu cukup). Penegakan sebenarnya di server.
  const PAGE_FEATURE = {
    overview: ['dashboard'], tariksetor: ['tarik_tunai', 'setor_tunai'], transfer: ['pindah_saldo'],
    ppob: ['ppob'], debts: ['hutang'], transactions: ['riwayat'], finance: ['laporan']
  };
  function pageAllowed(me, page) {
    const f = PAGE_FEATURE[page];
    if (!f || !me || !me.perms) return true;
    return f.some(function (k) { return me.perms[k] !== false; });
  }
  function firstAllowed(me) {
    const order = ['overview', 'tariksetor', 'transfer', 'ppob', 'voucher', 'debts', 'transactions', 'finance'];
    for (let i = 0; i < order.length; i++) if (pageAllowed(me, order[i])) return order[i];
    return 'overview';
  }
  function applyMenu(me) {
    Object.keys(PAGE_FEATURE).forEach(function (p) {
      if (!pageAllowed(me, p)) document.querySelectorAll('[data-page="' + p + '"]').forEach(function (el) { el.style.display = 'none'; });
    });
  }

  window.NexoraAuth = {
    pageAllowed: pageAllowed, firstAllowed: firstAllowed, applyMenu: applyMenu,
    whoami: whoami,
    roleLabel: function (role) { return ROLE_LABEL[role] || 'Pengguna'; },
    blockMessage: function (reason) { return BLOCK_MSG[reason] || 'Akun Anda tidak dapat masuk saat ini.'; },
    homeFor: function (me) { return me && me.role === 'super_admin' ? 'admin.html' : 'index.html'; }
  };
})();
