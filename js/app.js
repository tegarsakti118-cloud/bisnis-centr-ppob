// ==========================================
// NEXORA v2.1 - APP ENGINE (SUPABASE CLOUD)
// ==========================================

const sb = window.supabaseClient;

let appData = {
  accounts: [],
  transactions: [],
  vouchers: [],
  debts: [],
  expenses: [],
  customers: [],
  debtPayments: [],
  balanceTransfers: [],
  commissions: [],
  cashCalculations: [],
  cashCalculationItems: []
};

let currentUserId = null;
let currentUserEmail = '';
let revenueChart = null;
let uiBound = false;

const CLOUD_TABLES = ['accounts', 'transactions', 'vouchers', 'debts', 'expenses', 'customers', 'debt_payments'];
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

  try {
    const { data: me, error: meErr } = await sb.rpc('nx_whoami');
    if (meErr) throw meErr;
    if (!me || !me.allowed) {
      const reason = me && me.reason;
      await sb.auth.signOut();
      try { sessionStorage.setItem('nx_login_msg', window.NexoraAuth ? NexoraAuth.blockMessage(reason) : 'Akun Anda tidak dapat masuk.'); } catch (e) { /* abaikan */ }
      window.location.replace('login.html');
      return;
    }
    window.nxMe = me;
    if (window.NexoraAuth) NexoraAuth.applyMenu(me);
    try {
      const { data: names } = await sb.rpc('nx_staff_names');
      window.nxStaffNames = names || {};
    } catch (e) { window.nxStaffNames = {}; }
    try {
      const { data: bcfg } = await sb.rpc('nx_my_branch_config');
      window.nxBranchCfg = bcfg || {};
    } catch (e) { window.nxBranchCfg = {}; }
    try {
      const { data: biz } = await sb.from('businesses').select('name, logo_data').maybeSingle();
      const { data: br } = await sb.from('branches').select('name, code, address, phone').eq('id', me.branch_id).maybeSingle();
      window.nxBiz = { name: biz ? biz.name : '', logo: biz ? biz.logo_data : null, branch: br || {} };
    } catch (e) { window.nxBiz = { name: '', logo: null, branch: {} }; }
  } catch (err) {
    console.error('Gagal memverifikasi akun:', err);
    document.body.classList.remove('auth-pending');
    showNotification('Tidak dapat memverifikasi akun. Periksa koneksi lalu muat ulang.', 'error');
    return;
  }

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') window.location.replace('login.html');
  });

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
  const me0 = window.nxMe;
  if (nameEl) nameEl.textContent = me0 ? (me0.username ? '@' + me0.username : (me0.full_name || 'Pengguna')) : 'Pengguna';
  const me = window.nxMe;
  if (roleEl) {
    roleEl.textContent = me && window.NexoraAuth
      ? NexoraAuth.roleLabel(me.role) + (me.branch_name ? ' · ' + me.branch_name : '')
      : 'Cloud - Terhubung';

    if (me && !document.getElementById('nx-sub-badge')) {
      const badge = document.createElement('span');
      badge.id = 'nx-sub-badge';

      const exp = me.subscription_until ? new Date(me.subscription_until) : null;
      const daysLeft = exp ? Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24)) : 0;

      const DEVELOPER_EMAIL = 'sakapay404@gmail.com';
      const isUnlimited = (currentUserEmail || '').toLowerCase() === DEVELOPER_EMAIL.toLowerCase();
      if (isUnlimited) {
        badge.style.cssText = 'display:inline-block; margin-top:4px; font-size:10px; font-weight:700; padding:2px 8px; border-radius:999px; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3);';
        badge.textContent = '🌟 Lifetime Access';
      } else {
        badge.style.cssText = `display:inline-block; margin-top:4px; font-size:10px; font-weight:700; padding:2px 8px; border-radius:999px; cursor:pointer; ${
          daysLeft <= 3 ? 'background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.4);' : 'background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid rgba(34,197,94,0.3);'
        }`;
        badge.textContent = daysLeft > 0 ? `Aktif: ${daysLeft} hari lagi` : 'Langganan berakhir hari ini';
        badge.title = 'Klik untuk lihat promo langganan';
        badge.innerHTML += ' <i class="fa-solid fa-tags" style="font-size:9px; margin-left:3px;"></i>';
        badge.onclick = (e) => {
          e.stopPropagation();
          openSubscriptionUpgradeModal();
        };
      }
      roleEl.insertAdjacentElement('afterend', badge);
    }

    if (me && me.role === 'super_admin' && !document.getElementById('nx-admin-link')) {
      const a = document.createElement('a');
      a.id = 'nx-admin-link';
      a.href = 'admin.html';
      a.textContent = 'Buka Panel Admin';
      a.style.cssText = 'display:block;margin-top:6px;font-size:11px;color:#17A897;text-decoration:none;';
      roleEl.insertAdjacentElement('afterend', a);
    }
  }
}

function isAuthError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return err.code === 'PGRST301' || err.status === 401 || /jwt/i.test(msg);
}

// ==========================================
// FETCH & SAVE DATA CLOUD SUPABASE
// ==========================================

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

let atomicWarned = false;

function isMissingFunctionError(err) {
  const msg = String((err && err.message) || err || '') + ' ' + String((err && err.code) || '');
  return /could not find the function|schema cache|PGRST202|42883/i.test(msg);
}

function toServerOps(ops) {
  const list = ops.map(([table, payload, action, id]) => {
    if (action === 'update' && table === 'accounts' && payload && 'balance' in payload) {
      const acc = findAccount(id);
      if (!acc) throw new Error('Rekening tidak ditemukan di layar. Muat ulang aplikasi.');
      return { t: 'incr', table, id: String(id), amount: Number(payload.balance) - Number(acc.balance || 0) };
    }
    if (action === 'update' && table === 'vouchers' && payload && Object.keys(payload).length === 1 && 'stock' in payload) {
      const v = (appData.vouchers || []).find((x) => String(x.id) === String(id));
      if (!v) throw new Error('Produk tidak ditemukan di layar. Muat ulang aplikasi.');
      return { t: 'incr', table, id: String(id), amount: Number(payload.stock) - Number(v.stock || 0) };
    }
    if (action === 'insert') return { t: 'insert', table, row: payload };
    if (action === 'update') return { t: 'update', table, id: String(id), set: payload };
    if (action === 'delete') return { t: 'delete', table, id: String(id) };
    throw new Error('Aksi tidak dikenal: ' + action);
  });
  list.forEach((o) => {
    if (o.t === 'incr' && !Number.isFinite(o.amount)) throw new Error('Nominal tidak valid');
  });
  return list.filter((o) => !(o.t === 'incr' && o.amount === 0));
}

function scheduleServerSync(result) {
  if (!result) return;
  const accs = Array.isArray(result.accounts) ? result.accounts : [];
  const vous = Array.isArray(result.vouchers) ? result.vouchers : [];
  setTimeout(() => {
    let changed = false;
    accs.forEach((a) => {
      const acc = findAccount(a.id);
      if (acc && Number(acc.balance) !== Number(a.balance)) { acc.balance = Number(a.balance); changed = true; }
    });
    vous.forEach((v) => {
      const item = (appData.vouchers || []).find((x) => String(x.id) === String(v.id));
      if (item && Number(item.stock) !== Number(v.stock)) { item.stock = Number(v.stock); changed = true; }
    });
    if (changed) refreshAllViews();
  }, 0);
}

async function runOpsAtomic(ops, meta) {
  let payload;
  try {
    payload = toServerOps(ops);
  } catch (err) {
    showNotification(err.message || String(err), 'error');
    return { ok: false };
  }
  if (payload.length === 0) return { ok: true, data: null };

  try {
    const { data, error } = await sb.rpc('nx_apply_ops', {
      p_ops: payload,
      p_kind: meta.kind || null,
      p_ref: meta.ref || null,
      p_note: meta.note || null
    });
    if (error) throw error;
    return { ok: true, data };
  } catch (err) {
    if (isMissingFunctionError(err)) return { ok: false, missing: true };
    console.error('nx_apply_ops gagal:', err);
    showNotification('Gagal menyimpan, tidak ada data yang berubah: ' + ((err && err.message) || err), 'error');
    return { ok: false };
  }
}

async function runOpsSequential(ops) {
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

async function runOps(ops, meta = {}) {
  const res = await runOpsAtomic(ops, meta);
  if (res.ok) {
    scheduleServerSync(res.data);
    return true;
  }
  if (res.missing) {
    if (!atomicWarned) {
      atomicWarned = true;
      console.warn('[Nexora] Fungsi nx_apply_ops belum ada. Jalankan sql/nexora_atomik_mutasi.sql di Supabase.');
      showNotification('Mode aman (atomik) belum aktif: jalankan sql/nexora_atomik_mutasi.sql di Supabase.', 'error');
    }
    return runOpsSequential(ops);
  }
  await fetchCloudData();
  refreshAllViews();
  return false;
}

// ==========================================
// HELPER DATA
// ==========================================

function findAccount(id) {
  if (id === null || id === undefined || id === 'Hutang') return null;
  return appData.accounts.find((a) => String(a.id) === String(id)) || null;
}

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
  if (!inputElement || inputElement.dataset.numFmt === '1') return;
  inputElement.dataset.numFmt = '1';
  inputElement.addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    e.target.value = digits ? parseInt(digits, 10).toLocaleString('id-ID') : '';
  });
}

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
      if (btn) btn.disabled = form.dataset.pairInvalid === '1';
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
  if (window.nxMe && window.NexoraAuth && !NexoraAuth.pageAllowed(window.nxMe, pageTarget)) {
    showNotification('Fitur ini tidak diizinkan untuk akun atau cabang Anda.', 'error');
    const alt = NexoraAuth.firstAllowed(window.nxMe);
    if (alt !== pageTarget) switchPage(alt);
    return;
  }
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

  on('btn-add-voucher-modal', 'click', () => openAddProductModal());
  on('btn-add-account', 'click', openAddAccountModal);
  on('btn-add-expense', 'click', openExpenseModal);
  on('btn-add-customer', 'click', openAddCustomerModal);
  on('btn-print-batch', 'click', printSelectedReceipts);
  on('btn-export-daily', 'click', () => exportTransactionsExcel('daily'));
  on('btn-export-monthly', 'click', () => exportTransactionsExcel('monthly'));

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
  if (typeof initTarikTunaiFields === 'function') initTarikTunaiFields();
}

function setupTarikSetorForm() {
  const form = document.getElementById('tarik-setor-form');
  if (!form) return;

  if (window.NxValidation) {
    const accEl = document.getElementById('ts-account');
    const payEl = document.getElementById('ts-pay-method');
    const svcEl = document.getElementById('ts-service');
    NxValidation.bindPairGuard(form, [accEl, payEl, svcEl],
      () => (svcEl.value === 'Tarik Tunai' ? null : [accEl.value, payEl.value]), payEl);
  }

  guardSubmit(form, async () => {
    if (document.getElementById('ts-service').value === 'Tarik Tunai' && typeof submitTarikTunai === 'function') {
      await submitTarikTunai(form);
      return;
    }
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
    const pairCheck = NxValidation.validateAccountPair(accountId, payAccountId);
    if (!pairCheck.ok) {
      showNotification(pairCheck.message, 'error');
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
    setDefaultDateTime(document.getElementById('ts-date'));
    refreshAllViews();
    showNotification('Transaksi berhasil disimpan ke cloud!', 'success');
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
  syncPpobOther();
}

function syncPpobOther() {
  const service = document.getElementById('ppob-service');
  const group = document.getElementById('ppob-other-group');
  const input = document.getElementById('ppob-other');
  if (!service || !group || !input) return;
  const isOther = service.value === 'Lainnya';
  group.hidden = !isOther;
  input.required = isOther;
  if (!isOther) input.value = '';
}

function setupPpobForm() {
  const form = document.getElementById('ppob-form');
  if (!form) return;

  const serviceSel = document.getElementById('ppob-service');
  if (serviceSel) serviceSel.addEventListener('change', syncPpobOther);
  form.addEventListener('reset', () => setTimeout(syncPpobOther, 0));

  if (window.NxValidation) {
    const accEl = document.getElementById('ppob-account');
    const payEl = document.getElementById('ppob-pay-method');
    NxValidation.bindPairGuard(form, [accEl, payEl], () => [accEl.value, payEl.value], payEl);
  }

  guardSubmit(form, async () => {
    const dateVal = document.getElementById('ppob-date').value;
    const accountId = document.getElementById('ppob-account').value;
    const service = document.getElementById('ppob-service').value;
    const target = document.getElementById('ppob-target').value.trim();
    const modal = getCleanNumber(document.getElementById('ppob-modal'));
    const jual = getCleanNumber(document.getElementById('ppob-jual'));
    const payMethod = document.getElementById('ppob-pay-method').value;
    const customer = document.getElementById('ppob-customer').value.trim();
    const otherInput = document.getElementById('ppob-other');
    const otherService = service === 'Lainnya' && otherInput ? otherInput.value.trim() : '';

    if (!accountId || !payMethod) {
      showNotification('Pilih aplikasi sumber dan rekening penerima!', 'error');
      return;
    }
    const pairCheck = NxValidation.validateAccountPair(accountId, payMethod);
    if (!pairCheck.ok) {
      showNotification(pairCheck.message, 'error');
      return;
    }
    if (service === 'Lainnya' && !otherService) {
      showNotification('Isi nama / jenis layanan untuk kategori Lainnya!', 'error');
      if (otherInput) otherInput.focus();
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
    const serviceLabel = otherService ? `${service} - ${otherService}` : service;
    const notes = `PPOB: ${serviceLabel} (${target})`;

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
    setDefaultDateTime(document.getElementById('ppob-date'));
    syncPpobOther();
    refreshAllViews();
    showNotification('Transaksi PPOB disimpan ke cloud!', 'success');
    if (!isDebt) switchPage('transactions');
  });
}

// ==========================================
// KASIR & STOK BARANG (VOUCHER)
// ==========================================

function initVoucherPage() {
  const vouchers = appData.vouchers || [];

  setSelectOptions(document.getElementById('vouch-select-account'), accountOptions('-- Pilih Akun / Sumber Modal (Inject) --'));
  setSelectOptions(document.getElementById('vouch-pay-method'), accountOptions('-- Pilih Pembayaran --', true));

  if (typeof renderKasirCart === 'function') renderKasirCart();

  const canManageProduct = !window.nxMe || !window.nxMe.perms || window.nxMe.perms.kelola_produk !== false;
  const addBtn = document.getElementById('btn-add-voucher-modal');
  if (addBtn) addBtn.style.display = canManageProduct ? '' : 'none';

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
        ${canManageProduct ? `<button type="button" class="btn-mini btn-mini-blue" onclick="updateStock('${escapeHtml(v.id)}')" title="Ubah Stok">
          <i class="fa-solid fa-pen-to-square"></i> Stok
        </button>
        <button type="button" class="btn-mini btn-mini-red" onclick="deleteProduct('${escapeHtml(v.id)}')" title="Hapus Produk">
          <i class="fa-solid fa-trash-can"></i>
        </button>` : ''}
      </div>
    </div>
  `).join('');
}

function openAddProductModal(prefill) {
  const rawPrefill = typeof prefill === 'string' ? prefill.trim() : '';
  const isBarcode = /^\d{4,}$/.test(rawPrefill);

  showFormModal({
    title: 'Tambah Produk Kasir',
    icon: 'fa-solid fa-box',
    submitText: 'Tambah Produk',
    fields: [
      { id: 'name', label: 'Nama Produk / Barang', type: 'text', required: true, value: isBarcode ? '' : rawPrefill, placeholder: 'Contoh: Telkomsel 7GB / Teh Botol' },
      { id: 'barcode', label: 'Barcode / Kode Barang (Opsional)', type: 'text', value: isBarcode ? rawPrefill : '', placeholder: 'Ketik atau klik tombol scan di samping' },
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
        barcode: (v.barcode || '').trim() || null,
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

  setTimeout(() => {
    const barInput = document.getElementById('fm-barcode');
    if (!barInput) return;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex; gap:8px; align-items:center; width:100%;';
    barInput.parentNode.insertBefore(wrap, barInput);
    wrap.appendChild(barInput);

    const btnScan = document.createElement('button');
    btnScan.type = 'button';
    btnScan.className = 'btn-mini btn-mini-blue';
    btnScan.style.cssText = 'padding:10px 14px; white-space:nowrap; display:flex; align-items:center; gap:6px; font-weight:700;';
    btnScan.innerHTML = '<i class="fa-solid fa-camera"></i> Scan';
    wrap.appendChild(btnScan);

    const camBox = document.createElement('div');
    camBox.id = 'modal-scanner-wrap';
    camBox.style.cssText = 'display:none; margin-top:8px; padding:10px; background:rgba(0,0,0,0.3); border-radius:12px; text-align:center; border:1px solid var(--glass-border);';
    camBox.innerHTML = `
      <div id="modal-scanner-view" style="width:100%; max-width:280px; margin:0 auto; border-radius:8px; overflow:hidden;"></div>
      <button type="button" id="modal-scanner-close" class="btn-mini btn-mini-red" style="margin-top:8px;">Batal Scan</button>
    `;
    wrap.parentNode.appendChild(camBox);

    let modalScanner = null;
    let modalScanHandled = false;

    const stopModalScanner = async () => {
      try {
        if (modalScanner && modalScanner.isScanning) {
          await modalScanner.stop();
        }
      } catch (e) { /* abaikan */ }
      camBox.style.display = 'none';
    };

    const onModalScanSuccess = (decodedText) => {
      if (modalScanHandled) return;
      modalScanHandled = true;
      barInput.value = String(decodedText || '').trim();
      showNotification(`Barcode ${barInput.value} berhasil di-scan!`, 'success');
      stopModalScanner();
    };

    btnScan.onclick = async () => {
      if (typeof Html5Qrcode === 'undefined') {
        showNotification('Library scanner belum siap. Cek koneksi internet.', 'error');
        return;
      }
      if (modalScanner && modalScanner.isScanning) {
        await stopModalScanner();
        return;
      }

      modalScanHandled = false;
      camBox.style.display = 'block';

      if (!modalScanner) {
        const formats = (typeof Html5QrcodeSupportedFormats !== 'undefined') ? [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE
        ] : undefined;
        modalScanner = new Html5Qrcode('modal-scanner-view', {
          formatsToSupport: formats,
          useBarCodeDetectorIfSupported: true,
          verbose: false
        });
      }

      const qrboxFn = (vw, vh) => ({
        width: Math.max(160, Math.floor(vw * 0.85)),
        height: Math.max(90, Math.floor(vh * 0.45))
      });

      try {
        await modalScanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: qrboxFn,
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
              focusMode: 'continuous'
            }
          },
          onModalScanSuccess,
          () => {}
        );
      } catch (err) {
        try {
          await modalScanner.start(
            { facingMode: 'environment' },
            { fps: 12, qrbox: qrboxFn },
            onModalScanSuccess,
            () => {}
          );
        } catch (err2) {
          console.error(err2);
          camBox.style.display = 'none';
          showNotification('Gagal membuka kamera. Pastikan izin kamera aktif.', 'error');
        }
      }
    };

    camBox.querySelector('#modal-scanner-close').onclick = stopModalScanner;

    const modalEl = document.getElementById('custom-form-modal');
    if (modalEl) {
      const obs = new MutationObserver(() => {
        if (!document.body.contains(modalEl)) {
          obs.disconnect();
          stopModalScanner();
        }
      });
      obs.observe(document.body, { childList: true });
    }
  }, 50);
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
  if (typeof setupKasirUi === 'function') setupKasirUi();
  else console.error('[Nexora] js/kasir.js belum termuat.');
}

// ==========================================
// DASHBOARD
// ==========================================

function loadDashboardData() {
  const db = appData;
  const totalSaldo = db.accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

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

  const fxDay = (typeof featureTotals === 'function') ? featureTotals('day') : { commission: 0, transferFee: 0 };
  const fxMonth = (typeof featureTotals === 'function') ? featureTotals('month') : { commission: 0, transferFee: 0 };

  setText('val-profit-today', formatRupiah(sumBy(todayTx, 'profit') + fxDay.commission - fxDay.transferFee));
  setText('val-omzet-month', formatRupiah(sumBy(monthTx, 'admin_fee')));
  setText('val-profit-month', formatRupiah(sumBy(monthTx, 'profit') + fxMonth.commission - fxMonth.transferFee));
  setText('val-commission-today', formatRupiah(fxDay.commission));
  setText('val-commission-month', formatRupiah(fxMonth.commission));
  setText('val-transfer-fee-month', formatRupiah(fxMonth.transferFee));
  setText('val-total-tx', String(db.transactions.length));
  setText('val-tx-today', String(todayTx.length));

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
// HAPUS TRANSAKSI
// ==========================================

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

function showReceiptModal(html, list) {
  let m = document.getElementById('receipt-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'receipt-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;gap:10px;';
    m.innerHTML = '<iframe id="receipt-frame" style="background:#fff;width:100%;max-width:340px;height:65vh;border:0;border-radius:10px;"></iframe>' +
      '<div style="display:flex;flex-direction:column;gap:8px;width:100%;max-width:340px;">' +
        '<button id="receipt-wa" type="button" style="width:100%;padding:11px;border-radius:10px;border:0;background:#22c55e;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;">' +
          '<i class="fa-brands fa-whatsapp" style="font-size:16px;"></i> Kirim Struk WhatsApp' +
        '</button>' +
        '<div style="display:flex;gap:8px;width:100%;">' +
          '<button id="receipt-close" type="button" style="flex:1;padding:11px;border-radius:10px;border:1px solid #444;background:#222;color:#fff;cursor:pointer;">Tutup</button>' +
          '<button id="receipt-print" type="button" style="flex:1;padding:11px;border-radius:10px;border:0;background:#17A897;color:#fff;font-weight:700;cursor:pointer;">Cetak / PDF</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    m.querySelector('#receipt-close').onclick = () => m.remove();
  }

  const btnWa = m.querySelector('#receipt-wa');
  if (btnWa) {
    btnWa.onclick = () => {
      const ids = (list || []).map((t) => t.id);
      if (window.NxWhatsApp) window.NxWhatsApp.sendReceiptWA(ids);
    };
  }

  const frame = m.querySelector('#receipt-frame');
  frame.srcdoc = html;

  let bt = m.querySelector('#receipt-bt');
  if (bt) bt.remove();
  bt = document.createElement('div');
  bt.id = 'receipt-bt';
  bt.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;max-width:340px;';
  const note = (t) => `<div style="font-size:11px;color:#fbbf24;background:#1f2937;border-radius:8px;padding:8px;line-height:1.4;">${t}</div>`;
  if (!window.NxThermal) {
    bt.innerHTML = note('Modul printer Bluetooth belum termuat. Pastikan file js/thermal-print.js ada di folder js, lalu muat ulang halaman.');
  } else if (!NxThermal.supported()) {
    bt.innerHTML = note('Bluetooth tidak tersedia di browser ini (secure: ' + (window.isSecureContext ? 'ya' : 'tidak') + '). Buka aplikasi lewat Google Chrome, bukan browser lain atau aplikasi di dalam aplikasi.');
  } else {
    bt.innerHTML = '<div style="display:flex;gap:8px;">' +
      '<button id="bt-connect" type="button" style="flex:1;padding:10px;border-radius:10px;border:1px solid #2563eb;background:#111827;color:#93c5fd;font-size:12px;">Hubungkan Printer</button>' +
      '<button id="bt-print" type="button" style="flex:1;padding:10px;border-radius:10px;border:0;background:#2563eb;color:#fff;font-size:12px;font-weight:700;">Cetak Bluetooth</button></div>';
  }
  const btRow = m.querySelector('#receipt-close').parentElement;
  btRow.parentElement.insertBefore(bt, btRow);

  const ctx = { biz: window.nxBiz || {}, br: (window.nxBiz || {}).branch || {}, names: window.nxStaffNames || {}, me: window.nxMe || {} };
  const bc = bt.querySelector('#bt-connect'), bp = bt.querySelector('#bt-print');
  if (bc) bc.onclick = async () => {
    try {
      const name = await NxThermal.connect();
      showNotification('Terhubung ke ' + name, 'success');
    } catch (e) { showNotification(e.message || 'Gagal menghubungkan printer.', 'error'); }
  };
  if (bp) bp.onclick = async () => {
    try {
      if (!NxThermal.isConnected()) { showNotification('Hubungkan printer dulu.', 'error'); return; }
      await NxThermal.printReceipts(list || [], ctx);
      showNotification('Struk dikirim ke printer.', 'success');
    } catch (e) { showNotification(e.message || 'Gagal mencetak.', 'error'); }
  };
  m.querySelector('#receipt-print').onclick = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) {
      showNotification('Gagal membuka dialog cetak. Coba lagi.', 'error');
    }
  };
}

function printReceipts(ids) {
  const list = ids
    .map((id) => appData.transactions.find((t) => String(t.id) === String(id)))
    .filter(Boolean);
  if (list.length === 0) {
    showNotification('Transaksi tidak ditemukan. Muat ulang halaman lalu coba lagi.', 'error');
    return;
  }

  const biz = window.nxBiz || {};
  const br = biz.branch || {};
  const names = window.nxStaffNames || {};
  const me = window.nxMe || {};
  const fmtDT = (d) => new Date(d).toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const totalBayar = list.reduce((s, tx) => s + Number(tx.admin_fee || 0), 0);
  const branchLine = [br.name, br.code ? '(' + br.code + ')' : ''].filter(Boolean).join(' ');

  const row = (label, value, cls) =>
    `<div class="rw"><span class="lb">${escapeHtml(label)}</span><span class="vl ${cls || ''}">${value}</span></div>`;

  const items = list.map((tx) => {
    const kasir = (tx.user_id && names[String(tx.user_id)]) || me.full_name || '-';
    const hutang = tx.status === 'Hutang';
    const acc = (typeof findAccount === 'function' && findAccount(tx.accountId)) || null;
    const isVoucher = tx.type === 'voucher';
    const common = `
    <div class="sep"></div>
    ${row('No. Struk', escapeHtml(String(tx.id).toUpperCase()), 'mono')}
    ${row('Waktu', escapeHtml(fmtDT(tx.date)))}
    ${row('Kasir', escapeHtml(kasir))}`;
    const detail = isVoucher
      ? `${row('Produk', escapeHtml(tx.notes || '-'))}
    ${tx.quantity ? row('Jumlah', String(tx.quantity)) : ''}
    ${row('Harga', formatRupiah(tx.admin_fee))}`
      : `${row('Layanan', escapeHtml(tx.notes || '-'))}
    ${acc ? row('Rekening', escapeHtml(acc.name)) : ''}
    ${row('Nominal', formatRupiah(tx.amount))}
    ${row('Biaya Admin', formatRupiah(Number(tx.admin_fee || 0) - Number(tx.amount || 0)))}`;
    return `${common}
    ${detail}
    <div class="rw"><span class="lb">Status</span><span class="badge ${hutang ? 'bh' : 'bl'}">${hutang ? 'HUTANG / BELUM LUNAS' : 'LUNAS / BERHASIL'}</span></div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Struk ${escapeHtml(biz.name || 'Nexora')}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:'Courier New',Courier,monospace;font-size:12px;width:300px;margin:0 auto;padding:14px 12px;color:#111;background:#fff}
      .head{text-align:center}
      .logo{max-width:80px;max-height:56px;margin-bottom:6px}
      .biz{font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
      .sub{font-size:11px;color:#444;margin-top:3px}
      .sep{border-top:1px dashed #888;margin:8px 0}
      .rw{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin:4px 0;line-height:1.35}
      .lb{color:#555;flex-shrink:0}
      .vl{text-align:right;word-break:break-word}
      .mono{font-weight:700}
      .badge{display:inline-block;padding:3px 8px;border-radius:6px;font-weight:700;font-size:11px;text-align:center;max-width:170px;line-height:1.3}
      .bl{background:#dcfce7;color:#15803d;border:1px solid #86efac}
      .bh{background:#fef3c7;color:#b45309;border:1px solid #fcd34d}
      .total{border-top:2px solid #111;border-bottom:2px solid #111;margin:10px 0 8px;padding:8px 0}
      .total .rw{font-size:15px;font-weight:700;margin:2px 0}
      .foot{text-align:center;margin-top:10px;font-size:11px;color:#333;line-height:1.5}
      .foot .ty{font-weight:700;letter-spacing:2px;margin-bottom:4px}
      .dot{border-top:1px dotted #aaa;margin:10px 0 6px}
      .made{text-align:center;font-size:10px;color:#666}
    </style></head><body>
      <div class="head">
        ${biz.logo ? `<img class="logo" src="${escapeHtml(biz.logo)}" alt="">` : ''}
        <div class="biz">${escapeHtml(biz.name || 'Nexora')}</div>
        ${branchLine ? `<div class="sub">${escapeHtml(branchLine)}</div>` : ''}
        ${br.address ? `<div class="sub">${escapeHtml(br.address)}</div>` : ''}
        ${br.phone ? `<div class="sub">Telp/WA: ${escapeHtml(br.phone)}</div>` : ''}
      </div>
      ${items}
      <div class="sep"></div>
      <div class="total">
        <div class="rw"><span>TOTAL BAYAR</span><span>${formatRupiah(totalBayar)}</span></div>
        ${list.length > 1 ? row('Jumlah struk', String(list.length)) : ''}
      </div>
      <div class="foot">
        <div class="ty">*** TERIMA KASIH ***</div>
        Simpan struk ini sebagai bukti pembayaran yang sah.
      </div>
      <div class="dot"></div>
      <div class="made">Dicetak ${escapeHtml(fmtDT(new Date()))}<br>Dibuat dengan Nexora</div>
    </body></html>`;
  showReceiptModal(html, list);
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
      'Nominal': Number(tx.amount || 0),
      'Biaya Admin': tx.type === 'tarik_setor' ? Number(tx.admin_fee || 0) - Number(tx.amount || 0) : 0,
      'Total': Number(tx.admin_fee || 0),
      'Modal': Number(tx.cost_price !== null && tx.cost_price !== undefined ? tx.cost_price : tx.amount || 0),
      'Keuntungan': Number(tx.profit || 0),
      ...(typeof tarikTunaiExportFields === 'function' ? tarikTunaiExportFields(tx) : {})
    };
  });

  rows.push({
    'ID': 'TOTAL', 'Tanggal': '', 'Layanan': '', 'Aplikasi': '', 'Keterangan': '', 'Status': '',
    'Nominal': rows.reduce((s, r) => s + r['Nominal'], 0),
    'Biaya Admin': rows.reduce((s, r) => s + r['Biaya Admin'], 0),
    'Total': rows.reduce((s, r) => s + r['Total'], 0),
    'Modal': rows.reduce((s, r) => s + r['Modal'], 0),
    'Keuntungan': rows.reduce((s, r) => s + r['Keuntungan'], 0)
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 26 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 40 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 20 }, { wch: 13 }, { wch: 18 }, { wch: 12 }, { wch: 15 }, { wch: 15 }];
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
      const reducedDebts = [];
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

function canDeleteAccounts() {
  const me = window.nxMe;
  if (!me) return false;
  if (me.role === 'super_admin') return true;
  return !(me.perms && me.perms.kelola_saldo === false);
}

function deleteAccountById(accId) {
  const acc = findAccount(accId);
  if (!acc) return;
  showConfirm('Hapus Rekening', `Hapus rekening "${acc.name}"? Hanya bisa jika saldo 0 dan belum pernah dipakai.`, async () => {
    const { error } = await sb.rpc('nx_delete_account', { p_account_id: String(accId) });
    if (error) {
      showNotification(error.message || 'Gagal menghapus rekening.', 'error');
      return;
    }
    appData.accounts = appData.accounts.filter((a) => String(a.id) !== String(accId));
    loadBalancePage();
    showNotification('Rekening dihapus.', 'success');
  });
}

function loadBalancePage() {
  const gridEl = document.getElementById('accounts-grid');
  const selectEl = document.getElementById('adj-account-id');
  if (!gridEl) return;

  if (appData.accounts.length === 0) {
    gridEl.innerHTML = '<p class="empty-state">Belum ada akun. Klik "Tambah Akun" untuk memulai.</p>';
  } else {
    gridEl.innerHTML = appData.accounts.map((acc) => `
      <div class="metric-card glass-card">
        <div class="metric-header" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <span>${escapeHtml(acc.name)}</span>
          ${canDeleteAccounts() ? `<button type="button" class="btn-mini btn-mini-red" onclick="deleteAccountById('${escapeHtml(acc.id)}')" title="Hapus Rekening"><i class="fa-solid fa-trash-can"></i></button>` : ''}
        </div>
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
    const ok = await runOps([['accounts', { balance: newBalance }, 'update', acc.id]], { kind: 'penyesuaian', note: notes });
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

// ==========================================
// POP-UP PROMO PAKET HARGA CORET VIA WHATSAPP
// ==========================================
function openSubscriptionUpgradeModal() {
  const me = window.nxMe || {};
  const biz = window.nxBiz || {};

  const packages = (window.NexoraAuth && window.NexoraAuth.PRICING_PACKAGES && window.NexoraAuth.PRICING_PACKAGES.length)
    ? window.NexoraAuth.PRICING_PACKAGES
    : [
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

  const pkgCards = packages.map((pkg) => `
    <div style="padding:12px 14px; border:1px solid rgba(255,255,255,0.1); border-radius:12px; background:rgba(255,255,255,0.03); display:flex; justify-content:space-between; align-items:center; gap:10px;">
      <div style="min-width:0;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <strong style="font-size:13px; color:#fff;">${pkg.name}</strong>
          ${pkg.badge ? `<span style="font-size:9px; font-weight:700; background:rgba(248,113,113,0.2); color:#f87171; border:1px solid rgba(248,113,113,0.3); padding:1px 6px; border-radius:999px;">${pkg.badge}</span>` : ''}
        </div>
        <span style="font-size:11px; color:#94a3b8; display:block; margin-top:2px;">${pkg.label}</span>
      </div>
      <div style="text-align:right; flex-shrink:0;">
        ${pkg.originalPrice ? `<span style="font-size:11px; color:#64748b; text-decoration:line-through; display:block;">${pkg.originalPrice}</span>` : ''}
        <span style="font-size:15px; font-weight:800; color:#34d399; display:block;">${pkg.price}</span>
        <button type="button" onclick="checkoutViaWA('${pkg.name}', '${pkg.price}')" class="btn-mini btn-mini-green" style="margin-top:4px; padding:6px 12px; border-radius:8px; cursor:pointer;">
          Pilih Promo
        </button>
      </div>
    </div>
  `).join('');

  const modal = createModal('sub-upgrade-modal', `
    <div class="app-modal-head" style="color:#fbbf24;">
      <i class="fa-solid fa-crown" style="font-size:22px;"></i>
      <h3>Promo Perpanjang Layanan</h3>
    </div>
    <p class="app-modal-text" style="margin-bottom:14px;">
      Pilih paket promo langganan untuk menjaga seluruh fitur kasir, mutasi, dan pembukuan tetap aktif:
    </p>
    <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
      ${pkgCards}
    </div>
    <div class="app-modal-actions">
      <button type="button" id="sub-modal-close" class="app-btn-ghost" style="width:100%;">Tutup</button>
    </div>
  `, 'rgba(251,191,36,0.4)');

  modal.querySelector('#sub-modal-close').onclick = () => modal.remove();
}

function checkoutViaWA(pkgName, price) {
  const me = window.nxMe || {};
  const biz = window.nxBiz || {};
  const wa = (window.NexoraAuth && window.NexoraAuth.DEVELOPER_WA) || '6285780243664';
  const bizName = biz.name || me.branch_name || 'Bisnis Saya';
  const username = me.username || me.full_name || '-';

  const msg = `Halo Admin Nexora, saya ingin ambil PROMO perpanjang aplikasi kasir:\n\n` +
    `*Nama Bisnis:* ${bizName}\n` +
    `*Username Akun:* @${username}\n` +
    `*Paket Dipilih:* ${pkgName}\n` +
    `*Harga Promo:* ${price}\n\n` +
    `Mohon info rekening/QRIS pembayarannya ya. Terima kasih!`;

  const url = `https://api.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(msg)}`;
  removeModal('sub-upgrade-modal');
  const win = window.open(url, '_blank');
  if (!win) window.location.href = url;
}

window.openSubscriptionUpgradeModal = openSubscriptionUpgradeModal;
window.checkoutViaWA = checkoutViaWA;