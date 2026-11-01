// ==========================================
// NEXORA v2.1 - APP ENGINE (SUPABASE CLOUD)
// Urutan <script> di index.html:
//   CDN supabase-js -> js/supabase.js -> js/config.js -> js/app.js
// ==========================================

// 1. Client Supabase (dibuat satu kali di supabase.js)
const sb = window.supabaseClient;

// 2. State aplikasi global
let appData = {
  accounts: [],
  transactions: [],
  vouchers: [],
  debts: [],
  expenses: [],
  customers: [],
  debtPayments: [],
  // Fitur baru (diisi oleh js/features.js)
  balanceTransfers: [],
  commissions: [],
  cashCalculations: [],
  cashCalculationItems: []
};

let currentUserId = null;
let currentUserEmail = '';
let revenueChart = null;
let txSearchTerm = '';
let uiBound = false;

const CLOUD_TABLES = ['accounts', 'transactions', 'vouchers', 'debts', 'expenses', 'customers', 'debt_payments'];
// Nama tabel di database -> nama properti di appData
const TABLE_KEY = { debt_payments: 'debtPayments' };

document.addEventListener('DOMContentLoaded', bootApp);

// ==========================================
// BOOT & AUTENTIKASI
// ==========================================

async function bootApp() {
  if (!sb) {
    document.body.classList.remove('auth-pending');
    showNotification('Library Supabase gagal dimuat. Periksa internet lalu muat ulang halaman.', 'error');
    return;
  }

  let session = null;
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    session = data.session;
  } catch (err) {
    // Error jaringan BUKAN alasan untuk redirect (ini yang memicu loop login <-> index)
    console.error('Gagal memeriksa sesi:', err);
    document.body.classList.remove('auth-pending');
    showNotification('Tidak dapat memeriksa sesi login. Periksa koneksi lalu muat ulang.', 'error');
    return;
  }

  if (!session || !session.user) {
    window.location.replace('login.html');
    return;
  }

  currentUserId = session.user.id;
  currentUserEmail = session.user.email || '';

  // Jika sesi berakhir / logout dari tab lain -> kembali ke login
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.replace('login.html');
  });

  // Pasang semua event DULU supaya UI selalu bisa diklik, walau cloud lambat/gagal
  bindUi();
  renderUserWidget();
  document.body.classList.remove('auth-pending');
  closeSidebar();
  switchPage('overview');

  await fetchCloudData();
  refreshAllViews();

  if (appData.accounts.length === 0) {
    showNotification('Belum ada akun/rekening. Tambahkan dulu di menu Balance Mgmt.', 'error');
  }
}

function renderUserWidget() {
  const nameEl = document.querySelector('.user-name');
  const roleEl = document.querySelector('.user-role');
  if (nameEl) nameEl.textContent = currentUserEmail || 'Owner Nexora';
  if (roleEl) roleEl.textContent = 'Cloud - Terhubung';
}

function isAuthError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return err.code === 'PGRST301' || err.status === 401 || /jwt/i.test(msg);
}

// ==========================================
// FETCH & SAVE DATA CLOUD SUPABASE
// ==========================================

// Ambil SEMUA baris tabel. Supabase membatasi 1000 baris per permintaan,
// jadi data dibaca bertahap (per 1000) supaya riwayat panjang tidak terpotong.
async function fetchAllRows(table) {
  const size = 1000;
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await sb.from(table).select('*').order('id', { ascending: true }).range(from, from + size - 1);
    if (error) return { data: null, error };
    all = all.concat(data || []);
    if (!data || data.length < size) break;
    from += size;
  }
  return { data: all, error: null };
}

async function fetchCloudData() {
  const results = await Promise.all(CLOUD_TABLES.map(async (table) => {
    try {
      const { data, error } = await fetchAllRows(table);
      if (error) return { table, error };
      return { table, data: data || [] };
    } catch (err) {
      return { table, error: err };
    }
  }));

  const failed = [];
  let authFailed = false;

  results.forEach((r) => {
    if (r.error) {
      console.error(`Gagal memuat tabel ${r.table}:`, r.error);
      failed.push(r.table);
      if (isAuthError(r.error)) authFailed = true;
    } else {
      appData[TABLE_KEY[r.table] || r.table] = r.data;
    }
  });

  if (authFailed) {
    showNotification('Sesi login berakhir. Silakan masuk kembali.', 'error');
    setTimeout(handleLogout, 1500);
    return false;
  }

  // Tabel fitur baru (Pindah Saldo, Komisi & Fee, Kalkulator Uang) dimuat terpisah
  // supaya kegagalannya tidak mengganggu fitur lama.
  if (typeof fetchFeatureTables === 'function') {
    try { await fetchFeatureTables(); } catch (err) { console.error('Gagal memuat tabel fitur baru:', err); }
  }

  const byDate = (a, b) => new Date(a.date) - new Date(b.date);
  appData.transactions.sort(byDate);
  appData.debts.sort(byDate);
  appData.expenses.sort(byDate);
  appData.debtPayments.sort(byDate);

  if (failed.length) {
    showNotification(`Gagal memuat tabel: ${failed.join(', ')}. Cek nama tabel & kebijakan RLS di Supabase.`, 'error');
    return false;
  }
  return true;
}

function getAppData() {
  return appData;
}

// Mengembalikan true/false. Update/delete yang mengenai 0 baris dianggap GAGAL
// (biasanya karena ID salah atau diblokir RLS, yang tidak menghasilkan error di Supabase).
async function saveCloudData(table, payload, action = 'insert', id = null) {
  try {
    let res;
    if (action === 'insert') {
      res = await sb.from(table).insert([payload]).select();
    } else if (action === 'update') {
      res = await sb.from(table).update(payload).eq('id', id).select();
    } else if (action === 'delete') {
      res = await sb.from(table).delete().eq('id', id).select();
    } else {
      throw new Error('Aksi tidak dikenal: ' + action);
    }

    if (res.error) throw res.error;
    if (action !== 'insert' && (!res.data || res.data.length === 0)) {
      throw new Error('Tidak ada baris yang berubah (ID tidak ditemukan atau diblokir RLS).');
    }
    return true;
  } catch (err) {
    console.error(`Gagal ${action} pada tabel ${table}:`, err);
    showNotification(`Gagal ${action} ke tabel ${table}: ${err.message || err}`, 'error');
    return false;
  }
}

// Jalankan beberapa operasi berurutan. Jika ada yang gagal: berhenti,
// tarik ulang data dari cloud supaya layar selalu sama dengan database.
async function runOps(ops) {
  for (const op of ops) {
    const ok = await saveCloudData(op[0], op[1], op[2], op[3]);
    if (!ok) {
      await fetchCloudData();
      refreshAllViews();
      return false;
    }
  }
  return true;
}

// ==========================================
// HELPER DATA
// ==========================================

function findAccount(id) {
  if (id === null || id === undefined || id === 'Hutang') return null;
  return appData.accounts.find((a) => String(a.id) === String(id)) || null;
}

// Peringatan (bukan blokir) jika saldo sumber tidak cukup untuk modal transaksi.
// Resolve true = lanjut simpan, false = batal. Aman untuk semua cara menutup dialog.
function confirmLowBalance(acc, needed) {
  if (!acc || Number(acc.balance || 0) >= Number(needed || 0)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    let observer = null;
    const finish = (value) => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      resolve(value);
    };
    showConfirm(
      'Saldo Tidak Cukup',
      `Saldo ${acc.name} ${formatRupiah(acc.balance)}, sedangkan modal transaksi ${formatRupiah(needed)}. Saldo akan menjadi minus. Tetap simpan?`,
      () => finish(true),
      true
    );
    const modal = document.getElementById('custom-confirm-modal');
    observer = new MutationObserver(() => { if (!document.body.contains(modal)) finish(false); });
    observer.observe(document.body, { childList: true });
  });
}

function parseMoney(value) {
  return Number(String(value === null || value === undefined ? '' : value).replace(/[^\d]/g, '')) || 0;
}

function getCleanNumber(inputElement) {
  if (!inputElement || !inputElement.value) return 0;
  return parseMoney(inputElement.value);
}

function formatNumberInput(inputElement) {
  // Guard: dipasang sekali saja per elemen (sebelumnya listener menumpuk tiap pindah halaman)
  if (!inputElement || inputElement.dataset.numFmt === '1') return;
  inputElement.dataset.numFmt = '1';
  inputElement.addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    e.target.value = digits ? parseInt(digits, 10).toLocaleString('id-ID') : '';
  });
}

// Menyimpan perubahan saldo: gabungkan delta per akun, hasilkan operasi cloud + fungsi apply lokal
function buildAccountOps(deltas) {
  const map = new Map();
  deltas.forEach((d) => {
    if (!d.accountId || d.accountId === 'Hutang') return;
    const key = String(d.accountId);
    map.set(key, (map.get(key) || 0) + Number(d.delta || 0));
  });

  const ops = [];
  const applies = [];
  map.forEach((delta, accId) => {
    const acc = findAccount(accId);
    if (!acc || delta === 0) return;
    const newBalance = Number(acc.balance || 0) + delta;
    ops.push(['accounts', { balance: newBalance }, 'update', acc.id]);
    applies.push(() => { acc.balance = newBalance; });
  });
  return { ops, applies };
}

// ==========================================
// HELPER UI (TOAST, CONFIRM, FORM MODAL)
// ==========================================

function showNotification(message, type = 'success') {
  let toast = document.getElementById('custom-toast-container');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'custom-toast-container';
    document.body.appendChild(toast);
  }
  const ok = type === 'success';
  const icon = ok ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation';
  const color = ok ? '#34d399' : '#f87171';
  toast.style.borderColor = color;
  toast.innerHTML = `<i class="${icon}" style="color:${color}; font-size:20px;"></i><div class="toast-text">${escapeHtml(message)}</div>`;
  requestAnimationFrame(() => toast.classList.add('show'));
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), ok ? 3000 : 5000);
}

function removeModal(id) {
  const m = document.getElementById(id);
  if (m) m.remove();
}

function createModal(id, innerHtml, borderColor) {
  removeModal(id);
  const modal = document.createElement('div');
  modal.id = id;
  modal.className = 'app-modal';
  modal.innerHTML = `<div class="app-modal-box" style="border-color:${borderColor};">${innerHtml}</div>`;
  document.body.appendChild(modal);
  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) modal.remove();
  });
  return modal;
}

function showConfirm(title, message, onConfirm, isDanger = false) {
  const borderColor = isDanger ? 'rgba(248,113,113,0.4)' : 'rgba(52,211,153,0.4)';
  const iconColor = isDanger ? '#f87171' : '#34d399';
  const iconClass = isDanger ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-question';
  const btnBg = isDanger ? '#f87171' : '#17A897';

  const modal = createModal('custom-confirm-modal', `
    <div class="app-modal-head" style="color:${iconColor};">
      <i class="${iconClass}"></i><h3>${escapeHtml(title)}</h3>
    </div>
    <p class="app-modal-text">${escapeHtml(message)}</p>
    <div class="app-modal-actions">
      <button type="button" id="btn-cancel-custom" class="app-btn-ghost">Batal</button>
      <button type="button" id="btn-confirm-custom" class="app-btn-solid" style="background:${btnBg};">Ya, Lanjutkan</button>
    </div>
  `, borderColor);

  modal.querySelector('#btn-cancel-custom').onclick = () => modal.remove();
  modal.querySelector('#btn-confirm-custom').onclick = () => {
    modal.remove();
    if (typeof onConfirm === 'function') onConfirm();
  };
}

// Modal form serbaguna.
// fields: [{ id, label, type: 'text'|'tel'|'number'|'select', options:[{value,label}],
//            value, placeholder, required, allowZero }]
// onSubmit(values) -> boleh async; return false = modal tetap terbuka.
function showFormModal({ title, icon = 'fa-solid fa-pen-to-square', fields, submitText = 'Simpan', onSubmit }) {
  const fieldsHtml = fields.map((f) => {
    if (f.type === 'info') return `<div class="fm-info">${escapeHtml(f.text)}</div>`;
    const id = `fm-${f.id}`;
    let control;
    if (f.type === 'select') {
      const opts = (f.options || []).map((o) =>
        `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
      ).join('');
      control = `<select id="${id}" class="glass-input">${opts}</select>`;
    } else if (f.type === 'datetime') {
      control = `<input type="datetime-local" id="${id}" class="glass-input" value="${escapeHtml(f.value === undefined ? '' : f.value)}">`;
    } else {
      const inputMode = f.type === 'number' ? 'numeric' : (f.type === 'tel' ? 'tel' : 'text');
      control = `<input type="text" inputmode="${inputMode}" id="${id}" class="glass-input" autocomplete="off"
                  value="${escapeHtml(f.value === undefined ? '' : f.value)}" placeholder="${escapeHtml(f.placeholder || '')}">`;
    }
    return `<div class="form-group" style="margin-bottom:12px;"><label for="${id}">${escapeHtml(f.label)}</label>${control}</div>`;
  }).join('');

  const modal = createModal('custom-form-modal', `
    <form id="custom-form-modal-form" novalidate>
      <div class="app-modal-head" style="color:#34d399;"><i class="${icon}"></i><h3>${escapeHtml(title)}</h3></div>
      ${fieldsHtml}
      <div id="fm-error" class="fm-error"></div>
      <div class="app-modal-actions">
        <button type="button" id="fm-cancel" class="app-btn-ghost">Batal</button>
        <button type="submit" id="fm-submit" class="app-btn-solid" style="background:#17A897;">${escapeHtml(submitText)}</button>
      </div>
    </form>
  `, 'rgba(52,211,153,0.4)');

  fields.forEach((f) => {
    if (f.type !== 'number') return;
    const el = modal.querySelector(`#fm-${f.id}`);
    formatNumberInput(el);
    if (el.value) el.value = parseMoney(el.value).toLocaleString('id-ID');
  });

  const firstInput = modal.querySelector('input, select');
  if (firstInput) setTimeout(() => firstInput.focus(), 30);

  modal.querySelector('#fm-cancel').onclick = () => modal.remove();

  const form = modal.querySelector('#custom-form-modal-form');
  const errEl = modal.querySelector('#fm-error');
  const submitBtn = modal.querySelector('#fm-submit');
  let busy = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;

    const values = {};
    for (const f of fields) {
      if (f.type === 'info') continue;
      const el = modal.querySelector(`#fm-${f.id}`);
      const raw = (el.value || '').trim();
      if (f.type === 'number') {
        const num = parseMoney(raw);
        if (f.required && raw === '') { errEl.textContent = `${f.label} wajib diisi.`; return; }
        if (f.required && !f.allowZero && num <= 0) { errEl.textContent = `${f.label} harus lebih dari 0.`; return; }
        values[f.id] = num;
      } else {
        if (f.required && !raw) { errEl.textContent = `${f.label} wajib diisi.`; return; }
        values[f.id] = raw;
      }
    }
    errEl.textContent = '';

    busy = true;
    submitBtn.disabled = true;
    try {
      const result = await onSubmit(values);
      if (result !== false) modal.remove();
    } catch (err) {
      console.error(err);
      errEl.textContent = 'Terjadi kesalahan: ' + (err.message || err);
    } finally {
      busy = false;
      submitBtn.disabled = false;
    }
  });
}

// Pembungkus submit form: cegah klik ganda & error tak tertangani
function guardSubmit(form, handler) {
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (form.dataset.busy === '1') return;
    form.dataset.busy = '1';
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      await handler();
    } catch (err) {
      console.error(err);
      showNotification('Terjadi kesalahan: ' + (err.message || err), 'error');
    } finally {
      form.dataset.busy = '0';
      if (btn) btn.disabled = false;
    }
  };
}

// ==========================================
// NAVIGASI PAGE & SIDEBAR
// ==========================================

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('active');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}

function confirmLogout() {
  closeSidebar();
  showConfirm('Keluar Akun', 'Yakin ingin keluar dari Nexora?', handleLogout, true);
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open')) closeSidebar();
  else openSidebar();
}

const PAGE_LOADERS = {
  overview: () => loadDashboardData(),
  tariksetor: () => initTarikSetorPage(),
  ppob: () => initPpobPage(),
  voucher: () => initVoucherPage(),
  transactions: () => loadTransactionsPage(),
  balances: () => loadBalancePage(),
  finance: () => loadFinancePage(),
  customers: () => loadCustomersPage(),
  debts: () => loadDebtsPage()
};

function switchPage(pageTarget) {
  // Tutup sidebar PERTAMA: error di loader halaman tidak boleh meninggalkan overlay menutupi layar
  closeSidebar();

  const section = document.getElementById(`page-${pageTarget}`);
  if (!section) {
    console.warn('Halaman tidak ditemukan:', pageTarget);
    return;
  }

  document.querySelectorAll('.nav-link, .bottom-nav-item').forEach((n) => n.classList.remove('active'));
  document.querySelectorAll(`[data-page="${pageTarget}"]`).forEach((el) => el.classList.add('active'));
  document.querySelectorAll('.page-view').forEach((p) => p.classList.remove('active'));
  section.classList.add('active');

  try {
    const loader = PAGE_LOADERS[pageTarget];
    if (loader) loader();
  } catch (err) {
    console.error(`Gagal memuat halaman ${pageTarget}:`, err);
    showNotification('Sebagian isi halaman gagal ditampilkan.', 'error');
  }

  window.scrollTo(0, 0);
}

function refreshAllViews() {
  Object.keys(PAGE_LOADERS).forEach((key) => {
    try {
      PAGE_LOADERS[key]();
    } catch (err) {
      console.error(`Gagal render ${key}:`, err);
    }
  });
}

function bindUi() {
  if (uiBound) return;
  uiBound = true;

  // Navigasi: satu listener delegasi untuk sidebar + bottom nav
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-page]');
    if (!link) return;
    e.preventDefault();
    switchPage(link.getAttribute('data-page'));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.app-modal').forEach((m) => m.remove());
      closeSidebar();
    }
  });

  const on = (id, event, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
  };

  on('btn-add-voucher-modal', 'click', openAddProductModal);
  on('btn-add-account', 'click', openAddAccountModal);
  on('btn-add-expense', 'click', openExpenseModal);
  on('btn-add-customer', 'click', openAddCustomerModal);
  on('btn-print-batch', 'click', printSelectedReceipts);
  on('btn-export-daily', 'click', () => exportTransactionsExcel('daily'));
  on('btn-export-monthly', 'click', () => exportTransactionsExcel('monthly'));

  on('search-tx-input', 'input', (e) => {
    txSearchTerm = e.target.value.trim().toLowerCase();
    renderFullTransactionsList();
  });

  on('tx-check-all', 'change', (e) => {
    document.querySelectorAll('.tx-checkbox').forEach((cb) => { cb.checked = e.target.checked; });
  });

  const debtListEl = document.getElementById('debt-list');
  if (debtListEl) {
    debtListEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pay-customer]');
      if (btn) openPayDebtModal(btn.dataset.payCustomer);
    });
  }

  setupTarikSetorForm();
  setupPpobForm();
  setupVoucherForm();
  setupAdjustForm();
}

// ==========================================
// HELPER SELECT / OPSI AKUN
// ==========================================

function setSelectOptions(selectEl, html) {
  if (!selectEl) return;
  const prev = selectEl.value;
  selectEl.innerHTML = html;
  if (prev && Array.from(selectEl.options).some((o) => o.value === prev)) selectEl.value = prev;
}

function accountOptions(placeholder, withHutang = false, withBalance = true) {
  let html = `<option value="">${escapeHtml(placeholder)}</option>`;
  html += appData.accounts.map((acc) => {
    const label = withBalance ? `${acc.name} - Saldo: ${formatRupiah(acc.balance)}` : acc.name;
    return `<option value="${escapeHtml(acc.id)}">${escapeHtml(label)}</option>`;
  }).join('');
  if (withHutang) html += '<option value="Hutang">Hutang (Belum Dibayar)</option>';
  return html;
}

function setDefaultDateTime(inputEl) {
  if (!inputEl || inputEl.value) return;
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  inputEl.value = now.toISOString().slice(0, 16);
}

function txTypeLabel(type) {
  if (type === 'tarik_setor') return 'Tarik/Setor';
  if (type === 'ppob') return 'PPOB';
  if (type === 'voucher') return 'Kasir';
  return type || '-';
}

// Simpan satu transaksi + (opsional) hutang + stok + perubahan saldo.
// State lokal baru diubah SETELAH semua operasi cloud sukses.
async function recordTransaction({ tx, deltas, voucher = null, newStock = null, debt = null }) {
  const { ops: balanceOps, applies } = buildAccountOps(deltas);
  const ops = [['transactions', tx, 'insert']];
  if (debt) ops.push(['debts', debt, 'insert']);
  if (voucher) ops.push(['vouchers', { stock: newStock }, 'update', voucher.id]);
  ops.push(...balanceOps);

  const ok = await runOps(ops);
  if (!ok) return false;

  appData.transactions.push(tx);
  if (debt) appData.debts.push(debt);
  if (voucher) voucher.stock = newStock;
  applies.forEach((fn) => fn());
  return true;
}

// ==========================================
// TARIK / SETOR
// ==========================================

function initTarikSetorPage() {
  setSelectOptions(document.getElementById('ts-account'), accountOptions('-- Pilih Aplikasi --'));
  setSelectOptions(document.getElementById('ts-pay-method'), accountOptions('-- Pilih Rekening Penerima --', true));
  setDefaultDateTime(document.getElementById('ts-date'));
  formatNumberInput(document.getElementById('ts-admin-bank'));
  formatNumberInput(document.getElementById('ts-admin-agen'));
}

function setupTarikSetorForm() {
  const form = document.getElementById('tarik-setor-form');
  if (!form) return;

  guardSubmit(form, async () => {
    const dateVal = document.getElementById('ts-date').value;
    const accountId = document.getElementById('ts-account').value;
    const service = document.getElementById('ts-service').value;
    const modal = getCleanNumber(document.getElementById('ts-admin-bank'));
    const jual = getCleanNumber(document.getElementById('ts-admin-agen'));
    const payAccountId = document.getElementById('ts-pay-method').value;
    const customer = document.getElementById('ts-customer').value.trim();
    const extraNotes = document.getElementById('ts-notes').value.trim();

    if (!accountId || !payAccountId) {
      showNotification('Pilih akun sumber dan rekening penerima!', 'error');
      return;
    }
    if (jual <= 0) {
      showNotification('Harga jual harus lebih dari 0!', 'error');
      return;
    }
    if (payAccountId === 'Hutang' && !customer) {
      showNotification('Nama pelanggan wajib diisi untuk transaksi hutang!', 'error');
      return;
    }

    const source = findAccount(accountId);
    const receiver = findAccount(payAccountId);
    if (!source || (payAccountId !== 'Hutang' && !receiver)) {
      showNotification('Akun sumber / penerima tidak ditemukan!', 'error');
      return;
    }
    if (!(await confirmLowBalance(source, modal))) return;

    const txId = genId('tx');
    const parsedDate = dateVal ? new Date(dateVal) : new Date();
    const txDate = (isNaN(parsedDate.getTime()) ? new Date() : parsedDate).toISOString();
    const isDebt = payAccountId === 'Hutang';
    const debtId = isDebt ? genId('debt') : null;
    const notes = `${service} (${source.name})` + (extraNotes ? ` - ${extraNotes}` : '');

    const tx = {
      id: txId,
      user_id: currentUserId,
      type: 'tarik_setor',
      accountId: String(source.id),
      payAccountId: receiver ? String(receiver.id) : 'Hutang',
      debtId,
      notes,
      amount: modal,
      admin_fee: jual,
      cost_price: modal,
      profit: jual - modal,
      date: txDate,
      status: isDebt ? 'Hutang' : 'Success'
    };

    const debt = isDebt ? {
      id: debtId, user_id: currentUserId, transactionId: txId,
      customer, amount: jual, description: notes, date: txDate
    } : null;

    const deltas = [{ accountId: source.id, delta: -modal }];
    if (receiver) deltas.push({ accountId: receiver.id, delta: jual });

    const ok = await recordTransaction({ tx, deltas, debt });
    if (!ok) return;

    form.reset();
    setDefaultDateTime(document.getElementById('ts-date')); // reset() mengosongkan tanggal
    refreshAllViews();
    showNotification('Transaksi berhasil disimpan ke cloud!', 'success');
    // Transaksi hutang: tetap di halaman input (tidak pindah ke riwayat)
    if (!isDebt) switchPage('transactions');
  });
}

// ==========================================
// PPOB
// ==========================================

function initPpobPage() {
  setSelectOptions(document.getElementById('ppob-account'), accountOptions('-- Pilih Aplikasi --'));
  setSelectOptions(document.getElementById('ppob-pay-method'), accountOptions('-- Pilih Rekening Penerima --', true));
  setDefaultDateTime(document.getElementById('ppob-date'));
  formatNumberInput(document.getElementById('ppob-modal'));
  formatNumberInput(document.getElementById('ppob-jual'));
}

function setupPpobForm() {
  const form = document.getElementById('ppob-form');
  if (!form) return;

  guardSubmit(form, async () => {
    const dateVal = document.getElementById('ppob-date').value;
    const accountId = document.getElementById('ppob-account').value;
    const service = document.getElementById('ppob-service').value;
    const target = document.getElementById('ppob-target').value.trim();
    const modal = getCleanNumber(document.getElementById('ppob-modal'));
    const jual = getCleanNumber(document.getElementById('ppob-jual'));
    const payMethod = document.getElementById('ppob-pay-method').value;
    const customer = document.getElementById('ppob-customer').value.trim();

    if (!accountId || !payMethod) {
      showNotification('Pilih aplikasi sumber dan rekening penerima!', 'error');
      return;
    }
    if (jual <= 0) {
      showNotification('Harga jual harus lebih dari 0!', 'error');
      return;
    }
    if (payMethod === 'Hutang' && !customer) {
      showNotification('Nama pelanggan wajib diisi untuk transaksi hutang!', 'error');
      return;
    }

    const source = findAccount(accountId);
    const receiver = findAccount(payMethod);
    if (!source || (payMethod !== 'Hutang' && !receiver)) {
      showNotification('Akun sumber / penerima tidak ditemukan!', 'error');
      return;
    }
    if (!(await confirmLowBalance(source, modal))) return;

    const txId = genId('tx');
    const parsedDate = dateVal ? new Date(dateVal) : new Date();
    const txDate = (isNaN(parsedDate.getTime()) ? new Date() : parsedDate).toISOString();
    const isDebt = payMethod === 'Hutang';
    const debtId = isDebt ? genId('debt') : null;
    const notes = `PPOB: ${service} (${target})`;

    const tx = {
      id: txId,
      user_id: currentUserId,
      type: 'ppob',
      accountId: String(source.id),
      payAccountId: receiver ? String(receiver.id) : 'Hutang',
      debtId,
      notes,
      amount: modal,
      admin_fee: jual,
      cost_price: modal,
      profit: jual - modal,
      date: txDate,
      status: isDebt ? 'Hutang' : 'Success'
    };

    const debt = isDebt ? {
      id: debtId, user_id: currentUserId, transactionId: txId,
      customer, amount: jual, description: notes, date: txDate
    } : null;

    const deltas = [{ accountId: source.id, delta: -modal }];
    if (receiver) deltas.push({ accountId: receiver.id, delta: jual });

    const ok = await recordTransaction({ tx, deltas, debt });
    if (!ok) return;

    form.reset();
    setDefaultDateTime(document.getElementById('ppob-date')); // reset() mengosongkan tanggal
    refreshAllViews();
    showNotification('Transaksi PPOB disimpan ke cloud!', 'success');
    // Transaksi hutang: tetap di halaman input (tidak pindah ke riwayat)
    if (!isDebt) switchPage('transactions');
  });
}

// ==========================================
// KASIR & STOK BARANG (VOUCHER)
// ==========================================

function initVoucherPage() {
  const vouchers = appData.vouchers || [];

  setSelectOptions(
    document.getElementById('vouch-select-item'),
    '<option value="">-- Pilih Produk / Barang --</option>' +
      vouchers.map((v) =>
        `<option value="${escapeHtml(v.id)}">${escapeHtml(`${v.name} - Stok: ${v.stock} (${formatRupiah(v.price)})`)}</option>`
      ).join('')
  );
  setSelectOptions(document.getElementById('vouch-select-account'), accountOptions('-- Pilih Akun / Sumber Modal (Inject) --'));
  setSelectOptions(document.getElementById('vouch-pay-method'), accountOptions('-- Pilih Pembayaran --', true));

  const listEl = document.getElementById('voucher-master-list');
  if (!listEl) return;

  if (vouchers.length === 0) {
    listEl.innerHTML = '<p class="empty-state">Belum ada stok produk / barang.</p>';
    return;
  }

  listEl.innerHTML = vouchers.map((v) => `
    <div class="row-item">
      <div>
        <strong style="font-size:14px; display:block;">${escapeHtml(v.name)}</strong>
        <span style="font-size:11px; color:var(--text-muted);">Modal Saldo: ${formatRupiah(v.modal_saldo)} | Modal Fisik: ${formatRupiah(v.modal_fisik)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="text-align:right; margin-right:4px;">
          <span style="font-size:14px; font-weight:700; color:#34d399; display:block;">${formatRupiah(v.price)}</span>
          <span style="font-size:11px; color:${Number(v.stock) > 0 ? '#38bdf8' : '#f87171'};">Stok: ${Number(v.stock) || 0} pcs</span>
        </div>
        <button type="button" class="btn-mini btn-mini-blue" onclick="updateStock('${escapeHtml(v.id)}')" title="Ubah Stok">
          <i class="fa-solid fa-pen-to-square"></i> Stok
        </button>
        <button type="button" class="btn-mini btn-mini-red" onclick="deleteProduct('${escapeHtml(v.id)}')" title="Hapus Produk">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function openAddProductModal() {
  showFormModal({
    title: 'Tambah Produk Kasir',
    icon: 'fa-solid fa-box',
    submitText: 'Tambah Produk',
    fields: [
      { id: 'name', label: 'Nama Produk / Barang', type: 'text', required: true, placeholder: 'Contoh: Telkomsel 7GB / 7 Hari' },
      { id: 'modal_saldo', label: 'Modal Saldo / Inject Server (Rp)', type: 'number', required: true, allowZero: true, value: '0' },
      { id: 'modal_fisik', label: 'Modal Barang Fisik (Rp)', type: 'number', required: true, allowZero: true, value: '0' },
      { id: 'price', label: 'Harga Jual ke Pelanggan (Rp)', type: 'number', required: true },
      { id: 'stock', label: 'Jumlah Stok Awal', type: 'number', required: true, allowZero: true, value: '10' }
    ],
    onSubmit: async (v) => {
      const newVoucher = {
        id: genId('vouch'),
        user_id: currentUserId,
        name: v.name,
        modal_saldo: v.modal_saldo,
        modal_fisik: v.modal_fisik,
        price: v.price,
        stock: v.stock
      };
      const ok = await runOps([['vouchers', newVoucher, 'insert']]);
      if (!ok) return false;
      appData.vouchers.push(newVoucher);
      initVoucherPage();
      showNotification('Produk kasir berhasil ditambahkan!', 'success');
    }
  });
}

function updateStock(vouchId) {
  const vouch = appData.vouchers.find((v) => String(v.id) === String(vouchId));
  if (!vouch) return;

  showFormModal({
    title: 'Ubah Stok Barang',
    icon: 'fa-solid fa-boxes-stacked',
    fields: [
      {
        id: 'mode', label: `Aksi untuk "${vouch.name}" (stok sekarang: ${vouch.stock})`, type: 'select',
        options: [{ value: 'add', label: 'Tambah stok' }, { value: 'sub', label: 'Kurangi stok' }], value: 'add'
      },
      { id: 'qty', label: 'Jumlah (pcs)', type: 'number', required: true }
    ],
    onSubmit: async (v) => {
      let newStock = Number(vouch.stock || 0) + (v.mode === 'add' ? v.qty : -v.qty);
      if (newStock < 0) newStock = 0;
      const ok = await runOps([['vouchers', { stock: newStock }, 'update', vouch.id]]);
      if (!ok) return false;
      vouch.stock = newStock;
      initVoucherPage();
      showNotification(`Stok ${vouch.name} berhasil diperbarui!`, 'success');
    }
  });
}

function deleteProduct(vouchId) {
  const vouch = appData.vouchers.find((v) => String(v.id) === String(vouchId));
  if (!vouch) return;

  showConfirm('Hapus Produk', `Yakin ingin menghapus produk "${vouch.name}"?`, async () => {
    const ok = await runOps([['vouchers', null, 'delete', vouch.id]]);
    if (!ok) return;
    appData.vouchers = appData.vouchers.filter((v) => String(v.id) !== String(vouchId));
    initVoucherPage();
    showNotification('Produk berhasil dihapus!', 'success');
  }, true);
}

function setupVoucherForm() {
  const form = document.getElementById('sell-voucher-form');
  if (!form) return;

  guardSubmit(form, async () => {
    const vouchId = document.getElementById('vouch-select-item').value;
    const accountId = document.getElementById('vouch-select-account').value;
    const qty = parseInt(document.getElementById('vouch-qty').value, 10) || 0;
    const payMethod = document.getElementById('vouch-pay-method').value;
    const customerName = document.getElementById('vouch-customer-name').value.trim();

    if (!vouchId || !accountId || !payMethod) {
      showNotification('Lengkapi semua pilihan form kasir!', 'error');
      return;
    }
    if (qty < 1) {
      showNotification('Jumlah minimal 1 pcs!', 'error');
      return;
    }
    if (payMethod === 'Hutang' && !customerName) {
      showNotification('Nama pelanggan wajib diisi untuk transaksi hutang!', 'error');
      return;
    }

    const vouch = appData.vouchers.find((v) => String(v.id) === String(vouchId));
    const accInject = findAccount(accountId);
    const receiver = findAccount(payMethod);

    if (!vouch || !accInject || (payMethod !== 'Hutang' && !receiver)) {
      showNotification('Produk atau akun tidak ditemukan!', 'error');
      return;
    }
    if (Number(vouch.stock) < qty) {
      showNotification(`Stok ${vouch.name} tidak mencukupi! Sisa: ${vouch.stock}`, 'error');
      return;
    }

    const totalModalSaldo = Number(vouch.modal_saldo || 0) * qty;
    const totalModalFisik = Number(vouch.modal_fisik || 0) * qty;
    const totalJual = Number(vouch.price || 0) * qty;
    const totalProfit = totalJual - (totalModalSaldo + totalModalFisik);
    if (!(await confirmLowBalance(accInject, totalModalSaldo))) return;

    const txId = genId('tx');
    const txDate = new Date().toISOString();
    const isDebt = payMethod === 'Hutang';
    const debtId = isDebt ? genId('debt') : null;
    const notes = `Kasir: ${vouch.name} (${qty} pcs) via ${accInject.name}`;

    const tx = {
      id: txId,
      user_id: currentUserId,
      type: 'voucher',
      accountId: String(accInject.id),
      payAccountId: receiver ? String(receiver.id) : 'Hutang',
      voucherId: String(vouch.id),
      quantity: qty,
      debtId,
      notes,
      amount: totalModalSaldo,
      admin_fee: totalJual,
      cost_price: totalModalSaldo + totalModalFisik,
      profit: totalProfit,
      date: txDate,
      status: isDebt ? 'Hutang' : 'Success'
    };

    const debt = isDebt ? {
      id: debtId, user_id: currentUserId, transactionId: txId,
      customer: customerName, amount: totalJual, description: notes, date: txDate
    } : null;

    const deltas = [{ accountId: accInject.id, delta: -totalModalSaldo }];
    if (receiver) deltas.push({ accountId: receiver.id, delta: totalJual });

    const ok = await recordTransaction({
      tx, deltas, debt, voucher: vouch, newStock: Number(vouch.stock) - qty
    });
    if (!ok) return;

    form.reset();
    document.getElementById('vouch-qty').value = 1;
    refreshAllViews();
    showNotification('Transaksi kasir berhasil disimpan!', 'success');
    // Transaksi hutang: tetap di halaman input (tidak pindah ke riwayat)
    if (!isDebt) switchPage('transactions');
  });
}

// ==========================================
// DASHBOARD
// ==========================================

function loadDashboardData() {
  const db = appData;
  const totalSaldo = db.accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

  // Pakai tanggal LOKAL (bukan UTC) supaya "hari ini" benar di WIB
  const todayKey = localDateKey(new Date());
  const monthKey = localMonthKey(new Date());

  const todayTx = db.transactions.filter((tx) => localDateKey(tx.date) === todayKey);
  const monthTx = db.transactions.filter((tx) => localMonthKey(tx.date) === monthKey);

  const sumBy = (list, key) => list.reduce((sum, tx) => sum + Number(tx[key] || 0), 0);

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('val-total-modal', formatRupiah(totalSaldo));
  setText('val-omzet-today', formatRupiah(sumBy(todayTx, 'admin_fee')));
  // Komisi & fee = pendapatan; biaya admin Pindah Saldo = biaya. Pindah saldo sendiri BUKAN pendapatan.
  const fxDay = (typeof featureTotals === 'function') ? featureTotals('day') : { commission: 0, transferFee: 0 };
  const fxMonth = (typeof featureTotals === 'function') ? featureTotals('month') : { commission: 0, transferFee: 0 };

  setText('val-profit-today', formatRupiah(sumBy(todayTx, 'profit') + fxDay.commission - fxDay.transferFee));
  setText('val-omzet-month', formatRupiah(sumBy(monthTx, 'admin_fee')));
  setText('val-profit-month', formatRupiah(sumBy(monthTx, 'profit') + fxMonth.commission - fxMonth.transferFee));
  setText('val-commission-today', formatRupiah(fxDay.commission));
  setText('val-commission-month', formatRupiah(fxMonth.commission));
  setText('val-transfer-fee-month', formatRupiah(fxMonth.transferFee));
  setText('val-total-tx', String(db.transactions.length));

  renderRecentTransactions(db.transactions);
  updateRevenueChart();
}

function renderRecentTransactions(transactions) {
  const listEl = document.getElementById('recent-tx-list');
  if (!listEl) return;
  if (!transactions || transactions.length === 0) {
    listEl.innerHTML = '<p class="empty-state">Belum ada transaksi.</p>';
    return;
  }
  const recent = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  listEl.innerHTML = recent.map((tx) => `
    <div class="row-item" style="padding:10px 0;">
      <div>
        <strong style="font-size:13px; display:block;">${escapeHtml(tx.notes)}</strong>
        <span style="font-size:11px; color:var(--text-muted);">${escapeHtml(new Date(tx.date).toLocaleString('id-ID'))}</span>
      </div>
      <div style="text-align:right;">
        <span style="font-size:13px; font-weight:600; color:#34d399;">+${formatRupiah(tx.admin_fee)}</span>
      </div>
    </div>
  `).join('');
}

// Grafik omzet 7 hari terakhir (data nyata, sebelumnya angka contoh statis)
function updateRevenueChart() {
  const canvas = document.getElementById('revenueChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = [];
  const keys = [];
  const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(localDateKey(d));
    labels.push(`${dayNames[d.getDay()]} ${d.getDate()}`);
  }

  const totals = keys.map((key) =>
    appData.transactions
      .filter((tx) => localDateKey(tx.date) === key)
      .reduce((sum, tx) => sum + Number(tx.admin_fee || 0), 0)
  );

  if (revenueChart) {
    revenueChart.data.labels = labels;
    revenueChart.data.datasets[0].data = totals;
    revenueChart.update();
    return;
  }

  const shortRp = (v) => (v >= 1000000 ? `${v / 1000000}jt` : v >= 1000 ? `${v / 1000}rb` : v);

  revenueChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Omzet',
        data: totals,
        borderColor: '#17A897',
        backgroundColor: 'rgba(23,168,151,0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8', font: { size: 10 }, callback: shortRp },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
}

// ==========================================
// RIWAYAT TRANSAKSI
// ==========================================

function loadTransactionsPage() {
  renderFullTransactionsList();
}

function renderFullTransactionsList() {
  const tbodyEl = document.getElementById('full-tx-table-body');
  const countEl = document.getElementById('tx-count-label');
  if (!tbodyEl) return;

  let list = [...appData.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (txSearchTerm) {
    list = list.filter((tx) =>
      [tx.id, tx.notes, txTypeLabel(tx.type), tx.status]
        .some((field) => String(field || '').toLowerCase().includes(txSearchTerm))
    );
  }

  if (countEl) countEl.textContent = `Menampilkan total ${list.length} data`;

  const checkAll = document.getElementById('tx-check-all');
  if (checkAll) checkAll.checked = false;

  if (list.length === 0) {
    tbodyEl.innerHTML = '<tr><td colspan="10" class="empty-state" style="text-align:center; padding:24px;">Belum ada transaksi tercatat.</td></tr>';
    return;
  }

  tbodyEl.innerHTML = list.map((tx) => {
    const acc = findAccount(tx.accountId);
    const isDebt = tx.status === 'Hutang';
    const cost = tx.cost_price !== null && tx.cost_price !== undefined ? tx.cost_price : tx.amount;
    const safeId = escapeHtml(tx.id);
    return `
      <tr>
        <td style="text-align:center;"><input type="checkbox" class="tx-checkbox" value="${safeId}"></td>
        <td>
          <strong style="color:#38bdf8; font-size:11px; display:block;">${escapeHtml(String(tx.id).toUpperCase())}</strong>
          <span style="font-size:10px; color:var(--text-muted);">${escapeHtml(new Date(tx.date).toLocaleString('id-ID'))}</span>
        </td>
        <td>Owner</td>
        <td>${escapeHtml(acc ? acc.name : '-')}</td>
        <td>${escapeHtml(txTypeLabel(tx.type))}</td>
        <td>${escapeHtml(tx.notes)}${isDebt ? ' <span class="badge-debt">Hutang</span>' : ''}</td>
        <td style="text-align:right; font-weight:600; color:#34d399;">${formatRupiah(tx.admin_fee)}</td>
        <td style="text-align:right; color:var(--text-muted);">${formatRupiah(cost)}</td>
        <td style="text-align:right; font-weight:600; color:${Number(tx.profit) >= 0 ? '#34d399' : '#f87171'};">${formatRupiah(tx.profit)}</td>
        <td>
          <div class="tx-action-btns">
            <button type="button" class="btn-receipt" onclick="printReceipts(['${safeId}'])" title="Cetak struk"><i class="fa-solid fa-print"></i></button>
            <button type="button" class="btn-delete" onclick="deleteTransaction('${safeId}')" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// Hapus transaksi = batalkan efeknya (saldo dikembalikan, stok kembali, catatan hutang ikut dihapus)
function deleteTransaction(txId) {
  const tx = appData.transactions.find((t) => String(t.id) === String(txId));
  if (!tx) return;

  showConfirm(
    'Hapus Transaksi',
    'Transaksi akan dihapus dari cloud dan saldo rekening, stok, serta catatan hutang terkait ikut dikembalikan. Lanjutkan?',
    async () => {
      const deltas = [{ accountId: tx.accountId, delta: Number(tx.amount || 0) }];
      const relatedPayments = appData.debtPayments.filter((p) => String(p.transactionId) === String(tx.id));
      if (relatedPayments.length > 0) {
        // Uang yang sudah masuk lewat pembayaran hutang ditarik kembali dari rekening masing-masing
        relatedPayments.forEach((p) => deltas.push({ accountId: p.accountId, delta: -Number(p.amount || 0) }));
      } else if (tx.payAccountId && tx.payAccountId !== 'Hutang') {
        deltas.push({ accountId: tx.payAccountId, delta: -Number(tx.admin_fee || 0) });
      }
      const { ops: balanceOps, applies } = buildAccountOps(deltas);

      const ops = [];
      const relatedDebts = appData.debts.filter((d) =>
        (tx.debtId && String(d.id) === String(tx.debtId)) || String(d.transactionId) === String(tx.id)
      );
      relatedPayments.forEach((p) => ops.push(['debt_payments', null, 'delete', p.id]));
      relatedDebts.forEach((d) => ops.push(['debts', null, 'delete', d.id]));
      ops.push(['transactions', null, 'delete', tx.id]);

      let restoredVoucher = null;
      let restoredStock = null;
      if (tx.type === 'voucher' && tx.voucherId) {
        restoredVoucher = appData.vouchers.find((v) => String(v.id) === String(tx.voucherId)) || null;
        if (restoredVoucher) {
          restoredStock = Number(restoredVoucher.stock || 0) + Number(tx.quantity || 0);
          ops.push(['vouchers', { stock: restoredStock }, 'update', restoredVoucher.id]);
        }
      }
      ops.push(...balanceOps);

      const ok = await runOps(ops);
      if (!ok) return;

      appData.transactions = appData.transactions.filter((t) => String(t.id) !== String(txId));
      appData.debts = appData.debts.filter((d) => !relatedDebts.includes(d));
      appData.debtPayments = appData.debtPayments.filter((p) => !relatedPayments.includes(p));
      if (restoredVoucher) restoredVoucher.stock = restoredStock;
      applies.forEach((fn) => fn());

      refreshAllViews();
      showNotification('Transaksi dihapus dan saldo dikembalikan!', 'success');
    },
    true
  );
}

// ==========================================
// CETAK STRUK
// ==========================================

function printSelectedReceipts() {
  const ids = Array.from(document.querySelectorAll('.tx-checkbox:checked')).map((cb) => cb.value);
  if (ids.length === 0) {
    showNotification('Centang dulu transaksi yang ingin dicetak.', 'error');
    return;
  }
  printReceipts(ids);
}

function printReceipts(ids) {
  const list = ids
    .map((id) => appData.transactions.find((t) => String(t.id) === String(id)))
    .filter(Boolean);
  if (list.length === 0) return;

  const total = list.reduce((sum, tx) => sum + Number(tx.admin_fee || 0), 0);
  const rows = list.map((tx) => `
    <div class="item">
      <div class="id">${escapeHtml(String(tx.id).toUpperCase())}</div>
      <div>${escapeHtml(new Date(tx.date).toLocaleString('id-ID'))}</div>
      <div>${escapeHtml(tx.notes)}</div>
      <div class="line"><span>${tx.status === 'Hutang' ? 'HUTANG' : 'LUNAS'}</span><strong>${formatRupiah(tx.admin_fee)}</strong></div>
    </div>`).join('');

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Struk Nexora</title>
    <style>
      body { font-family: 'Courier New', monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; color: #000; }
      h2 { text-align: center; margin: 0 0 2px; font-size: 16px; }
      .sub { text-align: center; font-size: 10px; margin-bottom: 8px; }
      .item { border-top: 1px dashed #000; padding: 6px 0; }
      .id { font-weight: bold; }
      .line { display: flex; justify-content: space-between; margin-top: 2px; }
      .total { border-top: 2px solid #000; padding-top: 6px; display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; }
      .foot { text-align: center; margin-top: 10px; font-size: 10px; }
    </style></head><body>
      <h2>Nexora</h2><div class="sub">Business Center</div>
      ${rows}
      <div class="total"><span>TOTAL</span><span>${formatRupiah(total)}</span></div>
      <div class="foot">Terima kasih</div>
    </body></html>`;

  const w = window.open('', '_blank', 'width=380,height=640');
  if (!w) {
    showNotification('Pop-up diblokir browser. Izinkan pop-up untuk mencetak struk.', 'error');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

// ==========================================
// EXPORT EXCEL
// ==========================================

function exportTransactionsExcel(mode) {
  if (typeof XLSX === 'undefined') {
    showNotification('Library Excel belum termuat. Periksa koneksi internet.', 'error');
    return;
  }

  const todayKey = localDateKey(new Date());
  const monthKey = localMonthKey(new Date());
  const list = appData.transactions
    .filter((tx) => (mode === 'daily' ? localDateKey(tx.date) === todayKey : localMonthKey(tx.date) === monthKey))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (list.length === 0) {
    showNotification(mode === 'daily' ? 'Belum ada transaksi hari ini.' : 'Belum ada transaksi bulan ini.', 'error');
    return;
  }

  const rows = list.map((tx) => {
    const acc = findAccount(tx.accountId);
    return {
      'ID': tx.id,
      'Tanggal': new Date(tx.date).toLocaleString('id-ID'),
      'Layanan': txTypeLabel(tx.type),
      'Aplikasi': acc ? acc.name : '-',
      'Keterangan': tx.notes,
      'Status': tx.status,
      'Penjualan': Number(tx.admin_fee || 0),
      'Modal': Number(tx.cost_price !== null && tx.cost_price !== undefined ? tx.cost_price : tx.amount || 0),
      'Keuntungan': Number(tx.profit || 0)
    };
  });

  rows.push({
    'ID': 'TOTAL', 'Tanggal': '', 'Layanan': '', 'Aplikasi': '', 'Keterangan': '', 'Status': '',
    'Penjualan': rows.reduce((s, r) => s + r['Penjualan'], 0),
    'Modal': rows.reduce((s, r) => s + r['Modal'], 0),
    'Keuntungan': rows.reduce((s, r) => s + r['Keuntungan'], 0)
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 26 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, mode === 'daily' ? 'Harian' : 'Bulanan');
  const fileName = mode === 'daily' ? `Nexora_Harian_${todayKey}.xlsx` : `Nexora_Bulanan_${monthKey}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showNotification('File Excel berhasil dibuat!', 'success');
}

// ==========================================
// CATATAN HUTANG (bisa dicicil per pelanggan)
// ==========================================

function paidForDebt(debt) {
  return appData.debtPayments
    .filter((p) => String(p.debtId) === String(debt.id))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

// Kelompokkan hutang per pelanggan (nama tidak peka huruf besar/kecil), hutang terlama di atas
function groupDebtsByCustomer() {
  const map = new Map();
  [...appData.debts]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((d) => {
      const name = String(d.customer || '').trim() || '(tanpa nama)';
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { key, name, debts: [], total: 0 });
      const g = map.get(key);
      g.debts.push(d);
      g.total += Number(d.amount || 0);
    });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function loadDebtsPage() {
  const listEl = document.getElementById('debt-list');
  if (!listEl) return;

  const groups = groupDebtsByCustomer();
  let html = '';

  if (groups.length === 0) {
    html += '<p class="empty-state">Belum ada catatan hutang.</p>';
  } else {
    const grandTotal = groups.reduce((sum, g) => sum + g.total, 0);
    html += `<div class="debt-total">Total piutang: <strong>${formatRupiah(grandTotal)}</strong> dari ${groups.length} pelanggan</div>`;

    html += groups.map((g) => `
      <div class="debt-group">
        <div class="row-item debt-group-head">
          <div>
            <strong style="font-size:14px; display:block; color:#f87171;">${escapeHtml(g.name)}</strong>
            <span style="font-size:11px; color:var(--text-muted);">${g.debts.length} catatan hutang</span>
          </div>
          <div style="text-align:right; display:flex; align-items:center; gap:10px;">
            <span class="debt-sisa">${formatRupiah(g.total)}</span>
            <button type="button" class="btn-mini btn-mini-green" data-pay-customer="${escapeHtml(g.key)}">Bayar</button>
          </div>
        </div>
        ${g.debts.map((d) => {
          const paid = paidForDebt(d);
          const owed = Number(d.amount || 0);
          return `
            <div class="debt-line">
              <div>
                <span>${escapeHtml(d.description)}</span>
                <small>${escapeHtml(new Date(d.date).toLocaleString('id-ID'))}</small>
              </div>
              <div style="text-align:right; white-space:nowrap;">
                <strong>${formatRupiah(owed)}</strong>
                ${paid > 0 ? `<small>dari ${formatRupiah(owed + paid)}, dibayar ${formatRupiah(paid)}</small>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>
    `).join('');
  }

  // Riwayat pembayaran terakhir
  const history = [...appData.debtPayments].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  if (history.length > 0) {
    html += '<h5 class="debt-history-title">Riwayat Pembayaran Hutang</h5>';
    html += history.map((p) => {
      const acc = findAccount(p.accountId);
      return `
        <div class="row-item" style="padding:8px 0;">
          <div>
            <strong style="font-size:13px; display:block;">${escapeHtml(p.customer || '(tanpa nama)')}</strong>
            <span style="font-size:11px; color:var(--text-muted);">${escapeHtml(new Date(p.date).toLocaleString('id-ID'))} - ke ${escapeHtml(acc ? acc.name : '-')}</span>
          </div>
          <span style="font-size:13px; font-weight:600; color:#34d399;">+${formatRupiah(p.amount)}</span>
        </div>`;
    }).join('');
  }

  listEl.innerHTML = html;
}

// Bayar hutang (boleh sebagian). Nominal dialokasikan ke hutang TERLAMA dulu.
// Contoh: Joko hutang 50.000, bayar 30.000 -> sisa 20.000.
function openPayDebtModal(customerKey) {
  const group = groupDebtsByCustomer().find((g) => g.key === customerKey);
  if (!group) return;
  if (appData.accounts.length === 0) {
    showNotification('Belum ada rekening untuk menerima pembayaran.', 'error');
    return;
  }

  showFormModal({
    title: `Bayar Hutang - ${group.name}`,
    icon: 'fa-solid fa-hand-holding-dollar',
    submitText: 'Simpan Pembayaran',
    fields: [
      {
        id: 'info',
        type: 'info',
        text: `Total hutang ${group.name}: ${formatRupiah(group.total)}. Isi nominal yang dibayar sekarang; kalau kurang dari total, sisanya tetap tercatat sebagai hutang.`
      },
      { id: 'amount', label: 'Nominal Dibayar (Rp)', type: 'number', required: true, value: String(group.total) },
      {
        id: 'account',
        label: 'Uang masuk ke rekening',
        type: 'select',
        required: true,
        options: [{ value: '', label: '-- Pilih Rekening Penerima --' }].concat(
          appData.accounts.map((a) => ({ value: String(a.id), label: `${a.name} - Saldo: ${formatRupiah(a.balance)}` }))
        )
      }
    ],
    onSubmit: async (v) => {
      const acc = findAccount(v.account);
      if (!acc) return false;

      if (v.amount > group.total) {
        showNotification(`Nominal melebihi total hutang (${formatRupiah(group.total)}).`, 'error');
        return false;
      }

      const nowIso = new Date().toISOString();
      const ops = [];
      const newPayments = [];
      const removedDebtIds = [];
      const reducedDebts = []; // { debt, newAmount }
      const settledTxs = [];
      let left = v.amount;

      for (const d of group.debts) {
        if (left <= 0) break;
        const owed = Number(d.amount || 0);
        const part = Math.min(owed, left);
        if (part <= 0) continue;
        left -= part;

        const payment = {
          id: genId('pay'),
          user_id: currentUserId,
          debtId: String(d.id),
          transactionId: d.transactionId ? String(d.transactionId) : null,
          customer: d.customer || group.name,
          amount: part,
          accountId: String(acc.id),
          date: nowIso
        };
        newPayments.push(payment);
        ops.push(['debt_payments', payment, 'insert']);

        const remainingOwed = owed - part;
        if (remainingOwed > 0) {
          ops.push(['debts', { amount: remainingOwed }, 'update', d.id]);
          reducedDebts.push({ debt: d, newAmount: remainingOwed });
        } else {
          ops.push(['debts', null, 'delete', d.id]);
          removedDebtIds.push(String(d.id));
          const tx = appData.transactions.find((t) => String(t.id) === String(d.transactionId));
          if (tx) {
            ops.push(['transactions', { status: 'Success' }, 'update', tx.id]);
            settledTxs.push(tx);
          }
        }
      }

      const { ops: balanceOps, applies } = buildAccountOps([{ accountId: acc.id, delta: v.amount }]);
      ops.push(...balanceOps);

      const ok = await runOps(ops);
      if (!ok) return false;

      appData.debtPayments.push(...newPayments);
      reducedDebts.forEach((r) => { r.debt.amount = r.newAmount; });
      appData.debts = appData.debts.filter((d) => !removedDebtIds.includes(String(d.id)));
      settledTxs.forEach((tx) => { tx.status = 'Success'; });
      applies.forEach((fn) => fn());

      refreshAllViews();
      const sisa = group.total - v.amount;
      showNotification(
        sisa > 0
          ? `${group.name} membayar ${formatRupiah(v.amount)}. Sisa hutang ${formatRupiah(sisa)}.`
          : `${group.name} melunasi hutang ${formatRupiah(v.amount)}.`,
        'success'
      );
    }
  });
}

// ==========================================
// BALANCE MANAGEMENT
// ==========================================

function loadBalancePage() {
  const gridEl = document.getElementById('accounts-grid');
  const selectEl = document.getElementById('adj-account-id');
  if (!gridEl) return;

  if (appData.accounts.length === 0) {
    gridEl.innerHTML = '<p class="empty-state">Belum ada akun. Klik "Tambah Akun" untuk memulai.</p>';
  } else {
    gridEl.innerHTML = appData.accounts.map((acc) => `
      <div class="metric-card glass-card">
        <div class="metric-header"><span>${escapeHtml(acc.name)}</span></div>
        <h3 class="metric-value">${formatRupiah(acc.balance)}</h3>
      </div>
    `).join('');
  }

  setSelectOptions(
    selectEl,
    appData.accounts.map((acc) =>
      `<option value="${escapeHtml(acc.id)}">${escapeHtml(`${acc.name} (${formatRupiah(acc.balance)})`)}</option>`
    ).join('')
  );
  formatNumberInput(document.getElementById('adj-new-balance'));
}

function openAddAccountModal() {
  showFormModal({
    title: 'Tambah Akun / Rekening',
    icon: 'fa-solid fa-vault',
    submitText: 'Tambah Akun',
    fields: [
      { id: 'name', label: 'Nama Akun', type: 'text', required: true, placeholder: 'Contoh: DANA, BNI, Kas Laci' },
      { id: 'balance', label: 'Saldo Awal (Rp)', type: 'number', required: true, allowZero: true, value: '0' }
    ],
    onSubmit: async (v) => {
      const acc = { id: genId('acc'), user_id: currentUserId, name: v.name, balance: v.balance };
      const ok = await runOps([['accounts', acc, 'insert']]);
      if (!ok) return false;
      appData.accounts.push(acc);
      refreshAllViews();
      showNotification('Akun berhasil ditambahkan!', 'success');
    }
  });
}

function setupAdjustForm() {
  const form = document.getElementById('adjust-balance-form');
  if (!form) return;

  guardSubmit(form, async () => {
    const accId = document.getElementById('adj-account-id').value;
    const newBalance = getCleanNumber(document.getElementById('adj-new-balance'));
    const notes = document.getElementById('adj-notes').value.trim();
    const acc = findAccount(accId);

    if (!acc) {
      showNotification('Pilih akun yang valid!', 'error');
      return;
    }
    if (!document.getElementById('adj-new-balance').value.trim()) {
      showNotification('Isi saldo baru!', 'error');
      return;
    }
    if (!notes) {
      showNotification('Alasan penyesuaian wajib diisi!', 'error');
      return;
    }

    const selisih = newBalance - Number(acc.balance || 0);
    const ok = await runOps([['accounts', { balance: newBalance }, 'update', acc.id]]);
    if (!ok) return;

    acc.balance = newBalance;
    form.reset();
    refreshAllViews();
    showNotification(`Saldo ${acc.name} diperbarui (selisih ${selisih >= 0 ? '+' : ''}${formatRupiah(selisih)}).`, 'success');
  });
}

// ==========================================
// FINANCE (PENGELUARAN & PRIVE)
// ==========================================

function loadFinancePage() {
  const listEl = document.getElementById('expense-list');
  const sumType = (type) => appData.expenses
    .filter((e) => e.type === type)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const opEl = document.getElementById('val-total-operational');
  const prEl = document.getElementById('val-total-prive');
  if (opEl) opEl.textContent = formatRupiah(sumType('operasional'));
  if (prEl) prEl.textContent = formatRupiah(sumType('prive'));
  if (!listEl) return;

  if (appData.expenses.length === 0) {
    listEl.innerHTML = '<p class="empty-state">Belum ada catatan pengeluaran.</p>';
    return;
  }

  const sorted = [...appData.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
  listEl.innerHTML = sorted.map((e) => {
    const acc = findAccount(e.accountId);
    return `
      <div class="row-item">
        <div>
          <strong style="font-size:13px; display:block;">${escapeHtml(e.description)}</strong>
          <span style="font-size:11px; color:var(--text-muted);">
            ${e.type === 'prive' ? 'Prive' : 'Operasional'} - ${escapeHtml(acc ? acc.name : '-')} - ${escapeHtml(new Date(e.date).toLocaleString('id-ID'))}
          </span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:13px; font-weight:600; color:#f87171;">-${formatRupiah(e.amount)}</span>
          <button type="button" class="btn-mini btn-mini-red" onclick="deleteExpense('${escapeHtml(e.id)}')" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>`;
  }).join('');
}

function openExpenseModal() {
  if (appData.accounts.length === 0) {
    showNotification('Tambahkan akun/rekening dulu di Balance Mgmt.', 'error');
    return;
  }

  showFormModal({
    title: 'Catat Pengeluaran',
    icon: 'fa-solid fa-file-invoice-dollar',
    submitText: 'Simpan Pengeluaran',
    fields: [
      {
        id: 'type', label: 'Jenis', type: 'select', value: 'operasional',
        options: [
          { value: 'operasional', label: 'Pengeluaran Operasional (biaya toko)' },
          { value: 'prive', label: 'Pengambilan Pribadi (Prive)' }
        ]
      },
      { id: 'description', label: 'Keterangan', type: 'text', required: true, placeholder: 'Contoh: Bayar listrik toko' },
      { id: 'amount', label: 'Nominal (Rp)', type: 'number', required: true },
      {
        id: 'account', label: 'Diambil dari akun', type: 'select', required: true,
        options: [{ value: '', label: '-- Pilih Akun --' }].concat(
          appData.accounts.map((a) => ({ value: String(a.id), label: `${a.name} - Saldo: ${formatRupiah(a.balance)}` }))
        )
      }
    ],
    onSubmit: async (v) => {
      const acc = findAccount(v.account);
      if (!acc) return false;

      const expense = {
        id: genId('exp'),
        user_id: currentUserId,
        type: v.type,
        description: v.description,
        amount: v.amount,
        accountId: String(acc.id),
        date: new Date().toISOString()
      };
      const { ops: balanceOps, applies } = buildAccountOps([{ accountId: acc.id, delta: -v.amount }]);
      const ok = await runOps([['expenses', expense, 'insert'], ...balanceOps]);
      if (!ok) return false;

      appData.expenses.push(expense);
      applies.forEach((fn) => fn());
      refreshAllViews();
      showNotification('Pengeluaran berhasil dicatat!', 'success');
    }
  });
}

function deleteExpense(expenseId) {
  const exp = appData.expenses.find((e) => String(e.id) === String(expenseId));
  if (!exp) return;

  showConfirm('Hapus Catatan', 'Catatan dihapus dan saldo akun dikembalikan. Lanjutkan?', async () => {
    const { ops: balanceOps, applies } = buildAccountOps([{ accountId: exp.accountId, delta: Number(exp.amount || 0) }]);
    const ok = await runOps([['expenses', null, 'delete', exp.id], ...balanceOps]);
    if (!ok) return;

    appData.expenses = appData.expenses.filter((e) => String(e.id) !== String(expenseId));
    applies.forEach((fn) => fn());
    refreshAllViews();
    showNotification('Catatan pengeluaran dihapus!', 'success');
  }, true);
}

// ==========================================
// CUSTOMERS
// ==========================================

function loadCustomersPage() {
  const listEl = document.getElementById('customer-list');
  if (!listEl) return;

  if (appData.customers.length === 0) {
    listEl.innerHTML = '<p class="empty-state">Belum ada data pelanggan.</p>';
    return;
  }

  listEl.innerHTML = appData.customers.map((c) => {
    const owed = appData.debts
      .filter((d) => String(d.customer || '').trim().toLowerCase() === String(c.name || '').trim().toLowerCase())
      .reduce((sum, d) => sum + Number(d.amount || 0), 0);
    return `
      <div class="row-item">
        <div>
          <strong style="font-size:14px; display:block;">${escapeHtml(c.name)}</strong>
          <span style="font-size:11px; color:var(--text-muted);">${escapeHtml(c.phone || 'Tanpa nomor')}</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          ${owed > 0 ? `<span style="font-size:12px; font-weight:600; color:#f87171;">Hutang ${formatRupiah(owed)}</span>` : ''}
          <button type="button" class="btn-mini btn-mini-red" onclick="deleteCustomer('${escapeHtml(c.id)}')" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>`;
  }).join('');
}

function openAddCustomerModal() {
  showFormModal({
    title: 'Tambah Pelanggan',
    icon: 'fa-solid fa-user-plus',
    submitText: 'Tambah',
    fields: [
      { id: 'name', label: 'Nama Pelanggan', type: 'text', required: true },
      { id: 'phone', label: 'No. HP (opsional)', type: 'tel' }
    ],
    onSubmit: async (v) => {
      const customer = { id: genId('cust'), user_id: currentUserId, name: v.name, phone: v.phone };
      const ok = await runOps([['customers', customer, 'insert']]);
      if (!ok) return false;
      appData.customers.push(customer);
      loadCustomersPage();
      showNotification('Pelanggan berhasil ditambahkan!', 'success');
    }
  });
}

function deleteCustomer(customerId) {
  const c = appData.customers.find((x) => String(x.id) === String(customerId));
  if (!c) return;

  showConfirm('Hapus Pelanggan', `Hapus data pelanggan "${c.name}"?`, async () => {
    const ok = await runOps([['customers', null, 'delete', c.id]]);
    if (!ok) return;
    appData.customers = appData.customers.filter((x) => String(x.id) !== String(customerId));
    loadCustomersPage();
    showNotification('Pelanggan dihapus!', 'success');
  }, true);
}