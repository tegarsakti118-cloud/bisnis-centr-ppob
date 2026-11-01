// ==========================================
// NEXORA v2.2 - FITUR BARU
//   1. Pindah Saldo      (tabel balance_transfers)
//   2. Komisi & Fee      (tabel commissions)
//   3. Kalkulator Uang   (tabel cash_calculations + cash_calculation_items)
//
// Dimuat SETELAH js/config.js dan js/app.js (lihat index.html).
// Semua perubahan saldo berjalan lewat fungsi database (RPC) sehingga
// saldo + riwayat berhasil / gagal bersamaan (lihat sql/nexora_fitur_baru.sql).
// ==========================================
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const FEATURE_TABLES = {
    balance_transfers: 'balanceTransfers',
    commissions: 'commissions',
    cash_calculations: 'cashCalculations',
    cash_calculation_items: 'cashCalculationItems'
  };

  const COMMISSION_CATEGORIES = {
    fee_setor: 'Fee Setor Tunai',
    fee_tarik: 'Fee Tarik Tunai',
    fee_transfer: 'Fee Transfer',
    bunga_seabank: 'Bunga Tabungan SeaBank',
    komisi_lain: 'Komisi Lainnya'
  };

  const DENOMINATIONS = [1000, 2000, 5000, 10000, 20000, 50000, 75000, 100000];

  let featureTablesReady = true;
  let featureWarned = false;
  let commissionChart = null;
  let lastSavedSignature = null; // tanda perhitungan kalkulator yang sudah tersimpan
  let lastSavedCalcId = null;

  // ------------------------------------------
  // Helper umum
  // ------------------------------------------
  const num = (v) => Number(v) || 0;
  const rp = (v) => formatRupiah(v);
  const fmtDate = (iso) => new Date(iso).toLocaleString('id-ID');
  const byDateDesc = (a, b) => new Date(b.date) - new Date(a.date);

  function toIso(localValue) {
    const d = localValue ? new Date(localValue) : new Date();
    return (isNaN(d.getTime()) ? new Date() : d).toISOString();
  }

  // ISO -> nilai input datetime-local (waktu lokal)
  function toLocalInput(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function accName(id) {
    const a = findAccount(id);
    return a ? a.name : '(akun dihapus)';
  }

  function accountSelectOptions(placeholder, allowEmptyLabel) {
    const head = allowEmptyLabel !== undefined
      ? [{ value: '', label: allowEmptyLabel }]
      : [{ value: '', label: placeholder }];
    return head.concat(appData.accounts.map((a) => ({
      value: String(a.id), label: `${a.name} - Saldo: ${formatRupiah(a.balance)}`
    })));
  }

  function rpcMessage(err) {
    const msg = String((err && err.message) || err || '');
    if (/could not find the function|schema cache|does not exist|PGRST202|42883/i.test(msg + ' ' + (err && err.code || ''))) {
      return 'Fungsi database belum dibuat. Jalankan file sql/nexora_fitur_baru.sql di Supabase SQL Editor.';
    }
    return msg || 'Terjadi kesalahan pada database.';
  }

  // Panggil fungsi database (satu transaksi atomik)
  async function callRpc(name, args) {
    try {
      const { error } = await sb.rpc(name, args);
      if (error) throw error;
      return true;
    } catch (err) {
      console.error(`RPC ${name} gagal:`, err);
      showNotification(rpcMessage(err), 'error');
      return false;
    }
  }

  // Pakai fetchAllRows (app.js terbaru) bila ada; kalau app.js masih versi lama, jatuh ke select biasa
  // supaya perbedaan versi tidak membuat tabel fitur dianggap "belum siap".
  async function fetchRows(table) {
    if (typeof fetchAllRows === 'function') return fetchAllRows(table);
    return sb.from(table).select('*');
  }

  // ------------------------------------------
  // Muat data (dipanggil oleh app.js -> fetchCloudData)
  // ------------------------------------------
  async function fetchFeatureTables() {
    const results = await Promise.all(Object.keys(FEATURE_TABLES).map(async (table) => {
      try {
        const { data, error } = await fetchRows(table);
        return { table, data: data || [], error };
      } catch (err) {
        return { table, data: [], error: err };
      }
    }));

    const failed = [];
    results.forEach((r) => {
      if (r.error) {
        console.error(`Gagal memuat tabel ${r.table}:`, r.error);
        failed.push(r.table);
      } else {
        appData[FEATURE_TABLES[r.table]] = r.data;
      }
    });

    featureTablesReady = failed.length === 0;
    if (!featureTablesReady && !featureWarned) {
      featureWarned = true;
      showNotification('Tabel fitur baru belum siap. Jalankan sql/nexora_fitur_baru.sql di Supabase.', 'error');
    }
    toggleFeatureWarnings();
  }

  // Muat ulang akun + semua tabel fitur setelah RPC sukses (saldo diubah di server)
  async function reloadFeatureData() {
    try {
      const { data, error } = await fetchRows('accounts');
      if (!error && data) appData.accounts = data;
    } catch (err) {
      console.error('Gagal memuat ulang akun:', err);
    }
    await fetchFeatureTables();
  }

  function toggleFeatureWarnings() {
    ['transfer-warning', 'commission-warning', 'cash-warning'].forEach((id) => {
      const el = $(id);
      if (el) el.style.display = featureTablesReady ? 'none' : 'block';
    });
  }

  // Total untuk dashboard & laporan: period 'day' | 'month'
  function featureTotals(period) {
    const keyFn = period === 'day' ? localDateKey : localMonthKey;
    const key = keyFn(new Date());
    const sum = (list, field) => (list || [])
      .filter((x) => keyFn(x.date) === key)
      .reduce((s, x) => s + num(x[field]), 0);
    return {
      commission: sum(appData.commissions, 'amount'),
      transferFee: sum(appData.balanceTransfers, 'admin_fee'),
      transferAmount: sum(appData.balanceTransfers, 'amount')
    };
  }

  // ==========================================
  // 1. PINDAH SALDO
  // ==========================================
  function loadTransferPage() {
    if (!$('page-transfer')) return;
    setSelectOptions($('tf-from'), accountOptions('-- Pilih Rekening Asal --'));
    setSelectOptions($('tf-to'), accountOptions('-- Pilih Rekening Tujuan --'));
    setDefaultDateTime($('tf-date'));
    formatNumberInput($('tf-amount'));
    formatNumberInput($('tf-fee'));
    toggleFeatureWarnings();
    updateTransferPreview();

    const month = featureTotals('month');
    const day = featureTotals('day');
    $('tf-sum-month').textContent = rp(month.transferAmount);
    $('tf-sum-fee').textContent = rp(month.transferFee);
    $('tf-sum-fee-today').textContent = rp(day.transferFee);

    const listEl = $('transfer-list');
    const list = [...(appData.balanceTransfers || [])].sort(byDateDesc);
    if (list.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Belum ada riwayat pemindahan saldo.</p>';
      return;
    }
    listEl.innerHTML = list.map((t) => `
      <div class="row-item">
        <div>
          <strong style="font-size:13px; display:block;">${escapeHtml(accName(t.from_account_id))}
            <i class="fa-solid fa-arrow-right" style="font-size:10px; color:var(--text-muted);"></i>
            ${escapeHtml(accName(t.to_account_id))}</strong>
          <span style="font-size:11px; color:var(--text-muted);">${escapeHtml(fmtDate(t.date))}${t.notes ? ' - ' + escapeHtml(t.notes) : ''}</span>
        </div>
        <div class="row-right">
          <div style="text-align:right;">
            <span style="font-size:13px; font-weight:600; color:#38bdf8; display:block;">${rp(t.amount)}</span>
            ${num(t.admin_fee) > 0 ? `<span style="font-size:10px; color:#f87171;">Biaya admin ${rp(t.admin_fee)}</span>` : ''}
          </div>
          <button type="button" class="btn-mini btn-mini-blue" data-tf-edit="${escapeHtml(t.id)}" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="btn-mini btn-mini-red" data-tf-del="${escapeHtml(t.id)}" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>`).join('');
  }

  function updateTransferPreview() {
    const box = $('tf-preview');
    if (!box) return;
    const from = findAccount($('tf-from').value);
    const to = findAccount($('tf-to').value);
    const amount = getCleanNumber($('tf-amount'));
    const fee = getCleanNumber($('tf-fee'));
    if (!from || !to || amount <= 0) {
      box.style.display = 'none';
      return;
    }
    const fromAfter = num(from.balance) - amount - fee;
    const toAfter = num(to.balance) + amount;
    box.style.display = 'block';
    box.innerHTML = `
      <div>${escapeHtml(from.name)}: ${rp(from.balance)} &rarr; <strong style="color:${fromAfter < 0 ? '#f87171' : '#fff'};">${rp(fromAfter)}</strong></div>
      <div>${escapeHtml(to.name)}: ${rp(to.balance)} &rarr; <strong>${rp(toAfter)}</strong></div>
      ${fromAfter < 0 ? '<div style="color:#f87171; margin-top:4px;">Saldo rekening asal tidak cukup.</div>' : ''}`;
  }

  function setupTransferForm() {
    const form = $('transfer-form');
    if (!form) return;

    ['tf-from', 'tf-to'].forEach((id) => $(id).addEventListener('change', updateTransferPreview));
    ['tf-amount', 'tf-fee'].forEach((id) => $(id).addEventListener('input', updateTransferPreview));

    guardSubmit(form, async () => {
      const from = findAccount($('tf-from').value);
      const to = findAccount($('tf-to').value);
      const amount = getCleanNumber($('tf-amount'));
      const fee = getCleanNumber($('tf-fee'));
      const notes = $('tf-notes').value.trim();

      if (!from || !to) return showNotification('Pilih rekening asal dan tujuan!', 'error');
      if (String(from.id) === String(to.id)) return showNotification('Rekening asal dan tujuan tidak boleh sama!', 'error');
      if (amount <= 0) return showNotification('Nominal harus lebih dari 0!', 'error');
      if (num(from.balance) < amount + fee) {
        return showNotification(`Saldo ${from.name} tidak cukup (butuh ${rp(amount + fee)}, tersedia ${rp(from.balance)}).`, 'error');
      }

      const ok = await callRpc('create_balance_transfer', {
        p_id: genId('trf'),
        p_from: String(from.id),
        p_to: String(to.id),
        p_amount: amount,
        p_fee: fee,
        p_date: toIso($('tf-date').value),
        p_notes: notes
      });
      if (!ok) return;

      await reloadFeatureData();
      form.reset();
      setDefaultDateTime($('tf-date'));
      refreshAllViews();
      showNotification('Saldo berhasil dipindahkan!', 'success');
    });

    $('transfer-list').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-tf-edit]');
      const del = e.target.closest('[data-tf-del]');
      if (edit) openEditTransfer(edit.dataset.tfEdit);
      if (del) deleteTransfer(del.dataset.tfDel);
    });
  }

  function openEditTransfer(id) {
    const t = (appData.balanceTransfers || []).find((x) => String(x.id) === String(id));
    if (!t) return;
    showFormModal({
      title: 'Edit Pemindahan Saldo',
      icon: 'fa-solid fa-right-left',
      submitText: 'Simpan Perubahan',
      fields: [
        { id: 'date', label: 'Tanggal & Waktu', type: 'datetime', value: toLocalInput(t.date), required: true },
        { id: 'from', label: 'Rekening Asal', type: 'select', value: String(t.from_account_id), options: accountSelectOptions('-- Pilih --'), required: true },
        { id: 'to', label: 'Rekening Tujuan', type: 'select', value: String(t.to_account_id), options: accountSelectOptions('-- Pilih --'), required: true },
        { id: 'amount', label: 'Nominal (Rp)', type: 'number', value: t.amount, required: true },
        { id: 'fee', label: 'Biaya Admin (Rp)', type: 'number', value: t.admin_fee, required: true, allowZero: true },
        { id: 'notes', label: 'Catatan (opsional)', type: 'text', value: t.notes || '' }
      ],
      onSubmit: async (v) => {
        if (!findAccount(v.from) || !findAccount(v.to)) { showNotification('Pilih rekening yang valid!', 'error'); return false; }
        if (v.from === v.to) { showNotification('Rekening asal dan tujuan tidak boleh sama!', 'error'); return false; }
        const ok = await callRpc('update_balance_transfer', {
          p_id: String(t.id), p_from: v.from, p_to: v.to, p_amount: v.amount, p_fee: v.fee,
          p_date: toIso(v.date), p_notes: v.notes
        });
        if (!ok) return false;
        await reloadFeatureData();
        refreshAllViews();
        showNotification('Pemindahan saldo diperbarui dan saldo dikoreksi!', 'success');
      }
    });
  }

  function deleteTransfer(id) {
    const t = (appData.balanceTransfers || []).find((x) => String(x.id) === String(id));
    if (!t) return;
    showConfirm(
      'Hapus Pemindahan Saldo',
      `Saldo ${accName(t.to_account_id)} dikurangi ${rp(t.amount)} dan saldo ${accName(t.from_account_id)} dikembalikan ${rp(num(t.amount) + num(t.admin_fee))}. Lanjutkan?`,
      async () => {
        const ok = await callRpc('delete_balance_transfer', { p_id: String(t.id) });
        if (!ok) return;
        await reloadFeatureData();
        refreshAllViews();
        showNotification('Pemindahan dihapus dan saldo dikembalikan!', 'success');
      },
      true
    );
  }

  // ==========================================
  // 2. KOMISI & FEE
  // ==========================================
  function loadCommissionPage() {
    if (!$('page-commission')) return;
    setDefaultDateTime($('cm-date'));
    formatNumberInput($('cm-tx-amount'));
    formatNumberInput($('cm-amount'));
    setSelectOptions($('cm-account'),
      '<option value="">Tidak masuk ke saldo manapun (sudah tercatat)</option>' +
      appData.accounts.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(`${a.name} - Saldo: ${formatRupiah(a.balance)}`)}</option>`).join(''));
    toggleFeatureWarnings();

    const day = featureTotals('day');
    const month = featureTotals('month');
    const monthKey = localMonthKey(new Date());
    const monthList = (appData.commissions || []).filter((c) => localMonthKey(c.date) === monthKey);
    $('cm-sum-today').textContent = rp(day.commission);
    $('cm-sum-month').textContent = rp(month.commission);
    $('cm-sum-count').textContent = String(monthList.length);

    // Rincian per kategori (bulan ini)
    const breakdownEl = $('cm-breakdown');
    const perCat = Object.keys(COMMISSION_CATEGORIES).map((k) => ({
      key: k,
      total: monthList.filter((c) => c.category === k).reduce((s, c) => s + num(c.amount), 0)
    })).filter((x) => x.total > 0);
    breakdownEl.innerHTML = perCat.length
      ? perCat.map((x) => `<div class="row-item" style="padding:8px 0;"><span style="font-size:12px;">${escapeHtml(COMMISSION_CATEGORIES[x.key])}</span><strong style="font-size:12px; color:#34d399;">${rp(x.total)}</strong></div>`).join('')
      : '<p class="empty-state">Belum ada pendapatan bulan ini.</p>';

    renderCommissionChart();

    const listEl = $('commission-list');
    const list = [...(appData.commissions || [])].sort(byDateDesc);
    if (list.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Belum ada catatan komisi / fee.</p>';
      return;
    }
    listEl.innerHTML = list.map((c) => `
      <div class="row-item">
        <div>
          <strong style="font-size:13px; display:block;">${escapeHtml(COMMISSION_CATEGORIES[c.category] || c.category)}</strong>
          <span style="font-size:11px; color:var(--text-muted);">
            ${escapeHtml(fmtDate(c.date))} - ${c.account_id ? escapeHtml(accName(c.account_id)) : 'Tanpa saldo'}
            ${num(c.transaction_amount) > 0 ? ' - Transaksi ' + rp(c.transaction_amount) : ''}
            ${c.notes ? ' - ' + escapeHtml(c.notes) : ''}
          </span>
        </div>
        <div class="row-right">
          <span style="font-size:13px; font-weight:600; color:#34d399;">+${rp(c.amount)}</span>
          <button type="button" class="btn-mini btn-mini-blue" data-cm-edit="${escapeHtml(c.id)}" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button type="button" class="btn-mini btn-mini-red" data-cm-del="${escapeHtml(c.id)}" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>`).join('');
  }

  function renderCommissionChart() {
    const canvas = $('commissionChart');
    const section = $('page-commission');
    if (!canvas || typeof Chart === 'undefined' || !section || !section.classList.contains('active')) return;

    const labels = [];
    const keys = [];
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      keys.push(localDateKey(d));
      labels.push(`${dayNames[d.getDay()]} ${d.getDate()}`);
    }
    const totals = keys.map((k) => (appData.commissions || [])
      .filter((c) => localDateKey(c.date) === k)
      .reduce((s, c) => s + num(c.amount), 0));

    if (commissionChart) {
      commissionChart.data.labels = labels;
      commissionChart.data.datasets[0].data = totals;
      commissionChart.update();
      return;
    }
    const shortRp = (v) => (v >= 1000000 ? `${v / 1000000}jt` : v >= 1000 ? `${v / 1000}rb` : v);
    commissionChart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Fee & Komisi', data: totals, backgroundColor: 'rgba(52,211,153,0.55)', borderColor: '#34d399', borderWidth: 1, borderRadius: 6 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 10 }, callback: shortRp }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  let commissionSaving = false;

  async function submitCommission(p) {
    if (commissionSaving) return false;
    commissionSaving = true;
    try {
      const ok = await callRpc('create_commission', {
        p_id: p.id, p_category: p.category, p_tx_amount: p.txAmount, p_amount: p.amount,
        p_account: p.account, p_date: p.date, p_notes: p.notes
      });
      if (!ok) return false;
      await reloadFeatureData();
      const form = $('commission-form');
      if (form) form.reset();
      setDefaultDateTime($('cm-date'));
      refreshAllViews();
      showNotification('Komisi / fee berhasil dicatat!', 'success');
      return true;
    } finally {
      commissionSaving = false;
    }
  }

  function validateCommission(category, txAmount, amount) {
    if (!COMMISSION_CATEGORIES[category]) return 'Pilih kategori pendapatan!';
    if (amount <= 0) return 'Nominal fee / komisi harus lebih dari 0!';
    if (txAmount > 0 && amount >= txAmount) {
      return 'Nominal fee harus lebih kecil dari nominal transaksi. Isi fee yang Anda terima saja, bukan seluruh uang pelanggan.';
    }
    return '';
  }

  function setupCommissionForm() {
    const form = $('commission-form');
    if (!form) return;

    guardSubmit(form, async () => {
      const category = $('cm-category').value;
      const txAmount = getCleanNumber($('cm-tx-amount'));
      const amount = getCleanNumber($('cm-amount'));
      const account = $('cm-account').value;
      const err = validateCommission(category, txAmount, amount);
      if (err) return showNotification(err, 'error');
      if (account && !findAccount(account)) return showNotification('Rekening penerima tidak ditemukan!', 'error');

      const payload = {
        id: genId('com'), category, txAmount, amount, account,
        date: toIso($('cm-date').value), notes: $('cm-notes').value.trim()
      };

      // Cegah pencatatan ganda: kategori + nominal + rekening + hari yang sama
      const dayKey = localDateKey(payload.date);
      const dup = (appData.commissions || []).find((c) =>
        c.category === category && num(c.amount) === amount &&
        String(c.account_id || '') === String(account || '') && localDateKey(c.date) === dayKey);
      if (dup) {
        showConfirm(
          'Mirip Catatan Sebelumnya',
          `Sudah ada ${COMMISSION_CATEGORIES[category]} sebesar ${rp(amount)} pada tanggal yang sama. Tetap simpan sebagai catatan baru?`,
          () => { submitCommission(payload); }
        );
        return;
      }
      await submitCommission(payload);
    });

    $('commission-list').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-cm-edit]');
      const del = e.target.closest('[data-cm-del]');
      if (edit) openEditCommission(edit.dataset.cmEdit);
      if (del) deleteCommission(del.dataset.cmDel);
    });
  }

  function openEditCommission(id) {
    const c = (appData.commissions || []).find((x) => String(x.id) === String(id));
    if (!c) return;
    showFormModal({
      title: 'Edit Komisi / Fee',
      icon: 'fa-solid fa-hand-holding-dollar',
      submitText: 'Simpan Perubahan',
      fields: [
        { id: 'category', label: 'Kategori', type: 'select', value: c.category,
          options: Object.keys(COMMISSION_CATEGORIES).map((k) => ({ value: k, label: COMMISSION_CATEGORIES[k] })) },
        { id: 'txAmount', label: 'Nominal Transaksi (opsional)', type: 'number', value: c.transaction_amount || 0, allowZero: true },
        { id: 'amount', label: 'Nominal Fee / Komisi (Rp)', type: 'number', value: c.amount, required: true },
        { id: 'account', label: 'Sumber Pendapatan (rekening penerima)', type: 'select', value: c.account_id ? String(c.account_id) : '',
          options: accountSelectOptions('', 'Tidak masuk ke saldo manapun') },
        { id: 'date', label: 'Tanggal & Waktu', type: 'datetime', value: toLocalInput(c.date), required: true },
        { id: 'notes', label: 'Catatan (opsional)', type: 'text', value: c.notes || '' }
      ],
      onSubmit: async (v) => {
        const err = validateCommission(v.category, v.txAmount, v.amount);
        if (err) { showNotification(err, 'error'); return false; }
        const ok = await callRpc('update_commission', {
          p_id: String(c.id), p_category: v.category, p_tx_amount: v.txAmount, p_amount: v.amount,
          p_account: v.account, p_date: toIso(v.date), p_notes: v.notes
        });
        if (!ok) return false;
        await reloadFeatureData();
        refreshAllViews();
        showNotification('Komisi diperbarui dan saldo dikoreksi!', 'success');
      }
    });
  }

  function deleteCommission(id) {
    const c = (appData.commissions || []).find((x) => String(x.id) === String(id));
    if (!c) return;
    showConfirm(
      'Hapus Komisi / Fee',
      c.account_id
        ? `Catatan dihapus dan saldo ${accName(c.account_id)} dikurangi ${rp(c.amount)}. Lanjutkan?`
        : 'Catatan komisi ini dihapus (tidak memengaruhi saldo). Lanjutkan?',
      async () => {
        const ok = await callRpc('delete_commission', { p_id: String(c.id) });
        if (!ok) return;
        await reloadFeatureData();
        refreshAllViews();
        showNotification('Komisi dihapus dan saldo dikoreksi!', 'success');
      },
      true
    );
  }

  // ==========================================
  // 3. KALKULATOR UANG
  // ==========================================
  // Format tanpa spasi, sesuai referensi: Rp1.000
  function cashRp(n) {
    return 'Rp' + Number(n || 0).toLocaleString('id-ID');
  }

  function buildCashGrid() {
    const grid = $('cash-grid');
    if (!grid || grid.dataset.built === '1') return;
    grid.dataset.built = '1';
    grid.innerHTML = DENOMINATIONS.map((d) => `
      <div class="cash-card" data-den="${d}">
        <div class="cash-card-head">${cashRp(d)}</div>
        <input type="text" inputmode="numeric" class="cash-qty" placeholder="0" maxlength="6" aria-label="Jumlah lembar ${cashRp(d)}">
        <div class="cash-sub"></div>
      </div>`).join('');

    grid.addEventListener('input', (e) => {
      if (!e.target.classList.contains('cash-qty')) return;
      e.target.value = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      recalcCash();
    });
    grid.addEventListener('focusin', (e) => {
      if (e.target.classList.contains('cash-qty')) setTimeout(() => e.target.select(), 0);
    });
  }

  function getCashItems() {
    return Array.from(document.querySelectorAll('#cash-grid .cash-card')).map((card) => ({
      denomination: parseInt(card.dataset.den, 10),
      quantity: parseInt(card.querySelector('.cash-qty').value, 10) || 0
    }));
  }

  function cashSignature(items) {
    return JSON.stringify(items.map((i) => [i.denomination, i.quantity]));
  }

  function recalcCash() {
    let total = 0;
    let pieces = 0;
    document.querySelectorAll('#cash-grid .cash-card').forEach((card) => {
      const den = parseInt(card.dataset.den, 10);
      const qty = parseInt(card.querySelector('.cash-qty').value, 10) || 0;
      total += den * qty;
      pieces += qty;
      card.classList.toggle('cash-filled', qty > 0);
      card.querySelector('.cash-sub').textContent = qty > 0 ? `${qty.toLocaleString('id-ID')} lembar = ${cashRp(den * qty)}` : '';
    });
    $('cash-total').textContent = formatRupiah(total);
    $('cash-pieces').textContent = `${pieces.toLocaleString('id-ID')} lembar`;
    return { total, pieces };
  }

  function resetCash() {
    document.querySelectorAll('#cash-grid .cash-qty').forEach((i) => { i.value = ''; });
    $('cash-notes').value = '';
    lastSavedSignature = null;
    lastSavedCalcId = null;
    recalcCash();
  }

  async function saveCashCalculation() {
    const { pieces } = recalcCash();
    if (pieces <= 0) return showNotification('Isi jumlah lembar uang terlebih dahulu!', 'error');
    const items = getCashItems();
    const sig = cashSignature(items);
    if (sig === lastSavedSignature) return showNotification('Perhitungan ini sudah disimpan ke riwayat.', 'error');

    const id = genId('cash');
    const ok = await callRpc('save_cash_calculation', {
      p_id: id, p_date: new Date().toISOString(), p_notes: $('cash-notes').value.trim(), p_items: items
    });
    if (!ok) return;
    lastSavedSignature = sig;
    lastSavedCalcId = id;
    await fetchFeatureTables();
    loadCashPage();
    showNotification('Perhitungan disimpan ke riwayat. Saldo kas tidak berubah.', 'success');
  }

  function loadCashPage() {
    if (!$('page-cashcalc')) return;
    buildCashGrid();
    recalcCash();
    toggleFeatureWarnings();

    const listEl = $('cash-history');
    const list = [...(appData.cashCalculations || [])].sort(byDateDesc);
    if (list.length === 0) {
      listEl.innerHTML = '<p class="empty-state">Belum ada riwayat perhitungan.</p>';
      return;
    }
    listEl.innerHTML = list.map((c) => {
      const items = (appData.cashCalculationItems || [])
        .filter((i) => String(i.calculation_id) === String(c.id))
        .sort((a, b) => b.denomination - a.denomination)
        .map((i) => `${i.quantity}&times;${(Number(i.denomination)).toLocaleString('id-ID')}`)
        .join(', ');
      return `
        <div class="row-item" style="align-items:flex-start;">
          <div>
            <strong style="font-size:14px; display:block;">${rp(c.total_amount)}
              <span style="font-size:11px; font-weight:500; color:var(--text-muted);">(${num(c.total_pieces).toLocaleString('id-ID')} lembar)</span></strong>
            <span style="font-size:11px; color:var(--text-muted); display:block;">${escapeHtml(fmtDate(c.date))}${c.notes ? ' - ' + escapeHtml(c.notes) : ''}</span>
            <span style="font-size:11px; color:var(--text-muted); display:block; margin-top:2px;">${items}</span>
            ${c.applied
              ? `<span class="badge-ok">Dicatat ke saldo ${escapeHtml(accName(c.applied_account_id))} (sebelumnya ${rp(c.balance_before)})</span>`
              : '<span class="badge-plain">Hanya perhitungan - saldo tidak berubah</span>'}
          </div>
          <div class="row-right" style="flex-direction:column; align-items:stretch; gap:6px;">
            ${c.applied ? '' : `
              <button type="button" class="btn-mini btn-mini-green" data-cc-apply="${escapeHtml(c.id)}"><i class="fa-solid fa-vault"></i> Catat Saldo</button>
              <button type="button" class="btn-mini btn-mini-red" data-cc-del="${escapeHtml(c.id)}"><i class="fa-solid fa-trash-can"></i> Hapus</button>`}
          </div>
        </div>`;
    }).join('');
  }

  function defaultCashAccountId() {
    const kas = appData.accounts.find((a) => /kas|laci|cash|tunai/i.test(String(a.name || '')));
    return kas ? String(kas.id) : (appData.accounts[0] ? String(appData.accounts[0].id) : '');
  }

  // Modal konfirmasi: catat hasil hitung sebagai saldo kas
  // calcId null  -> hitungan yang sedang tampil di layar (disimpan dulu)
  function openCashApplyModal(calcId) {
    if (appData.accounts.length === 0) return showNotification('Tambahkan akun/rekening kas dulu di Balance Mgmt.', 'error');

    let total;
    let pieces;
    if (calcId) {
      const rec = (appData.cashCalculations || []).find((c) => String(c.id) === String(calcId));
      if (!rec) return;
      if (rec.applied) return showNotification('Perhitungan ini sudah dicatat ke saldo.', 'error');
      total = num(rec.total_amount);
      pieces = num(rec.total_pieces);
    } else {
      const cur = recalcCash();
      total = cur.total;
      pieces = cur.pieces;
      if (pieces <= 0) return showNotification('Isi jumlah lembar uang terlebih dahulu!', 'error');
    }

    const opts = appData.accounts.map((a) =>
      `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
    const modal = createModal('cash-apply-modal', `
      <div class="app-modal-head" style="color:#34d399;"><i class="fa-solid fa-vault"></i><h3>Catat ke Saldo Kas</h3></div>
      <div class="form-group" style="margin-bottom:12px;">
        <label for="ca-account">Rekening / Akun Kas</label>
        <select id="ca-account" class="glass-input">${opts}</select>
      </div>
      <div id="ca-preview" class="fm-info"></div>
      <p class="app-modal-text" style="margin-bottom:14px;">Saldo rekening akan <strong>diganti</strong> sesuai total uang yang dihitung (${rp(total)}). Lanjutkan hanya jika hitungan sudah benar.</p>
      <div class="app-modal-actions">
        <button type="button" id="ca-cancel" class="app-btn-ghost">Batal</button>
        <button type="button" id="ca-confirm" class="app-btn-solid" style="background:#17A897;">Ya, Catat ke Saldo</button>
      </div>`, 'rgba(52,211,153,0.4)');

    const sel = modal.querySelector('#ca-account');
    sel.value = defaultCashAccountId();
    const preview = () => {
      const acc = findAccount(sel.value);
      const diff = total - num(acc && acc.balance);
      modal.querySelector('#ca-preview').innerHTML = acc
        ? `Saldo tercatat: <strong>${rp(acc.balance)}</strong><br>Hasil hitung: <strong>${rp(total)}</strong><br>Selisih: <strong style="color:${diff < 0 ? '#f87171' : '#34d399'};">${diff >= 0 ? '+' : ''}${rp(diff)}</strong>`
        : '';
    };
    sel.addEventListener('change', preview);
    preview();

    modal.querySelector('#ca-cancel').onclick = () => modal.remove();
    let busy = false;
    modal.querySelector('#ca-confirm').onclick = async () => {
      if (busy) return;
      const acc = findAccount(sel.value);
      if (!acc) return showNotification('Pilih rekening kas!', 'error');
      busy = true;
      modal.querySelector('#ca-confirm').disabled = true;

      let id = calcId;
      let okSave = true;
      if (!id) {
        const items = getCashItems();
        const sig = cashSignature(items);
        if (sig === lastSavedSignature && lastSavedCalcId) {
          id = lastSavedCalcId; // sudah tersimpan: jangan buat catatan ganda
        } else {
          id = genId('cash');
          okSave = await callRpc('save_cash_calculation', {
            p_id: id, p_date: new Date().toISOString(), p_notes: $('cash-notes').value.trim(), p_items: items
          });
          if (okSave) { lastSavedSignature = sig; lastSavedCalcId = id; }
        }
      }
      const ok = okSave && await callRpc('apply_cash_calculation', { p_id: id, p_account: String(acc.id) });
      busy = false;
      if (!ok) {
        modal.querySelector('#ca-confirm').disabled = false;
        await reloadFeatureData();
        refreshAllViews();
        return;
      }
      modal.remove();
      await reloadFeatureData();
      if (!calcId) resetCash();
      refreshAllViews();
      showNotification(`Saldo ${acc.name} dicatat menjadi ${rp(total)}.`, 'success');
    };
  }

  function deleteCashCalculation(id) {
    showConfirm('Hapus Riwayat Hitung', 'Riwayat perhitungan ini dihapus. Saldo kas tidak terpengaruh. Lanjutkan?', async () => {
      const ok = await callRpc('delete_cash_calculation', { p_id: String(id) });
      if (!ok) return;
      await fetchFeatureTables();
      loadCashPage();
      showNotification('Riwayat perhitungan dihapus!', 'success');
    }, true);
  }

  function setupCashPage() {
    if (!$('page-cashcalc')) return;
    buildCashGrid();
    $('btn-cash-reset').addEventListener('click', () => { resetCash(); showNotification('Kalkulator direset.', 'success'); });
    $('btn-cash-save').addEventListener('click', saveCashCalculation);
    $('btn-cash-apply').addEventListener('click', () => openCashApplyModal(null));
    $('cash-history').addEventListener('click', (e) => {
      const apply = e.target.closest('[data-cc-apply]');
      const del = e.target.closest('[data-cc-del]');
      if (apply) openCashApplyModal(apply.dataset.ccApply);
      if (del) deleteCashCalculation(del.dataset.ccDel);
    });
  }

  // ==========================================
  // LAPORAN KEUANGAN (halaman Finance)
  // ==========================================
  function monthFinanceSummary() {
    const key = localMonthKey(new Date());
    const txs = appData.transactions.filter((t) => localMonthKey(t.date) === key);
    const exps = appData.expenses.filter((e) => localMonthKey(e.date) === key);
    const fx = featureTotals('month');
    const profitTx = txs.reduce((s, t) => s + num(t.profit), 0);
    const operational = exps.filter((e) => e.type === 'operasional').reduce((s, e) => s + num(e.amount), 0);
    const prive = exps.filter((e) => e.type === 'prive').reduce((s, e) => s + num(e.amount), 0);
    return {
      omzet: txs.reduce((s, t) => s + num(t.admin_fee), 0),
      profitTx,
      commission: fx.commission,
      transferFee: fx.transferFee,
      transferAmount: fx.transferAmount,
      operational,
      prive,
      net: profitTx + fx.commission - fx.transferFee - operational
    };
  }

  function renderFinanceSummary() {
    if (!$('rpt-net')) return;
    const s = monthFinanceSummary();
    $('rpt-omzet').textContent = rp(s.omzet);
    $('rpt-profit-tx').textContent = rp(s.profitTx);
    $('rpt-commission').textContent = rp(s.commission);
    $('rpt-transfer-fee').textContent = '-' + rp(s.transferFee);
    $('rpt-operational').textContent = '-' + rp(s.operational);
    $('rpt-prive').textContent = rp(s.prive);
    $('rpt-transfer-amount').textContent = rp(s.transferAmount);
    const netEl = $('rpt-net');
    netEl.textContent = rp(s.net);
    netEl.style.color = s.net < 0 ? '#f87171' : '#34d399';
  }

  function exportFinanceReport() {
    if (typeof XLSX === 'undefined') return showNotification('Library Excel belum termuat. Periksa koneksi internet.', 'error');
    const monthKey = localMonthKey(new Date());
    const s = monthFinanceSummary();
    const wb = XLSX.utils.book_new();

    const summary = [
      { Keterangan: 'Omzet transaksi (Tarik/Setor, PPOB, Kasir)', Nominal: s.omzet },
      { Keterangan: 'Keuntungan transaksi', Nominal: s.profitTx },
      { Keterangan: 'Komisi & Fee diterima (pendapatan)', Nominal: s.commission },
      { Keterangan: 'Biaya admin Pindah Saldo (biaya)', Nominal: -s.transferFee },
      { Keterangan: 'Pengeluaran operasional (biaya)', Nominal: -s.operational },
      { Keterangan: 'ESTIMASI LABA BERSIH', Nominal: s.net },
      { Keterangan: '--- Bukan pendapatan / biaya ---', Nominal: '' },
      { Keterangan: 'Total saldo dipindahkan antar rekening', Nominal: s.transferAmount },
      { Keterangan: 'Pengambilan pribadi (prive)', Nominal: s.prive }
    ];
    const wsSum = XLSX.utils.json_to_sheet(summary);
    wsSum['!cols'] = [{ wch: 46 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsSum, 'Ringkasan');

    const com = (appData.commissions || []).filter((c) => localMonthKey(c.date) === monthKey).sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((c) => ({
        Tanggal: fmtDate(c.date), Kategori: COMMISSION_CATEGORIES[c.category] || c.category,
        'Nominal Transaksi': num(c.transaction_amount), 'Fee/Komisi': num(c.amount),
        Rekening: c.account_id ? accName(c.account_id) : '-', Catatan: c.notes || ''
      }));
    if (com.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(com), 'Komisi & Fee');

    const trf = (appData.balanceTransfers || []).filter((t) => localMonthKey(t.date) === monthKey).sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((t) => ({
        Tanggal: fmtDate(t.date), Asal: accName(t.from_account_id), Tujuan: accName(t.to_account_id),
        Nominal: num(t.amount), 'Biaya Admin': num(t.admin_fee), Catatan: t.notes || ''
      }));
    if (trf.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trf), 'Pindah Saldo');

    XLSX.writeFile(wb, `Nexora_Laporan_Keuangan_${monthKey}.xlsx`);
    showNotification('Laporan keuangan berhasil dibuat!', 'success');
  }

  // ==========================================
  // PENDAFTARAN KE APLIKASI
  // ==========================================
  // Loader halaman baru + loader Finance diperluas (ringkasan laporan)
  const baseFinanceLoader = PAGE_LOADERS.finance;
  PAGE_LOADERS.finance = () => { baseFinanceLoader(); renderFinanceSummary(); };
  PAGE_LOADERS.transfer = loadTransferPage;
  PAGE_LOADERS.commission = loadCommissionPage;
  PAGE_LOADERS.cashcalc = loadCashPage;

  window.fetchFeatureTables = fetchFeatureTables;
  window.featureTotals = featureTotals;

  document.addEventListener('DOMContentLoaded', () => {
    setupTransferForm();
    setupCommissionForm();
    setupCashPage();
    const exp = $('btn-export-report');
    if (exp) exp.addEventListener('click', exportFinanceReport);
  });
})();