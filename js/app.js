// ==========================================
// SAKAPAY v2.1 - APP ENGINE (SUPABASE CLOUD)
// ==========================================

// 1. Ambil instance Supabase global dari supabase.js
const supabaseClient = window.supabaseClient;

// 2. State Aplikasi Global
let appData = {
  accounts: [],
  transactions: [],
  vouchers: [],
  debts: [],
  expenses: [],
  customers: []
};

let currentUserId = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Cek sesi login cloud dengan pengecekan ganda
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error || !session) {
      console.warn('Sesi tidak ditemukan atau kedaluwarsa, arahkan ke login.');
      window.location.href = 'login.html';
      return;
    }

    currentUserId = session.user.id;

    // Tarik data dari Supabase Cloud
    await fetchCloudData();

    // Inisialisasi Fitur & Form
    initNavigation();
    loadDashboardData();
    initSampleChart();
    setupTarikSetorForm();
    setupPpobForm();
    setupVoucherForm();
    initTarikSetorPage();
    initPpobPage();
    initVoucherPage();
    
    // Paksa tutup sidebar & matikan overlay agar tidak freeze
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');

    switchPage('overview');
  } catch (err) {
    console.error('Error Inisialisasi App:', err);
    // Jangan langsung redirect jika cuma error koneksi sesaat, cukup tampilkan notif
    showNotification('Gagal memuat beberapa data cloud.', 'error');
  }
});

// ==========================================
// FETCH & SAVE DATA CLOUD SUPABASE
// ==========================================

async function fetchCloudData() {
  try {
    const [accRes, txRes, vouchRes, debtRes] = await Promise.all([
      supabaseClient.from('accounts').select('*'),
      supabaseClient.from('transactions').select('*'),
      supabaseClient.from('vouchers').select('*'),
      supabaseClient.from('debts').select('*')
    ]);

    appData.accounts = accRes.data || [];
    appData.transactions = txRes.data || [];
    appData.vouchers = vouchRes.data || [];
    appData.debts = debtRes.data || [];
  } catch (err) {
    console.error('Gagal memuat data cloud:', err);
    showNotification('Gagal menyinkronkan data dari cloud!', 'error');
  }
}

function getAppData() {
  return appData;
}

async function saveCloudData(type, payload, action = 'insert', id = null) {
  try {
    if (action === 'insert') {
      const { error } = await supabaseClient.from(type).insert([payload]);
      if (error) throw error;
    } else if (action === 'update') {
      const { error } = await supabaseClient.from(type).update(payload).eq('id', id);
      if (error) throw error;
    } else if (action === 'delete') {
      const { error } = await supabaseClient.from(type).delete().eq('id', id);
      if (error) throw error;
    }
  } catch (err) {
    console.error(`Gagal menyimpan ke ${type}:`, err);
    showNotification('Gagal memperbarui database cloud!', 'error');
  }
}

// ==========================================
// HELPER UI (TOAST, CONFIRM, PROMPT, FORMAT)
// ==========================================

function showNotification(message, type = 'success') {
  let toast = document.getElementById('custom-toast-container');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'custom-toast-container';
    document.body.appendChild(toast);
  }
  const icon = type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation';
  const color = type === 'success' ? '#34d399' : '#f87171';
  toast.style.borderColor = color;
  toast.innerHTML = `<i class="${icon}" style="color: ${color}; font-size: 20px;"></i><div style="font-size: 13px; font-weight: 500; color: #f8fafc;">${message}</div>`;
  setTimeout(() => toast.classList.add('show'), 10);
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function showConfirm(title, message, onConfirm, isDanger = false) {
    const oldModal = document.getElementById('custom-confirm-modal');
    if (oldModal) oldModal.remove();

    const borderColor = isDanger ? 'rgba(248,113,113,0.3)' : 'rgba(52,211,153,0.3)';
    const iconColor = isDanger ? '#f87171' : '#34d399';
    const iconClass = isDanger ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-question';
    const btnBg = isDanger ? '#f87171' : '#17A897';

    const modal = document.createElement('div');
    modal.id = 'custom-confirm-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center;
        z-index: 99999; padding: 20px; backdrop-filter: blur(4px);
    `;
    modal.innerHTML = `
        <div style="background: #1e293b; border: 1px solid ${borderColor}; padding: 22px; border-radius: 16px; width: 100%; max-width: 340px; color: white; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; color: ${iconColor};">
                <i class="${iconClass}" style="font-size: 20px;"></i>
                <h3 style="font-size: 16px; font-weight: 600; margin: 0;">${title}</h3>
            </div>
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px; line-height: 1.4;">${message}</p>
            <div style="display: flex; gap: 10px;">
                <button id="btn-cancel-custom" style="flex: 1; padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">Batal</button>
                <button id="btn-confirm-custom" style="flex: 1; padding: 10px; background: ${btnBg}; border: none; color: #fff; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">Ya, Lanjutkan</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-cancel-custom').onclick = () => modal.remove();
    document.getElementById('btn-confirm-custom').onclick = () => {
        modal.remove();
        if (typeof onConfirm === 'function') onConfirm();
    };
}

function showPrompt(title, label, defaultValue = '', callback, isNumber = false) {
    const oldModal = document.getElementById('custom-prompt-modal');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'custom-prompt-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center;
        z-index: 99999; padding: 20px; backdrop-filter: blur(4px);
    `;
    modal.innerHTML = `
        <div style="background: #1e293b; border: 1px solid rgba(52,211,153,0.3); padding: 22px; border-radius: 16px; width: 100%; max-width: 360px; color: white; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; color: #34d399;">
                <i class="fa-solid fa-pen-to-square" style="font-size: 20px;"></i>
                <h3 style="font-size: 16px; font-weight: 600; margin: 0;">${title}</h3>
            </div>
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 12px; line-height: 1.4;">${label}</p>
            <input type="text" ${isNumber ? 'inputmode="numeric"' : ''} id="custom-prompt-input" value="${defaultValue}" class="glass-input" style="width: 100%; padding: 10px 12px; margin-bottom: 20px; background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; font-size: 14px;">
            <div style="display: flex; gap: 10px;">
                <button id="btn-cancel-prompt" style="flex: 1; padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">Batal</button>
                <button id="btn-submit-prompt" style="flex: 1; padding: 10px; background: #17A897; border: none; color: #fff; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">Simpan</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const inputEl = document.getElementById('custom-prompt-input');
    inputEl.focus();
    inputEl.select();

    if (isNumber) formatNumberInput(inputEl);

    document.getElementById('btn-cancel-prompt').onclick = () => modal.remove();
    document.getElementById('btn-submit-prompt').onclick = () => {
        const val = isNumber ? inputEl.value.replace(/\./g, '') : inputEl.value.trim();
        modal.remove();
        if (typeof callback === 'function') callback(val);
    };

    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('btn-submit-prompt').click();
    };
}

function formatNumberInput(inputElement) {
  if (!inputElement) return;
  inputElement.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value) {
      e.target.value = parseInt(value, 10).toLocaleString('id-ID');
    } else {
      e.target.value = '';
    }
  });
}

function getCleanNumber(inputElement) {
  if (!inputElement || !inputElement.value) return 0;
  return parseFloat(inputElement.value.replace(/\./g, '')) || 0;
}

// ==========================================
// NAVIGASI PAGE & SIDEBAR
// ==========================================

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('active');
}

function switchPage(pageTarget) {
  const allNavs = document.querySelectorAll('.nav-link, .bottom-nav-item');
  allNavs.forEach(n => n.classList.remove('active'));

  document.querySelectorAll(`[data-page="${pageTarget}"]`).forEach(el => el.classList.add('active'));

  document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
  const targetSection = document.getElementById(`page-${pageTarget}`);
  if (targetSection) targetSection.classList.add('active');

  if (pageTarget === 'transactions') loadTransactionsPage();
  if (pageTarget === 'balances') loadBalancePage();
  if (pageTarget === 'finance') loadFinancePage();
  if (pageTarget === 'customers') loadCustomersPage();
  if (pageTarget === 'debts') loadDebtsPage();
  if (pageTarget === 'tariksetor') initTarikSetorPage();
  if (pageTarget === 'ppob') initPpobPage();
  if (pageTarget === 'voucher') initVoucherPage();

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}

function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link, .bottom-nav-item');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const pageTarget = link.getAttribute('data-page');
      if (!pageTarget) return;
      switchPage(pageTarget);
    });
  });
}

// ==========================================
// MODUL HALAMAN KASIR, TARIK SETOR & PPOB
// ==========================================

function initTarikSetorPage() {
    const db = getAppData();
    const selectAcc = document.getElementById('ts-account');

    if (selectAcc) {
        selectAcc.innerHTML =
            '<option value="">-- Pilih Aplikasi --</option>' +
            db.accounts.map(acc => `
                <option value="${acc.id}">${acc.name} - Saldo: ${formatRupiah(acc.balance)}</option>
            `).join('');
    }

    const paySelect = document.getElementById('ts-pay-method');
    if (paySelect) {
        paySelect.innerHTML =
            '<option value="">-- Pilih Rekening Penerima --</option>' +
            db.accounts.map(acc => `
                <option value="${acc.id}">${acc.name} - Saldo: ${formatRupiah(acc.balance)}</option>
            `).join('') +
            '<option value="Hutang">Hutang (Belum Dibayar)</option>';
    }

    const tzDate = document.getElementById('ts-date');
    if (tzDate && !tzDate.value) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        tzDate.value = now.toISOString().slice(0, 16);
    }

    formatNumberInput(document.getElementById('ts-admin-bank'));
    formatNumberInput(document.getElementById('ts-admin-agen'));
}

function initPpobPage() {
    const db = getAppData();
    const accountSelect = document.getElementById('ppob-account');

    if (accountSelect) {
        accountSelect.innerHTML = '<option value="">-- Pilih Aplikasi --</option>';
        db.accounts.forEach(account => {
            accountSelect.innerHTML += `<option value="${account.id}">${account.name} - Saldo: ${formatRupiah(account.balance)}</option>`;
        });
    }

    const paySelect = document.getElementById('ppob-pay-method');
    if (paySelect) {
        paySelect.innerHTML = '<option value="">-- Pilih Rekening Penerima --</option>';
        db.accounts.forEach(account => {
            paySelect.innerHTML += `<option value="${account.id}">${account.name} - Saldo: ${formatRupiah(account.balance)}</option>`;
        });
        paySelect.innerHTML += `<option value="Hutang">Hutang (Belum Dibayar)</option>`;
    }

    formatNumberInput(document.getElementById('ppob-modal'));
    formatNumberInput(document.getElementById('ppob-jual'));
}

function initVoucherPage() {
  const db = getAppData();
  const selectVouch = document.getElementById('vouch-select-item');
  const selectAcc = document.getElementById('vouch-select-account');
  const paySelect = document.getElementById('vouch-pay-method');
  const listEl = document.getElementById('voucher-master-list');

  if (selectVouch) {
    selectVouch.innerHTML = `<option value="" disabled selected>-- Pilih Produk / Barang --</option>` +
      db.vouchers.map(v => `<option value="${v.id}">${v.name} - Stok: ${v.stock} (${formatRupiah(v.price)})</option>`).join('');
  }

  if (selectAcc) {
    selectAcc.innerHTML = `<option value="" disabled selected>-- Pilih Akun / Sumber Modal (Inject) --</option>` +
      db.accounts.map(acc => `<option value="${acc.id}">${acc.name} (${formatRupiah(acc.balance)})</option>`).join('');
  }

  if (paySelect) {
    paySelect.innerHTML = `<option value="" disabled selected>-- Pilih Akun / Rekening Penerima --</option>` +
      db.accounts.map(acc => `<option value="${acc.id}">${acc.name} (${formatRupiah(acc.balance)})</option>`).join('') +
      `<option value="Hutang">Hutang (Belum Bayar)</option>`;
  }

  if (listEl) {
    if (!db.vouchers || db.vouchers.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Belum ada stok produk / barang.</p>`;
    } else {
      listEl.innerHTML = db.vouchers.map(v => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <div>
            <strong style="font-size: 14px; display: block;">${v.name}</strong>
            <span style="font-size: 11px; color: var(--text-muted);">Modal Saldo: ${formatRupiah(v.modal_saldo)} | Modal Fisik: ${formatRupiah(v.modal_fisik)}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="text-align: right; margin-right: 4px;">
              <span style="font-size: 14px; font-weight: 700; color: #34d399; display: block;">${formatRupiah(v.price)}</span>
              <span style="font-size: 11px; color: ${v.stock > 0 ? '#38bdf8' : '#f87171'};">Stok: ${v.stock} pcs</span>
            </div>
            <button onclick="updateStock('${v.id}')" style="background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; color: #38bdf8; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;" title="Ubah Stok">
              <i class="fa-solid fa-pen-to-square"></i> Stok
            </button>
            <button onclick="deleteProduct('${v.id}')" style="background: rgba(248, 113, 113, 0.2); border: 1px solid #f87171; color: #f87171; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;" title="Hapus Produk">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  const btnAddModal = document.getElementById('btn-add-voucher-modal');
  if (btnAddModal) {
    btnAddModal.onclick = () => {
      showPrompt('Tambah Produk Kasir', 'Nama Produk / Barang:', '', (name) => {
        if (!name) return;
        showPrompt('Modal Saldo', 'Modal Saldo / Inject Server (Rp):', '0', async (modSaldo) => {
          const modal_saldo = parseFloat(modSaldo) || 0;
          showPrompt('Modal Fisik', 'Modal Barang Fisik (Rp):', '0', async (modFisik) => {
            const modal_fisik = parseFloat(modFisik) || 0;
            showPrompt('Harga Jual', 'Harga Jual ke Pelanggan (Rp):', '0', async (prc) => {
              const price = parseFloat(prc) || 0;
              showPrompt('Jumlah Stok', 'Jumlah Stok Awal:', '10', async (stk) => {
                const stock = parseInt(stk) || 0;

                const newVoucher = {
                  id: 'vouch_' + Date.now(),
                  user_id: currentUserId,
                  name,
                  modal_saldo,
                  modal_fisik,
                  price,
                  stock
                };

                db.vouchers.push(newVoucher);
                await saveCloudData('vouchers', newVoucher, 'insert');

                initVoucherPage();
                showNotification('Produk kasir berhasil ditambahkan!', 'success');
              }, true);
            }, true);
          }, true);
        }, true);
      });
    };
  }
}

async function updateStock(vouchId) {
  const db = getAppData();
  const vouch = db.vouchers.find(v => String(v.id) === String(vouchId));
  if (!vouch) return;

  showPrompt('Ubah Stok Barang', `Atur perubahan stok untuk "${vouch.name}":`, '0', async (val) => {
    const perubahan = parseInt(val);
    if (isNaN(perubahan)) return;

    vouch.stock = Number(vouch.stock || 0) + perubahan;
    if (vouch.stock < 0) vouch.stock = 0;

    await saveCloudData('vouchers', { stock: vouch.stock }, 'update', vouch.id);
    initVoucherPage();
    showNotification(`Stok ${vouch.name} berhasil diperbarui!`, 'success');
  });
}

async function deleteProduct(vouchId) {
  const db = getAppData();
  const vouch = db.vouchers.find(v => String(v.id) === String(vouchId));
  if (!vouch) return;

  showConfirm('Hapus Produk', `Yakin ingin menghapus produk "${vouch.name}"?`, async () => {
    db.vouchers = db.vouchers.filter(v => String(v.id) !== String(vouchId));
    await saveCloudData('vouchers', null, 'delete', vouchId);
    initVoucherPage();
    showNotification('Produk berhasil dihapus!', 'success');
  }, true);
}

function setupVoucherForm() {
  const form = document.getElementById('sell-voucher-form');
  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const vouchId = document.getElementById('vouch-select-item').value;
    const accountId = document.getElementById('vouch-select-account').value;
    const qty = parseInt(document.getElementById('vouch-qty').value) || 1;
    const payMethod = document.getElementById('vouch-pay-method').value;
    const customerName = document.getElementById('vouch-customer-name').value.trim();

    if (!vouchId || !accountId || !payMethod) {
      showNotification('Lengkapi semua pilihan form kasir!', 'error');
      return;
    }

    const db = getAppData();
    const vouch = db.vouchers.find(v => String(v.id) === String(vouchId));
    const accInject = db.accounts.find(a => String(a.id) === String(accountId));
    const receiver = payMethod === 'Hutang' ? null : db.accounts.find(a => String(a.id) === String(payMethod));

    if (!vouch || !accInject) {
      showNotification('Produk atau akun sumber tidak ditemukan!', 'error');
      return;
    }

    if (vouch.stock < qty) {
      showNotification(`Stok ${vouch.name} tidak mencukupi! Sisa: ${vouch.stock}`, 'error');
      return;
    }

    const totalModalSaldo = Number(vouch.modal_saldo || 0) * qty;
    const totalModalFisik = Number(vouch.modal_fisik || 0) * qty;
    const totalJual = Number(vouch.price || 0) * qty;
    const totalProfit = totalJual - (totalModalSaldo + totalModalFisik);

    vouch.stock -= qty;
    accInject.balance = (Number(accInject.balance) || 0) - totalModalSaldo;

    if (receiver) {
      receiver.balance = (Number(receiver.balance) || 0) + totalJual;
    }

    const txId = 'tx_' + Date.now();
    const txDate = new Date().toISOString();
    const debtId = payMethod === 'Hutang' ? 'debt_' + Date.now() : null;

    const newTx = {
      id: txId,
      user_id: currentUserId,
      type: 'voucher',
      accountId: String(accInject.id),
      payAccountId: receiver ? String(receiver.id) : 'Hutang',
      voucherId: String(vouch.id),
      quantity: qty,
      debtId,
      notes: `Kasir: ${vouch.name} (${qty} pcs) via ${accInject.name}`,
      amount: totalModalSaldo,
      admin_fee: totalJual,
      cost_price: totalModalSaldo + totalModalFisik,
      profit: totalProfit,
      date: txDate,
      status: debtId ? 'Hutang' : 'Success'
    };

    db.transactions.push(newTx);

    await saveCloudData('vouchers', { stock: vouch.stock }, 'update', vouch.id);
    await saveCloudData('accounts', { balance: accInject.balance }, 'update', accInject.id);
    if (receiver) {
      await saveCloudData('accounts', { balance: receiver.balance }, 'update', receiver.id);
    }
    await saveCloudData('transactions', newTx, 'insert');

    if (debtId) {
      const newDebt = {
        id: debtId,
        user_id: currentUserId,
        transactionId: txId,
        customer: customerName,
        amount: totalJual,
        description: newTx.notes,
        date: txDate
      };
      db.debts.push(newDebt);
      await saveCloudData('debts', newDebt, 'insert');
    }

    loadDashboardData();
    form.reset();
    initVoucherPage();
    showNotification('Transaksi kasir berhasil disimpan!', 'success');
    switchPage('transactions');
  };
}

function setupTarikSetorForm() {
    const form = document.getElementById('tarik-setor-form');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const dateVal = document.getElementById('ts-date').value;
        const accountId = document.getElementById('ts-account').value;
        const service = document.getElementById('ts-service').value;
        const modal = getCleanNumber(document.getElementById('ts-admin-bank'));
        const jual = getCleanNumber(document.getElementById('ts-admin-agen'));
        const payAccountId = document.getElementById('ts-pay-method').value;
        const customer = document.getElementById('ts-customer').value.trim();

        if (!accountId || !payAccountId) {
            showNotification('Pilih akun sumber dan penerima!', 'error');
            return;
        }

        const db = getAppData();
        const source = db.accounts.find(a => String(a.id) === String(accountId));
        const receiver = payAccountId === 'Hutang' ? null : db.accounts.find(a => String(a.id) === String(payAccountId));

        if (!source) {
            showNotification('Akun sumber tidak ditemukan!', 'error');
            return;
        }

        source.balance = Number(source.balance) - modal;
        if (receiver) {
            receiver.balance = Number(receiver.balance) + jual;
        }

        const txId = 'tx_' + Date.now();
        const txDate = new Date(dateVal || Date.now()).toISOString();
        const debtId = payAccountId === 'Hutang' ? 'debt_' + Date.now() : null;

        const newTx = {
            id: txId,
            user_id: currentUserId,
            type: 'tarik_setor',
            accountId: String(source.id),
            payAccountId: receiver ? String(receiver.id) : 'Hutang',
            debtId,
            notes: `${service} (${source.name})`,
            amount: modal,
            admin_fee: jual,
            cost_price: modal,
            profit: jual - modal,
            date: txDate,
            status: debtId ? 'Hutang' : 'Success'
        };

        db.transactions.push(newTx);

        await saveCloudData('accounts', { balance: source.balance }, 'update', source.id);
        if (receiver) {
            await saveCloudData('accounts', { balance: receiver.balance }, 'update', receiver.id);
        }
        await saveCloudData('transactions', newTx, 'insert');

        if (debtId) {
            const newDebt = {
                id: debtId,
                user_id: currentUserId,
                transactionId: txId,
                customer,
                amount: jual,
                description: newTx.notes,
                date: txDate
            };
            db.debts.push(newDebt);
            await saveCloudData('debts', newDebt, 'insert');
        }

        loadDashboardData();
        form.reset();
        initTarikSetorPage();
        showNotification('Transaksi berhasil disimpan ke cloud!', 'success');
        switchPage('transactions');
    };
}

function setupPpobForm() {
    const form = document.getElementById('ppob-form');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const accountId = document.getElementById('ppob-account').value;
        const service = document.getElementById('ppob-service').value;
        const target = document.getElementById('ppob-target').value.trim();
        const modal = getCleanNumber(document.getElementById('ppob-modal'));
        const jual = getCleanNumber(document.getElementById('ppob-jual'));
        const payMethod = document.getElementById('ppob-pay-method').value;
        const customer = document.getElementById('ppob-customer').value.trim();

        const db = getAppData();
        const source = db.accounts.find(a => String(a.id) === String(accountId));
        const receiver = payMethod === 'Hutang' ? null : db.accounts.find(a => String(a.id) === String(payMethod));

        if (!source) return;

        source.balance = Number(source.balance) - modal;
        if (receiver) receiver.balance = Number(receiver.balance) + jual;

        const txId = 'tx_' + Date.now();
        const txDate = new Date().toISOString();
        const debtId = payMethod === 'Hutang' ? 'debt_' + Date.now() : null;

        const newTx = {
            id: txId,
            user_id: currentUserId,
            type: 'ppob',
            accountId: String(source.id),
            payAccountId: receiver ? String(receiver.id) : 'Hutang',
            debtId,
            notes: `PPOB: ${service} (${target})`,
            amount: modal,
            admin_fee: jual,
            cost_price: modal,
            profit: jual - modal,
            date: txDate,
            status: debtId ? 'Hutang' : 'Success'
        };

        db.transactions.push(newTx);

        await saveCloudData('accounts', { balance: source.balance }, 'update', source.id);
        if (receiver) await saveCloudData('accounts', { balance: receiver.balance }, 'update', receiver.id);
        await saveCloudData('transactions', newTx, 'insert');

        if (debtId) {
            const newDebt = {
                id: debtId,
                user_id: currentUserId,
                transactionId: txId,
                customer,
                amount: jual,
                description: newTx.notes,
                date: txDate
            };
            db.debts.push(newDebt);
            await saveCloudData('debts', newDebt, 'insert');
        }

        loadDashboardData();
        form.reset();
        initPpobPage();
        showNotification('Transaksi PPOB disimpan ke cloud!', 'success');
        switchPage('transactions');
    };
}

// ==========================================
// DASHBOARD & HALAMAN REKAPITULASI
// ==========================================

function loadDebtsPage() {
  const db = getAppData();
  const listEl = document.getElementById('debt-list');
  if (!listEl) return;

  if (!db.debts || db.debts.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Belum ada catatan hutang.</p>`;
    return;
  }

  listEl.innerHTML = db.debts.map(d => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
      <div>
        <strong style="font-size: 14px; display: block; color: #f87171;">${d.customer}</strong>
        <span style="font-size: 12px; display: block;">${d.description}</span>
        <span style="font-size: 11px; color: var(--text-muted);">${new Date(d.date).toLocaleString('id-ID')}</span>
      </div>
      <div style="text-align: right; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 14px; font-weight: 600; color: #f87171;">${formatRupiah(d.amount)}</span>
        <button onclick="payDebt('${d.id}')" style="background: rgba(52, 211, 153, 0.2); border: 1px solid #34d399; color: #34d399; cursor: pointer; padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;">Lunas</button>
      </div>
    </div>
  `).join('');
}

function payDebt(debtId) {
    const db = getAppData();
    const debt = db.debts.find(d => d.id === debtId);
    if (!debt) return;

    showConfirm('Pelunasan Hutang', `Lunasi hutang ${debt.customer} sebesar ${formatRupiah(debt.amount)}?`, async () => {
        db.debts = db.debts.filter(d => String(d.id) !== String(debtId));
        await saveCloudData('debts', null, 'delete', debtId);
        loadDebtsPage();
        loadDashboardData();
        showNotification('Hutang berhasil dilunasi!', 'success');
    }, false);
}

function loadDashboardData() {
  const db = getAppData();
  const totalSaldo = db.accounts.reduce((sum, acc) => sum + Number(acc.balance), 0);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const todayTx = db.transactions.filter(tx => tx.date && tx.date.startsWith(todayStr));
  const monthTx = db.transactions.filter(tx => tx.date && tx.date.startsWith(currentMonthStr));

  const omzetToday = todayTx.reduce((sum, tx) => sum + Number(tx.admin_fee), 0);
  const profitToday = todayTx.reduce((sum, tx) => sum + Number(tx.profit), 0);
  const omzetMonth = monthTx.reduce((sum, tx) => sum + Number(tx.admin_fee), 0);
  const profitMonth = monthTx.reduce((sum, tx) => sum + Number(tx.profit), 0);

  if (document.getElementById('val-total-modal')) document.getElementById('val-total-modal').innerText = formatRupiah(totalSaldo);
  if (document.getElementById('val-omzet-today')) document.getElementById('val-omzet-today').innerText = formatRupiah(omzetToday);
  if (document.getElementById('val-profit-today')) document.getElementById('val-profit-today').innerText = formatRupiah(profitToday);
  if (document.getElementById('val-omzet-month')) document.getElementById('val-omzet-month').innerText = formatRupiah(omzetMonth);
  if (document.getElementById('val-profit-month')) document.getElementById('val-profit-month').innerText = formatRupiah(profitMonth);
  if (document.getElementById('val-total-tx')) document.getElementById('val-total-tx').innerText = db.transactions.length;

  renderRecentTransactions(db.transactions);
}

function renderRecentTransactions(transactions) {
  const listEl = document.getElementById('recent-tx-list');
  if (!listEl) return;
  if (transactions.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Belum ada transaksi.</p>`;
    return;
  }
  const recent = [...transactions].reverse().slice(0, 5);
  listEl.innerHTML = recent.map(tx => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
      <div>
        <strong style="font-size: 13px; display: block;">${tx.notes}</strong>
        <span style="font-size: 11px; color: var(--text-muted);">${new Date(tx.date).toLocaleTimeString('id-ID')}</span>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 13px; font-weight: 600; color: #34d399;">+${formatRupiah(tx.admin_fee)}</span>
      </div>
    </div>
  `).join('');
}

function loadTransactionsPage() {
  const db = getAppData();
  renderFullTransactionsList(db.transactions);
}

function renderFullTransactionsList(transactions) {
  const tbodyEl = document.getElementById('full-tx-table-body');
  const countEl = document.getElementById('tx-count-label');
  if (!tbodyEl) return;

  if (countEl) countEl.innerText = `Menampilkan total ${transactions.length} data`;
  if (!transactions || transactions.length === 0) {
    tbodyEl.innerHTML = `<tr><td colspan="10" class="empty-state" style="text-align: center; padding: 24px;">Belum ada transaksi tercatat.</td></tr>`;
    return;
  }

  tbodyEl.innerHTML = [...transactions].reverse().map(tx => `
    <tr>
      <td style="text-align: center;"><input type="checkbox" class="tx-checkbox" value="${tx.id}"></td>
      <td><strong style="color: #38bdf8; font-size: 11px;">${tx.id.toUpperCase()}</strong></td>
      <td>SakaCloud</td>
      <td>${tx.notes}</td>
      <td style="text-align: right; font-weight: 600; color: #34d399;">${formatRupiah(tx.admin_fee)}</td>
      <td style="text-align: right; color: var(--text-muted);">${formatRupiah(tx.cost_price || tx.amount)}</td>
      <td style="text-align: right; font-weight: 600; color: #34d399;">${formatRupiah(tx.profit)}</td>
      <td>
        <button class="btn-delete" onclick="deleteTransaction('${tx.id}')" style="background: rgba(248,113,113,0.2); border: 1px solid #f87171; color: #f87171; padding: 4px 8px; border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    </tr>
  `).join('');
}

async function deleteTransaction(txId) {
    showConfirm('Konfirmasi Hapus', 'Hapus transaksi ini dari cloud?', async () => {
        const db = getAppData();
        db.transactions = db.transactions.filter(item => String(item.id) !== String(txId));
        await saveCloudData('transactions', null, 'delete', txId);

        loadDashboardData();
        loadTransactionsPage();
        showNotification('Transaksi berhasil dihapus dari cloud!', 'success');
    }, true);
}

function loadBalancePage() {
  const db = getAppData();
  const gridEl = document.getElementById('accounts-grid');
  const selectEl = document.getElementById('adj-account-id');
  if (!gridEl || !selectEl) return;

  gridEl.innerHTML = db.accounts.map(acc => `
    <div class="metric-card glass-card">
      <div class="metric-header">
        <span>${acc.name}</span>
      </div>
      <h3 class="metric-value">${formatRupiah(acc.balance)}</h3>
    </div>
  `).join('');

  selectEl.innerHTML = db.accounts.map(acc => `<option value="${acc.id}">${acc.name} (${formatRupiah(acc.balance)})</option>`).join('');
}

function initSampleChart() {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
      datasets: [{ label: 'Omzet', data: [150000, 230000, 180000, 310000, 290000, 420000, 380000], borderColor: '#17A897', fill: true }]
    }
  });
}
