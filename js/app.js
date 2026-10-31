document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  loadDashboardData();
  initSampleChart();
  setupTarikSetorForm();
  setupPpobForm();
  setupVoucherForm();
  initTarikSetorPage();
  initPpobPage();
  initVoucherPage();
  switchPage('overview');
});

// Helper: Notifikasi Cantik (Toast)
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

// Helper: Universal Modal Konfirmasi (Pengganti confirm())
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
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 20px; line-height: 1.4;">
                ${message}
            </p>
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

// Helper: Universal Modal Input (Pengganti prompt())
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
            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 12px; line-height: 1.4;">
                ${label}
            </p>
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

    if (isNumber) {
        formatNumberInput(inputEl);
    }

    document.getElementById('btn-cancel-prompt').onclick = () => modal.remove();
    document.getElementById('btn-submit-prompt').onclick = () => {
        const val = isNumber ? inputEl.value.replace(/\./g, '') : inputEl.value.trim();
        modal.remove();
        if (typeof callback === 'function') callback(val);
    };

    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btn-submit-prompt').click();
        }
    };
}

// Helper: Format input menjadi titik ribuan otomatis
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

// Helper: Ambil angka murni dari string ber-titik
function getCleanNumber(inputElement) {
  if (!inputElement || !inputElement.value) return 0;
  return parseFloat(inputElement.value.replace(/\./g, '')) || 0;
}

// Fungsi Buka / Tutup Sidebar (Hamburger)
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

function initTarikSetorPage() {
    const db = getAppData();
    const selectAcc = document.getElementById('ts-account');

    if (selectAcc) {
        selectAcc.innerHTML =
            '<option value="">-- Pilih Aplikasi --</option>' +
            db.accounts.map(acc => `
                <option value="${acc.id}">
                    ${acc.name} - Saldo: ${formatRupiah(acc.balance)}
                </option>
            `).join('');
    }

    const paySelect = document.getElementById('ts-pay-method');
    if (paySelect) {
        paySelect.innerHTML =
            '<option value="">-- Pilih Rekening Penerima --</option>' +
            db.accounts.map(acc => `
                <option value="${acc.id}">
                    ${acc.name} - Saldo: ${formatRupiah(acc.balance)}
                </option>
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
            accountSelect.innerHTML += `
                <option value="${account.id}">
                    ${account.name} - Saldo: ${formatRupiah(account.balance)}
                </option>
            `;
        });
    }

    const paySelect = document.getElementById('ppob-pay-method');
    if (paySelect) {
        paySelect.innerHTML = '<option value="">-- Pilih Rekening Penerima --</option>';
        db.accounts.forEach(account => {
            paySelect.innerHTML += `
                <option value="${account.id}">
                    ${account.name} - Saldo: ${formatRupiah(account.balance)}
                </option>
            `;
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
            <button onclick="updateStock('${v.id}')" style="background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; color: #38bdf8; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600;" title="Ubah Stok (+ / -)">
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
      showPrompt('Tambah Produk Kasir', 'Nama Produk / Barang (Contoh: Voucher Axis / Charger Vivan):', '', (name) => {
        if (!name) return;
        showPrompt('Modal Saldo', 'Modal Saldo / Inject Server (Rp):', '0', (modSaldo) => {
          const modal_saldo = parseFloat(modSaldo) || 0;
          showPrompt('Modal Fisik', 'Modal Barang Fisik / Voucher Kosong (Rp):', '0', (modFisik) => {
            const modal_fisik = parseFloat(modFisik) || 0;
            showPrompt('Harga Jual', 'Harga Jual ke Pelanggan (Rp):', '0', (prc) => {
              const price = parseFloat(prc) || 0;
              showPrompt('Jumlah Stok', 'Jumlah Stok Awal:', '10', (stk) => {
                const stock = parseInt(stk) || 0;

                db.vouchers.push({
                  id: 'vouch_' + Date.now(),
                  name,
                  modal_saldo,
                  modal_fisik,
                  price,
                  stock
                });

                saveAppData(db);
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

function updateStock(vouchId) {
  const db = getAppData();
  const vouch = db.vouchers.find(v => String(v.id) === String(vouchId));
  if (!vouch) return;

  showPrompt('Ubah Stok Barang', `Atur perubahan stok untuk "${vouch.name}".\n(Gunakan tanda minus "-" untuk mengurangi stok, contoh: -2 atau 5):`, '0', (val) => {
    const perubahan = parseInt(val);
    if (isNaN(perubahan)) return;

    vouch.stock = Number(vouch.stock || 0) + perubahan;
    if (vouch.stock < 0) vouch.stock = 0; // Mencegah stok minus

    saveAppData(db);
    initVoucherPage();
    showNotification(`Stok ${vouch.name} berhasil diperbarui!`, 'success');
  });
}

function deleteProduct(vouchId) {
  const db = getAppData();
  const vouch = db.vouchers.find(v => String(v.id) === String(vouchId));
  if (!vouch) return;

  showConfirm('Hapus Produk', `Yakin ingin menghapus produk "${vouch.name}" dari daftar kasir?`, () => {
    db.vouchers = db.vouchers.filter(v => String(v.id) !== String(vouchId));
    saveAppData(db);
    initVoucherPage();
    showNotification('Produk berhasil dihapus!', 'success');
  }, true);
}

function setupVoucherForm() {
  const form = document.getElementById('sell-voucher-form');
  if (!form) return;

  form.onsubmit = (e) => {
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

    if (payMethod === 'Hutang' && !customerName) {
      showNotification('Nama pelanggan wajib diisi jika transaksi berstatus Hutang!', 'error');
      return;
    }

    const db = getAppData();
    const vouch = db.vouchers.find(v => String(v.id) === String(vouchId));
    const accInject = db.accounts.find(a => String(a.id) === String(accountId));
    const receiver = payMethod === 'Hutang' ? null : db.accounts.find(a => String(a.id) === String(payMethod));

    if (!vouch || !accInject) {
      showNotification('Produk atau akun sumber inject tidak ditemukan!', 'error');
      return;
    }

    if (payMethod !== 'Hutang' && !receiver) {
      showNotification('Akun penerima pembayaran tidak ditemukan!', 'error');
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

    // Cek kecukupan saldo akun inject
    if ((Number(accInject.balance) || 0) < totalModalSaldo) {
      showNotification('Saldo akun inject tidak mencukupi untuk modal server!', 'error');
      return;
    }

    // Cari akun Kas Tunai untuk modal fisik
    let cashAccount = db.accounts.find(a => a.name.toLowerCase().includes('kas') || a.name.toLowerCase().includes('tunai'));
    if (!cashAccount && db.accounts.length > 0) {
      cashAccount = db.accounts[0]; 
    }

    if (cashAccount && (Number(cashAccount.balance) || 0) < totalModalFisik) {
      showNotification('Saldo Kas Tunai tidak mencukupi untuk modal fisik voucher!', 'error');
      return;
    }

    // 1. Kurangi stok barang
    vouch.stock -= qty;

    // 2. Potong saldo modal server dari akun inject yang dipilih
    accInject.balance = (Number(accInject.balance) || 0) - totalModalSaldo;

    // 3. Potong modal fisik dari kas tunai
    if (cashAccount) {
      cashAccount.balance = (Number(cashAccount.balance) || 0) - totalModalFisik;
    }

    // 4. Masukkan uang penjualan ke akun penerima pembayaran
    if (receiver) {
      receiver.balance = (Number(receiver.balance) || 0) + totalJual;
    }

    const txId = 'tx_' + Date.now();
    const txDate = new Date().toISOString();
    const debtId = payMethod === 'Hutang' ? 'debt_' + Date.now() : null;

    const newTx = {
      id: txId,
      type: 'voucher',
      accountId: String(accInject.id),
      cashAccountId: cashAccount ? String(cashAccount.id) : null,
      payAccountId: receiver ? String(receiver.id) : 'Hutang',
      voucherId: String(vouch.id),
      quantity: qty,
      debtId,
      notes: `Kasir: ${vouch.name} (${qty} pcs) via ${accInject.name} [Bayar: ${receiver ? receiver.name : 'Hutang'}]`,
      amount: totalModalSaldo,
      modal_fisik: totalModalFisik,
      admin_fee: totalJual,
      cost_price: totalModalSaldo + totalModalFisik,
      profit: totalProfit,
      date: txDate,
      status: debtId ? 'Hutang' : 'Success'
    };

    db.transactions.push(newTx);

    if (debtId) {
      if (!Array.isArray(db.debts)) db.debts = [];
      db.debts.push({
        id: debtId,
        transactionId: txId,
        customer: customerName,
        amount: totalJual,
        description: newTx.notes,
        date: txDate
      });
    }

    saveAppData(db);
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

    form.onsubmit = (e) => {
        e.preventDefault();

        const dateVal = document.getElementById('ts-date').value;
        const accountId = document.getElementById('ts-account').value;
        const service = document.getElementById('ts-service').value;
        const modal = getCleanNumber(document.getElementById('ts-admin-bank'));
        const jual = getCleanNumber(document.getElementById('ts-admin-agen'));
        const payAccountId = document.getElementById('ts-pay-method').value;
        const customer = document.getElementById('ts-customer').value.trim();
        const notes = document.getElementById('ts-notes').value || service;

        if (!accountId || !payAccountId) {
            showNotification('Pilih akun sumber dan penerima!', 'error');
            return;
        }

        if (modal <= 0 || jual < modal) {
            showNotification('Periksa modal dan harga jual!', 'error');
            return;
        }

        if (payAccountId === 'Hutang' && !customer) {
            showNotification('Nama pelanggan wajib diisi!', 'error');
            return;
        }

        const db = getAppData();
        const source = db.accounts.find(a => String(a.id) === String(accountId));
        const receiver = payAccountId === 'Hutang' ? null : db.accounts.find(a => String(a.id) === String(payAccountId));

        if (!source) {
            showNotification('Akun sumber tidak ditemukan!', 'error');
            return;
        }

        if (payAccountId !== 'Hutang' && !receiver) {
            showNotification('Akun penerima tidak ditemukan!', 'error');
            return;
        }

        const sourceBalance = Number(source.balance) || 0;
        if (sourceBalance < modal) {
            showNotification('Saldo sumber tidak mencukupi!', 'error');
            return;
        }

        const txId = 'tx_' + Date.now();
        const txDate = new Date(dateVal || Date.now()).toISOString();
        const debtId = payAccountId === 'Hutang' ? 'debt_' + Date.now() : null;

        const newTx = {
            id: txId,
            type: 'tarik_setor',
            accountId: String(source.id),
            payAccountId: receiver ? String(receiver.id) : 'Hutang',
            debtId,
            notes: `${service} (${source.name}) - ${notes}`,
            amount: modal,
            admin_fee: jual,
            cost_price: modal,
            profit: jual - modal,
            date: txDate,
            status: debtId ? 'Hutang' : 'Success'
        };

        source.balance = sourceBalance - modal;

        if (receiver) {
            receiver.balance = (Number(receiver.balance) || 0) + jual;
        }

        if (debtId) {
            if (!Array.isArray(db.debts)) db.debts = [];
            db.debts.push({
                id: debtId,
                transactionId: txId,
                customer,
                amount: jual,
                description: newTx.notes,
                date: txDate
            });
        }

        db.transactions.push(newTx);
        saveAppData(db);

        loadDashboardData();
        form.reset();
        initTarikSetorPage();

        showNotification('Transaksi berhasil disimpan!', 'success');
        switchPage('transactions');
    };
}

function setupPpobForm() {
    const form = document.getElementById('ppob-form');
    if (!form) return;

    form.onsubmit = (e) => {
        e.preventDefault();

        const accountId = document.getElementById('ppob-account').value;
        const service = document.getElementById('ppob-service').value;
        const target = document.getElementById('ppob-target').value.trim();
        const modal = getCleanNumber(document.getElementById('ppob-modal'));
        const jual = getCleanNumber(document.getElementById('ppob-jual'));
        const payMethod = document.getElementById('ppob-pay-method').value;
        const customer = document.getElementById('ppob-customer').value.trim();

        if (!accountId || !payMethod) {
            showNotification('Pilih akun sumber dan penerima!', 'error');
            return;
        }

        if (modal <= 0 || jual < modal) {
            showNotification('Periksa modal dan harga jual!', 'error');
            return;
        }

        if (payMethod === 'Hutang' && !customer) {
            showNotification('Nama pelanggan wajib diisi!', 'error');
            return;
        }

        const db = getAppData();
        const source = db.accounts.find(a => String(a.id) === String(accountId));
        const receiver = payMethod === 'Hutang' ? null : db.accounts.find(a => String(a.id) === String(payMethod));

        if (!source) {
            showNotification('Akun sumber tidak ditemukan!', 'error');
            return;
        }

        if (payMethod !== 'Hutang' && !receiver) {
            showNotification('Akun penerima tidak ditemukan!', 'error');
            return;
        }

        const sourceBalance = Number(source.balance) || 0;
        if (sourceBalance < modal) {
            showNotification('Saldo sumber tidak mencukupi!', 'error');
            return;
        }

        const txId = 'tx_' + Date.now();
        const txDate = new Date().toISOString();
        const debtId = payMethod === 'Hutang' ? 'debt_' + Date.now() : null;

        const newTx = {
            id: txId,
            type: 'ppob',
            accountId: String(source.id),
            payAccountId: receiver ? String(receiver.id) : 'Hutang',
            debtId,
            notes: `PPOB: ${service} (${target}) via ${source.name}`,
            amount: modal,
            admin_fee: jual,
            cost_price: modal,
            profit: jual - modal,
            date: txDate,
            status: debtId ? 'Hutang' : 'Success'
        };

        source.balance = sourceBalance - modal;

        if (receiver) {
            receiver.balance = (Number(receiver.balance) || 0) + jual;
        }

        if (debtId) {
            if (!Array.isArray(db.debts)) db.debts = [];
            db.debts.push({
                id: debtId,
                transactionId: txId,
                customer,
                amount: jual,
                description: newTx.notes,
                date: txDate
            });
        }

        db.transactions.push(newTx);
        saveAppData(db);

        loadDashboardData();
        form.reset();
        initPpobPage();

        showNotification('Transaksi PPOB berhasil disimpan!', 'success');
        switchPage('transactions');
    };
}

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
        <div>
          <span style="font-size: 14px; font-weight: 600; color: #f87171; display: block;">${formatRupiah(d.amount)}</span>
        </div>
        <button onclick="payDebt('${d.id}')" style="background: rgba(52, 211, 153, 0.2); border: 1px solid #34d399; color: #34d399; cursor: pointer; padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;" title="Lunasi">
          Lunas
        </button>
      </div>
    </div>
  `).join('');
}

function payDebt(debtId) {
    const db = getAppData();
    const debt = db.debts.find(d => d.id === debtId);

    if (!debt) return;

    const oldModal = document.getElementById('pay-debt-modal');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'pay-debt-modal';
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 20px;
    `;

    modal.innerHTML = `
        <div style="
            background: #1e293b;
            padding: 22px;
            border-radius: 16px;
            width: 100%;
            max-width: 380px;
            color: white;
        ">
            <h3 style="margin-bottom: 8px;">Pelunasan Hutang</h3>

            <p style="font-size: 13px; color: #94a3b8; margin-bottom: 16px;">
                ${debt.customer}<br>
                Nominal: ${formatRupiah(debt.amount)}
            </p>

            <label style="display:block; margin-bottom:8px;">
                Pilih Rekening Penerima
            </label>

            <select id="debt-pay-account" class="glass-input"
                style="width:100%; margin-bottom:18px;">
                <option value="">-- Pilih Rekening --</option>
                ${db.accounts.map(acc => `
                    <option value="${acc.id}">${acc.name}</option>
                `).join('')}
            </select>

            <div style="display:flex; gap:10px;">
                <button id="cancel-debt-pay" style="
                    flex:1; padding:11px; border:0;
                    border-radius:8px; cursor:pointer;
                ">Batal</button>

                <button id="confirm-debt-pay" style="
                    flex:1; padding:11px; border:0;
                    border-radius:8px; background:#17A897;
                    color:white; cursor:pointer;
                ">Konfirmasi</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('cancel-debt-pay').onclick = () => {
        modal.remove();
    };

    document.getElementById('confirm-debt-pay').onclick = () => {
        const accountId = document.getElementById('debt-pay-account').value;
        const account = db.accounts.find(a => String(a.id) === String(accountId));

        if (!account) {
            showNotification('Pilih rekening terlebih dahulu!', 'error');
            return;
        }

        modal.remove();

        showConfirm('Konfirmasi Pelunasan', `Lunasi hutang ${debt.customer} sebesar ${formatRupiah(debt.amount)} melalui ${account.name}?`, () => {
            account.balance = (Number(account.balance) || 0) + Number(debt.amount);
            db.debts = db.debts.filter(d => String(d.id) !== String(debtId));

            saveAppData(db);
            loadDebtsPage();
            loadDashboardData();

            showNotification('Hutang berhasil dilunasi!', 'success');
        }, false);
    };
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

  const totalModalEl = document.getElementById('val-total-modal');
  const omzetTodayEl = document.getElementById('val-omzet-today');
  const profitTodayEl = document.getElementById('val-profit-today');
  const omzetMonthEl = document.getElementById('val-omzet-month');
  const profitMonthEl = document.getElementById('val-profit-month');
  const totalTxEl = document.getElementById('val-total-tx');

  if (totalModalEl) totalModalEl.innerText = formatRupiah(totalSaldo);
  if (omzetTodayEl) omzetTodayEl.innerText = formatRupiah(omzetToday);
  if (profitTodayEl) profitTodayEl.innerText = formatRupiah(profitToday);
  if (omzetMonthEl) omzetMonthEl.innerText = formatRupiah(omzetMonth);
  if (profitMonthEl) profitMonthEl.innerText = formatRupiah(profitMonth);
  if (totalTxEl) totalTxEl.innerText = db.transactions.length;

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
        <span style="font-size: 10px; display: block; color: var(--text-muted);">Profit: ${formatRupiah(tx.profit)}</span>
      </div>
    </div>
  `).join('');
}

function loadTransactionsPage() {
  const db = getAppData();
  renderFullTransactionsList(db.transactions);
  setupTxPageListeners();
  setupExcelExportListeners();
}

function renderFullTransactionsList(transactions) {
  const tbodyEl = document.getElementById('full-tx-table-body');
  const countEl = document.getElementById('tx-count-label');
  if (!tbodyEl) return;

  const totalData = transactions ? transactions.length : 0;
  if (countEl) countEl.innerText = `Menampilkan total ${totalData} data`;

  if (!transactions || totalData === 0) {
    tbodyEl.innerHTML = `<tr><td colspan="10" class="empty-state" style="text-align: center; padding: 24px;">Belum ada transaksi tercatat.</td></tr>`;
    return;
  }

  const sortedTx = [...transactions].reverse();
  tbodyEl.innerHTML = sortedTx.map((tx, idx) => {
    const txDate = new Date(tx.date);
    const dateFormatted = `${String(txDate.getDate()).padStart(2, '0')}/${String(txDate.getMonth() + 1).padStart(2, '0')}/${txDate.getFullYear()} ${String(txDate.getHours()).padStart(2, '0')}:${String(txDate.getMinutes()).padStart(2, '0')}`;
    
    const jual = Number(tx.admin_fee) || 0;
    const modal = Number(tx.cost_price) || Number(tx.amount) || 0;
    const profit = Number(tx.profit) || 0;

    let aplikasi = "SakaPay";
    if (tx.notes && tx.notes.includes("via")) {
      aplikasi = tx.notes.split("via")[1].split("[")[0].trim();
    }
    const layanan = tx.notes ? tx.notes.split("(")[0].trim() : "-";
    const keterangan = tx.status === 'Hutang' ? 'HUTANG (Belum Lunas)' : '-';

    return `
      <tr>
        <td style="text-align: center;">
          <input type="checkbox" class="tx-checkbox" value="${tx.id}" style="accent-color: var(--primary-color); cursor: pointer;">
        </td>
        <td>
          <strong style="color: #38bdf8; display: block; font-size: 11px;">${tx.id.toUpperCase()}</strong>
          <span style="font-size: 10px; color: var(--text-muted);">${dateFormatted}</span>
        </td>
        <td>
          <span style="display: block; font-weight: 600;">Saka</span>
          <span style="font-size: 10px; color: var(--text-muted);">Local Device</span>
        </td>
        <td>${aplikasi}</td>
        <td>${layanan}</td>
        <td><span style="color: ${tx.status === 'Hutang' ? '#f87171' : 'inherit'};">${keterangan}</span></td>
        <td style="text-align: right; font-weight: 600; color: #34d399;">${formatRupiah(jual)}</td>
        <td style="text-align: right; color: var(--text-muted);">${formatRupiah(modal)}</td>
        <td style="text-align: right; font-weight: 600; color: #34d399;">${formatRupiah(profit)}</td>
        <td>
          <div class="tx-action-btns">
            <button class="btn-receipt" onclick="printReceipt('${tx.id}')" title="Cetak Struk">
              <i class="fa-solid fa-receipt"></i>
            </button>
            <button class="btn-delete" onclick="deleteTransaction('${tx.id}')" title="Hapus">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function setupTxPageListeners() {
  const searchInput = document.getElementById('search-tx-input');
  if (searchInput) {
    searchInput.oninput = (e) => {
      const keyword = e.target.value.toLowerCase();
      const db = getAppData();
      const filtered = db.transactions.filter(tx => 
        tx.notes.toLowerCase().includes(keyword) || tx.id.toLowerCase().includes(keyword)
      );
      renderFullTransactionsList(filtered);
    };
  }
}

function setupExcelExportListeners() {
  const btnDaily = document.getElementById('btn-export-daily');
  const btnMonthly = document.getElementById('btn-export-monthly');

  if (btnDaily) {
    btnDaily.onclick = () => exportTransactionsToExcel('daily');
  }
  if (btnMonthly) {
    btnMonthly.onclick = () => exportTransactionsToExcel('monthly');
  }
}

function exportTransactionsToExcel(type) {
  const db = getAppData();
  const now = new Date();
  let filteredTx = [];
  let periodeLabel = '';

  if (type === 'daily') {
    const todayStr = now.toISOString().split('T')[0];
    filteredTx = db.transactions.filter(tx => tx.date && tx.date.startsWith(todayStr));
    periodeLabel = `Periode : ${now.toLocaleDateString('id-ID')} s/d ${now.toLocaleDateString('id-ID')}`;
  } else {
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    filteredTx = db.transactions.filter(tx => tx.date && tx.date.startsWith(currentMonthStr));
    periodeLabel = `Periode Bulan : ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`;
  }

  if (filteredTx.length === 0) {
    showNotification('Tidak ada data transaksi pada periode ini.', 'error');
    return;
  }

  const excelRows = [
    ["RIWAYAT TRANSAKSI"],
    [periodeLabel],
    [`Generated : ${now.toLocaleString('id-ID')}`],
    [],
    ["No", "Tanggal", "Karyawan", "Aplikasi", "Layanan", "Keterangan", "Jual", "Modal", "Keuntungan"]
  ];

  let totalJual = 0;
  let totalModal = 0;
  let totalProfit = 0;

  filteredTx.forEach((tx, index) => {
    const txDate = new Date(tx.date);
    const dateFormatted = `${String(txDate.getDate()).padStart(2, '0')}/${String(txDate.getMonth() + 1).padStart(2, '0')}/${txDate.getFullYear()} ${String(txDate.getHours()).padStart(2, '0')}:${String(txDate.getMinutes()).padStart(2, '0')}`;
    
    const jual = Number(tx.admin_fee) || 0;
    const modal = Number(tx.cost_price) || Number(tx.amount) || 0;
    const profit = Number(tx.profit) || 0;

    totalJual += jual;
    totalModal += modal;
    totalProfit += profit;

    excelRows.push([
      index + 1,
      dateFormatted,
      "Saka",
      tx.notes.includes("via") ? tx.notes.split("via")[1].split("[")[0].trim() : "SakaPay",
      tx.notes.split("(")[0].trim(),
      "-",
      jual,
      modal,
      profit
    ]);
  });

  excelRows.push(["", "", "", "", "", "TOTAL", totalJual, totalModal, totalProfit]);

  const ws = XLSX.utils.aoa_to_sheet(excelRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Riwayat Transaksi");

  const filename = `SakaPay_Riwayat_${type === 'daily' ? 'Harian' : 'Bulanan'}_${now.toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename);
  showNotification('File Excel berhasil diexport!', 'success');
}

function deleteTransaction(txId) {
    showConfirm('Konfirmasi Hapus', 'Hapus transaksi ini dan kembalikan seluruh saldo & stok ke awal?', () => {
        const db = getAppData();
        const tx = db.transactions.find(item => String(item.id) === String(txId));

        if (!tx) {
            showNotification('Transaksi tidak ditemukan!', 'error');
            return;
        }

        // 1. Kembalikan modal saldo server ke akun inject asal
        const sourceInject = db.accounts.find(a => String(a.id) === String(tx.accountId));
        if (sourceInject) {
            const modalSaldo = Number(tx.amount || 0);
            sourceInject.balance = (Number(sourceInject.balance) || 0) + modalSaldo;
        }

        // 2. Kembalikan modal fisik ke akun Kas Tunai
        if (tx.modal_fisik && tx.cashAccountId) {
            const cashAcc = db.accounts.find(a => String(a.id) === String(tx.cashAccountId));
            if (cashAcc) {
                cashAcc.balance = (Number(cashAcc.balance) || 0) + Number(tx.modal_fisik);
            }
        }

        // 3. Tarik kembali uang penjualan dari akun penerima
        if (tx.payAccountId && tx.payAccountId !== 'Hutang' && tx.payAccountId !== 'Cash') {
            const receiver = db.accounts.find(a => String(a.id) === String(tx.payAccountId));
            if (receiver) {
                const jual = Number(tx.admin_fee || 0);
                receiver.balance = (Number(receiver.balance) || 0) - jual;
            }
        }

        // 4. Kembalikan stok barang
        if (tx.voucherId && Array.isArray(db.vouchers)) {
            const voucher = db.vouchers.find(v => String(v.id) === String(tx.voucherId));
            if (voucher) {
                voucher.stock = Number(voucher.stock || 0) + Number(tx.quantity || 1);
            }
        }

        // 5. Hapus catatan hutang jika ada
        if (tx.debtId && Array.isArray(db.debts)) {
            db.debts = db.debts.filter(d => String(d.id) !== String(tx.debtId));
        }

        db.transactions = db.transactions.filter(item => String(item.id) !== String(txId));

        saveAppData(db);

        loadDashboardData();
        loadTransactionsPage();
        loadBalancePage();
        loadDebtsPage();

        showNotification('Transaksi dihapus, seluruh saldo & stok dikembalikan!', 'success');
    }, true);
}

function printReceipt(txId) {
  const db = getAppData();
  const tx = db.transactions.find(t => t.id === txId);
  if (!tx) return;

  const strukText = 
`==========================
      SAKAPAY RECEIPT      
==========================
Layanan : ${tx.notes}
Tanggal : ${new Date(tx.date).toLocaleString('id-ID')}
--------------------------
Total   : ${formatRupiah(tx.admin_fee)}
==========================
   Terima Kasih Telah     
    Transaksi di SakaPay  
==========================`;

  showConfirm('Cetak Struk', 'Salin teks struk ke clipboard?', () => {
    navigator.clipboard.writeText(strukText);
    showNotification('Struk berhasil disalin!', 'success');
  }, false);
}

function loadBalancePage() {
  const db = getAppData();
  const gridEl = document.getElementById('accounts-grid');
  const selectEl = document.getElementById('adj-account-id');
  if (!gridEl || !selectEl) return;

  gridEl.innerHTML = db.accounts.map(acc => `
    <div class="metric-card glass-card" style="position: relative;">
      <div class="metric-header">
        <span>${acc.name}</span>
        <button onclick="deleteAccount('${acc.id}')" style="background: transparent; border: none; color: #f87171; cursor: pointer; font-size: 13px;" title="Hapus Akun">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
      <h3 class="metric-value">${formatRupiah(acc.balance)}</h3>
      <span class="metric-sub text-muted">ID: ${acc.id}</span>
    </div>
  `).join('');

  selectEl.innerHTML = db.accounts.map(acc => `
    <option value="${acc.id}" style="background: #1e293b; color: #fff;">${acc.name} (Saldo: ${formatRupiah(acc.balance)})</option>
  `).join('');

  setupBalanceFormListeners();
}

function setupBalanceFormListeners() {
  const adjustForm = document.getElementById('adjust-balance-form');
  if (adjustForm) {
    adjustForm.onsubmit = (e) => {
      e.preventDefault();
      const accountId = document.getElementById('adj-account-id').value;
      const newBalance = getCleanNumber(document.getElementById('adj-new-balance'));
      const notes = document.getElementById('adj-notes').value;

      const db = getAppData();
      const acc = db.accounts.find(a => String(a.id) === String(accountId));
      if (acc) {
        acc.balance = newBalance;
        saveAppData(db);
        showNotification(`Saldo ${acc.name} berhasil diperbarui!`, 'success');
        loadDashboardData();
        loadBalancePage();
        adjustForm.reset();
      }
    };
  }

  formatNumberInput(document.getElementById('adj-new-balance'));

  const btnAddAccount = document.getElementById('btn-add-account');
  if (btnAddAccount) {
    btnAddAccount.onclick = () => {
      showPrompt('Tambah Rekening Baru', 'Masukkan Nama Rekening / Dompet Baru (Contoh: DANA / BCA / OVO):', '', (name) => {
        if (!name) return;
        showPrompt('Saldo Awal', 'Masukkan Saldo Awal (Rp):', '0', (initBal) => {
          const initialBalance = parseFloat(initBal) || 0;

          const db = getAppData();
          db.accounts.push({ 
            id: 'acc_' + Date.now(), 
            name: name.trim(), 
            balance: initialBalance 
          });
          
          saveAppData(db);
          loadDashboardData();
          loadBalancePage();
          showNotification('Akun / rekening baru berhasil ditambahkan!', 'success');
        }, true);
      });
    };
  }
}

function deleteAccount(accountId) {
  const db = getAppData();
  
  if (db.accounts.length <= 1) {
    showNotification('Minimal harus ada 1 akun/rekening aktif di dalam sistem!', 'error');
    return;
  }

  const accToDelete = db.accounts.find(a => String(a.id) === String(accountId));
  if (!accToDelete) {
    showNotification('Akun tidak ditemukan!', 'error');
    return;
  }

  showConfirm('Hapus Akun', `Yakin ingin menghapus akun "${accToDelete.name}"? Pastikan tidak ada transaksi aktif yang mengikat ke akun ini.`, () => {
      db.accounts = db.accounts.filter(a => String(a.id) !== String(accountId));
      saveAppData(db);
      loadDashboardData();
      loadBalancePage();
      showNotification('Akun berhasil dihapus!', 'success');
  }, true);
}

function loadFinancePage() {
  const db = getAppData();
  const listEl = document.getElementById('expense-list');
  let totalOperational = 0;
  let totalPrive = 0;

  db.expenses.forEach(item => {
    if (item.category === 'operasional') totalOperational += Number(item.amount);
    if (item.category === 'pengambilan_pribadi') totalPrive += Number(item.amount);
  });

  const valOpEl = document.getElementById('val-total-operational');
  const valPrvEl = document.getElementById('val-total-prive');
  if (valOpEl) valOpEl.innerText = formatRupiah(totalOperational);
  if (valPrvEl) valPrvEl.innerText = formatRupiah(totalPrive);

  if (!listEl) return;

  if (db.expenses.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Belum ada catatan pengeluaran.</p>`;
    return;
  }

  listEl.innerHTML = [...db.expenses].reverse().map(exp => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
      <div>
        <strong style="font-size: 13px; display: block; text-transform: capitalize;">${exp.category.replace('_', ' ')}: ${exp.description}</strong>
        <span style="font-size: 11px; color: var(--text-muted);">${new Date(exp.date).toLocaleDateString('id-ID')} • Sumber: ${exp.account_name}</span>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 13px; font-weight: 600; color: #f87171;">-${formatRupiah(exp.amount)}</span>
      </div>
    </div>
  `).join('');

  setupExpenseListeners();
}

function setupExpenseListeners() {
  const btnAdd = document.getElementById('btn-add-expense');
  if (btnAdd) {
    btnAdd.onclick = () => {
      showPrompt('Catat Pengeluaran', 'Pilih Kategori (Ketik angka):\n1. Operasional\n2. Pengambilan Pribadi (Prive)\n3. Tambah Modal', '1', (category) => {
        if (!category) return;

        let catKey = 'operasional';
        if (category === '2') catKey = 'pengambilan_pribadi';
        else if (category === '3') catKey = 'tambah_modal';

        showPrompt('Keterangan', 'Keterangan / Keperluan (Contoh: Bayar listrik):', '', (desc) => {
          if (!desc) return;

          showPrompt('Nominal', 'Nominal Pengeluaran (Rp):', '50000', (amt) => {
            const amount = parseFloat(amt);
            if (!amount || isNaN(amount)) return;

            const db = getAppData();
            const accountName = db.accounts.length > 0 ? db.accounts[0].name : 'Kas Tunai';
            
            db.expenses.push({
              id: 'exp_' + Date.now(),
              category: catKey,
              description: desc,
              amount,
              account_name: accountName,
              date: new Date().toISOString()
            });

            if (db.accounts.length > 0) {
              if (catKey === 'tambah_modal') db.accounts[0].balance += amount;
              else db.accounts[0].balance -= amount;
            }

            saveAppData(db);
            loadDashboardData();
            loadFinancePage();
            showNotification('Catatan keuangan berhasil disimpan!', 'success');
          }, true);
        });
      });
    };
  }
}

function loadCustomersPage() {
  const db = getAppData();
  const listEl = document.getElementById('customer-list');
  if (!listEl) return;

  if (!db.customers || db.customers.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Belum ada data pelanggan.</p>`;
    return;
  }

  listEl.innerHTML = db.customers.map(c => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
      <div>
        <strong style="font-size: 13px; display: block;">${c.name}</strong>
        <span style="font-size: 11px; color: var(--text-muted);">${c.phone}</span>
      </div>
      <div>
        <a href="https://wa.me/${c.phone}" target="_blank" style="background: #25d366; color: #fff; padding: 6px 12px; border-radius: 6px; font-size: 11px; text-decoration: none; font-weight: 600;">
          <i class="fa-brands fa-whatsapp"></i> Chat
        </a>
      </div>
    </div>
  `).join('');

  setupCustomerListeners();
}

function setupCustomerListeners() {
  const btnAdd = document.getElementById('btn-add-customer');
  if (btnAdd) {
    btnAdd.onclick = () => {
      showPrompt('Tambah Pelanggan', 'Nama Pelanggan:', '', (name) => {
        if (!name) return;
        showPrompt('Nomor WhatsApp', 'Nomor WhatsApp (Contoh: 628123456789):', '62', (phone) => {
          if (!phone) return;

          const db = getAppData();
          db.customers.push({ id: 'cust_' + Date.now(), name, phone });
          saveAppData(db);
          loadCustomersPage();
          showNotification('Pelanggan berhasil ditambahkan!', 'success');
        });
      });
    };
  }
}

function initSampleChart() {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
      datasets: [{
        label: 'Omzet (Rp)',
        data: [150000, 230000, 180000, 310000, 290000, 420000, 380000],
        borderColor: '#17A897',
        backgroundColor: 'rgba(23, 168, 151, 0.15)',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
      }
    }
  });
}
