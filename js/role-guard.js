// ==========================================
// NEXORA - Pembaca role dari server & Kontak Langganan
// Role, status akun, dan status cabang SELALU dibaca dari database lewat
// fungsi nx_whoami (berdasarkan auth.uid()), bukan dari localStorage.
// Ini hanya pengarah tampilan; penegakan akses sebenarnya ada di RLS/fungsi database.
// ==========================================
(function () {
  'use strict';

  // Nomor WhatsApp Admin/Pengembang (Format: 628xxxxxxxxxx)
  const DEVELOPER_WA = '6285780243664';

  // Daftar paket promo dengan harga coret
  const PRICING_PACKAGES = [
    {
      name: 'Paket Bulanan (1 Bulan)',
      days: 30,
      originalPrice: 'Rp 49.000',
      price: 'Rp 34.999',
      label: '1 Bulan Penuh',
      badge: 'Diskon 30%'
    },
    {
      name: 'Paket Hemat (6 Bulan)',
      days: 180,
      originalPrice: 'Rp 294.000',
      price: 'Rp 179.999',
      label: '6 Bulan Hemat',
      badge: 'Hemat 40%'
    },
    {
      name: 'Paket Tahunan (1 Tahun)',
      days: 365,
      originalPrice: 'Rp 588.000',
      price: 'Rp 299.999',
      label: '1 Tahun (Paling Laris)',
      badge: 'Super Hemat 50%'
    }
  ];

  const ROLE_LABEL = {
    super_admin: 'Super Admin',
    admin_cabang: 'Admin Cabang',
    employee: 'Karyawan'
  };

  const BLOCK_MSG = {
    no_session: 'Sesi login tidak ditemukan. Silakan masuk kembali.',
    no_role: 'Akun Anda belum terdaftar di sistem Nexora. Hubungi pemilik bisnis Anda.',
    inactive: 'Akun Anda dinonaktifkan. Hubungi pemilik bisnis Anda.',
    business_inactive: 'Bisnis Anda sedang dinonaktifkan. Hubungi pengelola Nexora.',
    no_branch: 'Akun Anda belum ditugaskan ke cabang. Hubungi pemilik bisnis Anda.',
    branch_inactive: 'Cabang Anda sedang dinonaktifkan. Hubungi pemilik bisnis Anda.',
    subscription_expired: 'Masa aktif langganan Nexora telah berakhir. Hubungi Admin/WhatsApp pengembang untuk perpanjang layanan.'
  };

  async function whoami(client) {
    const { data, error } = await client.rpc('nx_whoami');
    if (error) throw error;
    return data;
  }

  // Halaman -> izin fitur yang dibutuhkan (salah satu cukup). Penegakan sebenarnya di server.
  const PAGE_FEATURE = {
    overview: ['dashboard'],
    tariksetor: ['tarik_tunai', 'setor_tunai'],
    transfer: ['pindah_saldo'],
    ppob: ['ppob'],
    debts: ['hutang'],
    transactions: ['riwayat'],
    finance: ['laporan']
  };

  function pageAllowed(me, page) {
    const f = PAGE_FEATURE[page];
    if (!f || !me || !me.perms) return true;
    return f.some(function (k) { return me.perms[k] !== false; });
  }

  function firstAllowed(me) {
    const order = ['overview', 'tariksetor', 'transfer', 'ppob', 'voucher', 'debts', 'transactions', 'finance'];
    for (let i = 0; i < order.length; i++) {
      if (pageAllowed(me, order[i])) return order[i];
    }
    return 'overview';
  }

  function applyMenu(me) {
    Object.keys(PAGE_FEATURE).forEach(function (p) {
      if (!pageAllowed(me, p)) {
        document.querySelectorAll('[data-page="' + p + '"]').forEach(function (el) {
          el.style.display = 'none';
        });
      }
    });
  }

  window.NexoraAuth = {
    DEVELOPER_WA: DEVELOPER_WA,
    PRICING_PACKAGES: PRICING_PACKAGES,
    pageAllowed: pageAllowed,
    firstAllowed: firstAllowed,
    applyMenu: applyMenu,
    whoami: whoami,
    roleLabel: function (role) { return ROLE_LABEL[role] || 'Pengguna'; },
    blockMessage: function (reason) { return BLOCK_MSG[reason] || 'Akun Anda tidak dapat masuk saat ini.'; },
    homeFor: function (me) {
      return me && (me.role === 'super_admin' || me.role === 'admin_cabang') ? 'admin.html' : 'index.html';
    }
  };
})();