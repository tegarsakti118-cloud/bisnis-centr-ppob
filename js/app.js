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
});

// Fungsi Buka / Tutup Sidebar (Hamburger)
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('active');
}

function switchPage(pageTarget) {
  // Hapus kelas active dari semua menu (sidebar & bottom nav)
  const allNavs = document.querySelectorAll('.nav-link, .bottom-nav-item');
  allNavs.forEach(n => n.classList.remove('active'));

  // Tambahkan active ke menu yang dipilih
  document.querySelectorAll(`[data-page="${pageTarget}"]`).forEach(el => el.classList.add('active'));

  // Tampilkan halaman yang sesuai
  document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
  const targetSection = document.getElementById(`page-${pageTarget}`);
  if (targetSection) targetSection.classList.add('active');

  // Load data spesifik sesuai halaman
  if (pageTarget === 'transactions') loadTransactionsPage();
  if (pageTarget === 'balances') loadBalancePage();
  if (pageTarget === 'finance') loadFinancePage();
  if (pageTarget === 'customers') loadCustomersPage();
  if (pageTarget === 'debts') loadDebtsPage();
  if (pageTarget === 'tariksetor') initTarikSetorPage();
  if (pageTarget === 'ppob') initPpobPage();
  if (pageTarget === 'voucher') initVoucherPage();

  // Tutup sidebar otomatis jika terbuka
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
    selectAcc.innerHTML = `<option value="" disabled selected>-- Pilih Aplikasi --</option>` +
      db.accounts.map(acc => `<option value="${acc.id}">${acc.name} (${formatRupiah(acc.balance)})</option>`).join('');
  }

  const tzDate = document.getElementById('ts-date');
  if (tzDate && !tzDate.value) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    tzDate.value = now.toISOString().slice(0, 16);
  }
}

function initPpobPage() {
  const db = getAppData();
  const selectAcc = document.getElementById('ppob-account');
  if (selectAcc) {
    selectAcc.innerHTML = `<option value="" disabled selected>-- Pilih Aplikasi --</option>` +
      db.accounts.map(acc => `<option value="${acc.id}">${acc.name} (${formatRupiah(acc.balance)})</option>`).join('');
  }
}

function initVoucherPage() {
  const db = getAppData();
  const selectVouch = document.getElementById('vouch-select-item');
  const selectAcc = document.getElementById('vouch-select-account');
  const listEl = document.getElementById('voucher-master-list');

  if (selectVouch) {
    selectVouch.innerHTML = `<option value="" disabled selected>-- Pilih Voucher --</option>` +
      db.vouchers.map(v => `<option value="${v.id}">${v.name} - Stok: ${v.stock} (${formatRupiah(v.price)})</option>`).join('');
  }

  if (selectAcc) {
    selectAcc.innerHTML = `<option value="" disabled selected>-- Pilih Aplikasi Inject --</option>` +
      db.accounts.map(acc => `<option value="${acc.id}">${acc.name} (${formatRupiah(acc.balance)})</option>`).join('');
  }

  if (listEl) {
    if (!db.vouchers || db.vouchers.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Belum ada stok voucher.</p>`;
    } else {
      listEl.innerHTML = db.vouchers.map(v => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <div>
            <strong style="font-size: 14px; display: block;">${v.name}</strong>
            <span style="font-size: 11px; color: var(--text-muted);">Modal Saldo: ${formatRupiah(v.modal_saldo)} | Modal Fisik: ${formatRupiah(v.modal_fisik)}</span>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 14px; font-weight: 700; color: #34d399; display: block;">${formatRupiah(v.price)}</span>
            <span style="font-size: 11px; color: ${v.stock > 0 ? '#38bdf8' : '#f87171'};">Stok: ${v.stock} pcs</span>
          </div>
        </div>
      `).join('');
    }
  }

  const btnAddModal = document.getElementById('btn-add-voucher-modal');
  if (btnAddModal) {
    btnAddModal.onclick = () => {
      const name = prompt('Nama Voucher (Contoh: Telkomsel 7GB / 7 Hari):');
      if (!name) return;
      const modal_saldo = parseFloat(prompt('Modal Saldo Server / Inject (Rp):', '14987')) || 0;
      const modal_fisik = parseFloat(prompt('Modal Fisik / Voucher Kosong (Rp):', '300')) || 0;
      const price = parseFloat(prompt('Harga Jual ke Pelanggan (Rp):', '20000')) || 0;
      const stock = parseInt(prompt('Jumlah Stok Fisik:', '10')) || 0;

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
      alert('Master voucher berhasil ditambahkan!');
    };
  }
}

function setupTarikSetorForm() {
  const form = document.getElementById('tarik-setor-form');
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const dateVal = document.getElementById('ts-date').value;
      const accountId = document.getElementById('ts-account').value;
      const service = document.getElementById('ts-service').value;
      const modal = parseFloat(document.getElementById('ts-admin-bank').value) || 0;
      const jual = parseFloat(document.getElementById('ts-admin-agen').value) || 0;
      const payMethod = document.getElementById('ts-pay-method').value;
      const customer = document.getElementById('ts-customer').value;
      const notes = document.getElementById('ts-notes').value || service;

      if (payMethod === 'Hutang' && !customer) {
        alert('Nama pelanggan wajib diisi jika transaksi berstatus Hutang!');
        return;
      }

      const db = getAppData();
      const acc = db.accounts.find(a => a.id === accountId);
      if (!acc) {
        alert('Silakan pilih aplikasi/rekening terlebih dahulu!');
        return;
      }

      const profit = jual - modal;
      const newTx = {
        id: 'tx_' + Date.now(),
        notes: `${service} (${acc.name}) [${payMethod}] - ${notes}`,
        amount: modal,
        admin_fee: jual,
        cost_price: modal,
        profit,
        date: new Date(dateVal).toISOString(),
        status: payMethod === 'Hutang' ? 'Hutang' : 'Success'
      };

      db.transactions.push(newTx);

      if (payMethod === 'Hutang') {
        db.debts.push({
          id: 'debt_' + Date.now(),
          customer,
          amount: jual,
          description: newTx.notes,
          date: new Date(dateVal).toISOString()
        });
      } else {
        if (service.toLowerCase().includes('tarik')) {
          acc.balance -= modal;
        } else {
          acc.balance += modal;
        }
      }

      saveAppData(db);
      loadDashboardData();
      form.reset();
      initTarikSetorPage();
      alert('Transaksi berhasil disimpan!');
      switchPage('transactions');
    };
  }
}

function setupPpobForm() {
  const form = document.getElementById('ppob-form');
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const accountId = document.getElementById('ppob-account').value;
      const service = document.getElementById('ppob-service').value;
      const target = document.getElementById('ppob-target').value;
      const modal = parseFloat(document.getElementById('ppob-modal').value) || 0;
      const jual = parseFloat(document.getElementById('ppob-jual').value) || 0;
      const payMethod = document.getElementById('ppob-pay-method').value;
      const customer = document.getElementById('ppob-customer').value;

      if (payMethod === 'Hutang' && !customer) {
        alert('Nama pelanggan wajib diisi jika transaksi berstatus Hutang!');
        return;
      }

      const db = getAppData();
      const acc = db.accounts.find(a => a.id === accountId);
      if (!acc) {
        alert('Silakan pilih aplikasi/sumber saldo terlebih dahulu!');
        return;
      }

      const profit = jual - modal;
      const newTx = {
        id: 'tx_' + Date.now(),
        notes: `PPOB: ${service} (${target}) via ${acc.name} [${payMethod}]`,
        amount: modal,
        admin_fee: jual,
        cost_price: modal,
        profit,
        date: new Date().toISOString(),
        status: payMethod === 'Hutang' ? 'Hutang' : 'Success'
      };

      db.transactions.push(newTx);

      if (payMethod === 'Hutang') {
        db.debts.push({
          id: 'debt_' + Date.now(),
          customer,
          amount: jual,
          description: newTx.notes,
          date: new Date().toISOString()
        });
      } else {
        acc.balance -= modal;
      }

      saveAppData(db);
      loadDashboardData();
      form.reset();
      initPpobPage();
      alert('Transaksi PPOB berhasil disimpan!');
      switchPage('transactions');
    };
  }
}

function setupVoucherForm() {
  const form = document.getElementById('sell-voucher-form');
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const vouchId = document.getElementById('vouch-select-item').value;
      const accountId = document.getElementById('vouch-select-account').value;
      const qty = parseInt(document.getElementById('vouch-qty').value) || 1;
      const payMethod = document.getElementById('vouch-pay-method').value;
      const customerName = document.getElementById('vouch-customer-name').value;

      if (payMethod === 'Hutang' && !customerName) {
        alert('Nama pelanggan wajib diisi jika transaksi berstatus Hutang!');
        return;
      }

      const db = getAppData();
      const vouch = db.vouchers.find(v => v.id === vouchId);
      const acc = db.accounts.find(a => a.id === accountId);

      if (!vouch || !acc) {
        alert('Pilih voucher dan aplikasi inject terlebih dahulu!');
        return;
      }

      if (vouch.stock < qty) {
        alert(`Stok voucher ${vouch.name} tidak mencukupi! Sisa stok: ${vouch.stock}`);
        return;
      }

      const totalModalSaldo = vouch.modal_saldo * qty;
      const totalModalFisik = vouch.modal_fisik * qty;
      const totalJual = vouch.price * qty;
      const totalProfit = totalJual - (totalModalSaldo + totalModalFisik);

      vouch.stock -= qty;
      acc.balance -= totalModalSaldo;

      const newTx = {
        id: 'tx_' + Date.now(),
        notes: `Voucher: ${vouch.name} (${qty} pcs) via ${acc.name} [${payMethod}]`,
        amount: totalModalSaldo,
        admin_fee: totalJual,
        cost_price: totalModalSaldo + totalModalFisik,
        profit: totalProfit,
        date: new Date().toISOString(),
        status: payMethod === 'Hutang' ? 'Hutang' : 'Success'
      };

      db.transactions.push(newTx);

      if (payMethod === 'Hutang') {
        db.debts.push({
          id: 'debt_' + Date.now(),
          customer: customerName,
          amount: totalJual,
          description: newTx.notes,
          date: new Date().toISOString()
        });
      }

      saveAppData(db);
      loadDashboardData();
      form.reset();
      initVoucherPage();
      alert('Transaksi penjualan voucher berhasil!');
      switchPage('transactions');
    };
  }
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
  if (!confirm('Tandai hutang ini sudah lunas?')) return;

  const db = getAppData();
  db.debts = db.debts.filter(d => d.id !== debtId);
  saveAppData(db);
  loadDebtsPage();
  alert('Hutang berhasil dilunasi!');
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
  const listEl = document.getElementById('full-tx-list');
  if (!listEl) return;

  if (!transactions || transactions.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Belum ada transaksi tercatat.</p>`;
    return;
  }

  const sortedTx = [...transactions].reverse();
  listEl.innerHTML = sortedTx.map(tx => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
      <div>
        <strong style="font-size: 14px; display: block;">${tx.notes} ${tx.status === 'Hutang' ? '<span style="color:#f87171; font-size:10px;">(Hutang)</span>' : ''}</strong>
        <span style="font-size: 11px; color: var(--text-muted);">${new Date(tx.date).toLocaleString('id-ID')}</span>
      </div>
      <div style="text-align: right; display: flex; align-items: center; gap: 8px;">
        <div>
          <span style="font-size: 14px; font-weight: 600; color: #34d399; display: block;">+${formatRupiah(tx.admin_fee)}</span>
          <span style="font-size: 10px; color: var(--text-muted);">Profit: ${formatRupiah(tx.profit)}</span>
        </div>
        <button onclick="printReceipt('${tx.id}')" style="background: var(--primary-light); border: none; color: var(--primary-color); cursor: pointer; padding: 6px 10px; border-radius: 6px; font-size: 12px;" title="Cetak Struk">
          <i class="fa-solid fa-receipt"></i>
        </button>
        <button onclick="deleteTransaction('${tx.id}')" style="background: transparent; border: none; color: #f87171; cursor: pointer; padding: 6px;" title="Hapus">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function setupTxPageListeners() {
  const searchInput = document.getElementById('search-tx-input');
  if (searchInput) {
    searchInput.oninput = (e) => {
      const keyword = e.target.value.toLowerCase();
      const db = getAppData();
      const filtered = db.transactions.filter(tx => 
        tx.notes.toLowerCase().includes(keyword)
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
    alert('Tidak ada data transaksi pada periode ini.');
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
  alert('File Excel berhasil diexport!');
}

function deleteTransaction(txId) {
  if (!confirm('Yakin ingin menghapus transaksi ini?')) return;

  const db = getAppData();
  db.transactions = db.transactions.filter(tx => tx.id !== txId);
  saveAppData(db);
  
  loadDashboardData();
  loadTransactionsPage();
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

  if (confirm(strukText + '\n\nTekan OK untuk salin teks struk ke clipboard.')) {
    navigator.clipboard.writeText(strukText);
    alert('Struk berhasil disalin!');
  }
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
        <i class="fa-solid fa-wallet icon-teal"></i>
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
      const newBalance = parseFloat(document.getElementById('adj-new-balance').value);
      const notes = document.getElementById('adj-notes').value;

      const db = getAppData();
      const acc = db.accounts.find(a => a.id === accountId);
      if (acc) {
        acc.balance = newBalance;
        saveAppData(db);
        alert(`Saldo ${acc.name} berhasil diperbarui!`);
        loadDashboardData();
        loadBalancePage();
        adjustForm.reset();
      }
    };
  }

  const btnAddAccount = document.getElementById('btn-add-account');
  if (btnAddAccount) {
    btnAddAccount.onclick = () => {
      const name = prompt('Nama Rekening / Dompet Baru:');
      if (!name) return;
      const initialBalance = parseFloat(prompt('Saldo Awal (Rp):', '0')) || 0;

      const db = getAppData();
      db.accounts.push({ id: 'acc_' + Date.now(), name, balance: initialBalance });
      saveAppData(db);
      loadDashboardData();
      loadBalancePage();
      alert('Akun baru berhasil ditambahkan!');
    };
  }
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
      const category = prompt('Pilih Kategori (Ketik angka):\n1. Operasional\n2. Pengambilan Pribadi (Prive)\n3. Tambah Modal', '1');
      if (!category) return;

      let catKey = 'operasional';
      if (category === '2') catKey = 'pengambilan_pribadi';
      else if (category === '3') catKey = 'tambah_modal';

      const desc = prompt('Keterangan / Keperluan:', 'Bayar listrik');
      if (!desc) return;

      const amount = parseFloat(prompt('Nominal (Rp):', '50000'));
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
      alert('Catatan keuangan berhasil disimpan!');
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
      const name = prompt('Nama Pelanggan:');
      if (!name) return;
      const phone = prompt('Nomor WhatsApp (Contoh: 628123456789):', '62');
      if (!phone) return;

      const db = getAppData();
      db.customers.push({ id: 'cust_' + Date.now(), name, phone });
      saveAppData(db);
      loadCustomersPage();
      alert('Pelanggan berhasil ditambahkan!');
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
