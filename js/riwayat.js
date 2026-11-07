// ==========================================
// NEXORA - MENU RIWAYAT (v2.4)
//   - Default tampilan = transaksi HARI INI (WIB / Asia Jakarta), filter dijalankan di Supabase
//   - Filter tanggal, jenis, status + pencarian (bisa dipakai bersamaan)
//   - Kartu ringkas (keterangan maks. 2 baris), tombol Detail, Edit, Struk, Hapus
//   - Edit transaksi: saldo, kas, keuntungan disinkronkan atomik lewat fungsi database
//     nx_edit_transaction (sql/nexora_riwayat_edit.sql)
//
// Dimuat SETELAH app.js, features.js, tarik-tunai.js. Menggantikan blok Riwayat lama di app.js.
// ==========================================
console.info('[Nexora] riwayat.js v2.6 (tabel + keterangan 2 baris)');
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const num = (v) => Number(v) || 0;
  const rp = (v) => formatRupiah(v);
  const PAGE_STEP = 50;
  const TZ = 'Asia/Jakarta';
  const WIB_OFFSET_MS = 7 * 3600 * 1000; // WIB = UTC+7 (tanpa DST)

  // ------------------------------------------
  // TANGGAL WIB
  // ------------------------------------------
  function wibParts(ms) {
    const d = new Date((ms === undefined ? Date.now() : ms) + WIB_OFFSET_MS);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
  }
  // Awal hari WIB (00:00 WIB) sebagai objek Date. Date.UTC otomatis merapikan hari/bulan yang melebihi.
  function wibStart(y, m, d) { return new Date(Date.UTC(y, m, d) - WIB_OFFSET_MS); }
  function wibDayKey(ms) {
    const p = wibParts(ms);
    return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  function parseWibDateInput(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!m) return null;
    return wibStart(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function fmtDay(d) {
    return d.toLocaleDateString('id-ID', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function toLocalInput(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  const PRESET_LABELS = {
    today: 'Hari ini', yesterday: 'Kemarin', last7: '7 hari terakhir', last30: '30 hari terakhir',
    thisMonth: 'Bulan ini', lastMonth: 'Bulan lalu', custom: 'Tanggal sendiri'
  };

  // { start, endExcl } (Date) untuk preset; null = semua. Dihitung ulang setiap query,
  // jadi pergantian hari (00:00 WIB) otomatis ikut.
  function getRange() {
    const p = S.preset;
    if (p === 'all') return null;
    if (p === 'custom') return { start: S.customStart, endExcl: S.customEndExcl };
    const t = wibParts();
    switch (p) {
      case 'today': return { start: wibStart(t.y, t.m, t.d), endExcl: wibStart(t.y, t.m, t.d + 1) };
      case 'yesterday': return { start: wibStart(t.y, t.m, t.d - 1), endExcl: wibStart(t.y, t.m, t.d) };
      case 'last7': return { start: wibStart(t.y, t.m, t.d - 6), endExcl: wibStart(t.y, t.m, t.d + 1) };
      case 'last30': return { start: wibStart(t.y, t.m, t.d - 29), endExcl: wibStart(t.y, t.m, t.d + 1) };
      case 'thisMonth': return { start: wibStart(t.y, t.m, 1), endExcl: wibStart(t.y, t.m + 1, 1) };
      case 'lastMonth': return { start: wibStart(t.y, t.m - 1, 1), endExcl: wibStart(t.y, t.m, 1) };
      default: return null;
    }
  }

  function periodText(range) {
    const last = new Date(range.endExcl.getTime() - 1);
    const a = fmtDay(range.start);
    const b = fmtDay(last);
    return a === b ? a : `${a} - ${b}`;
  }

  // ------------------------------------------
  // STATE
  // ------------------------------------------
  const S = {
    preset: 'today',          // DEFAULT: hari ini
    customStart: null,
    customEndExcl: null,
    type: 'all',              // all | tarik | setor | pindah | ppob | kasir | layanan
    status: 'all',
    search: '',
    txRows: null,             // hasil query Supabase untuk rentang (null = belum dimuat / mode semua)
    trfRows: null,
    loading: false,
    error: false,
    shown: PAGE_STEP,
    customOpen: false,
    seq: 0,
    dayKey: wibDayKey()
  };

  // ------------------------------------------
  // KLASIFIKASI & HELPER DATA
  // ------------------------------------------
  const CATEGORY = {
    tarik: { label: 'Tarik Tunai', icon: 'fa-hand-holding-dollar' },
    setor: { label: 'Setor Tunai', icon: 'fa-piggy-bank' },
    pindah: { label: 'Pindah Saldo', icon: 'fa-right-left' },
    ppob: { label: 'PPOB', icon: 'fa-mobile-screen' },
    kasir: { label: 'Kasir', icon: 'fa-cash-register' },
    layanan: { label: 'Layanan Lain', icon: 'fa-building-columns' }
  };

  function tarikInfo(tx) {
    return typeof getTarikTunaiInfo === 'function' ? getTarikTunaiInfo(tx) : null;
  }

  function txCategory(tx) {
    if (tx.type === 'ppob') return 'ppob';
    if (tx.type === 'voucher') return 'kasir';
    if (tx.type === 'tarik_setor') {
      const n = String(tx.notes || '');
      if (tarikInfo(tx) || /^Tarik Tunai/i.test(n)) return 'tarik';
      if (/^Setor Tunai/i.test(n)) return 'setor';
    }
    return 'layanan';
  }

  function serviceName(tx) {
    if (tx.type === 'ppob') return 'PPOB';
    if (tx.type === 'voucher') return 'Kasir';
    const m = /^(.*?)\s*(?:\[|\()/.exec(String(tx.notes || ''));
    return (m && m[1].trim()) || 'Tarik/Setor';
  }

  function statusLabel(status) {
    if (status === 'Success' || status === undefined || status === null || status === '') return 'Berhasil';
    return String(status);
  }
  function statusClass(label) {
    if (label === 'Berhasil') return 'st-ok';
    if (label === 'Hutang') return 'st-debt';
    return 'st-other';
  }

  function accName(id) {
    if (id === 'Hutang') return 'Hutang';
    const a = findAccount(id);
    return a ? a.name : '-';
  }

  function customerOf(tx) {
    const info = tarikInfo(tx);
    if (info && info.customer && info.customer !== '-') return info.customer;
    if (tx.customer_name) return String(tx.customer_name);
    const debt = (appData.debts || []).find((d) =>
      (tx.debtId && String(d.id) === String(tx.debtId)) || String(d.transactionId) === String(tx.id));
    if (debt && debt.customer) return String(debt.customer);
    const m = /Pelanggan:\s*([^|]+)/.exec(String(tx.notes || ''));
    return m ? m[1].trim() : '';
  }

  function isLockedTx(tx) {
    return tx.type === 'voucher' || tx.status === 'Hutang' || tx.payAccountId === 'Hutang' ||
      (appData.debtPayments || []).some((p) => String(p.transactionId) === String(tx.id));
  }

  // Satukan transaksi + pindah saldo menjadi satu daftar
  function buildEntries() {
    const filtered = S.preset !== 'all';
    const txs = filtered ? (S.txRows || []) : (appData.transactions || []);
    const trfs = filtered ? (S.trfRows || []) : (appData.balanceTransfers || []);
    const out = [];
    txs.forEach((tx) => out.push({ kind: 'tx', id: String(tx.id), date: tx.date, cat: txCategory(tx), tx }));
    trfs.forEach((t) => out.push({ kind: 'transfer', id: String(t.id), date: t.date, cat: 'pindah', t }));
    out.sort((a, b) => new Date(b.date) - new Date(a.date));
    return out;
  }

  function entryStatus(e) { return e.kind === 'tx' ? statusLabel(e.tx.status) : 'Berhasil'; }

  function searchText(e) {
    if (e.kind === 'transfer') {
      const t = e.t;
      return [t.id, t.notes, accName(t.from_account_id), accName(t.to_account_id), 'pindah saldo'].join(' ');
    }
    const tx = e.tx;
    const info = tarikInfo(tx);
    return [tx.id, tx.notes, customerOf(tx), serviceName(tx), txTypeLabel(tx.type), statusLabel(tx.status),
      accName(tx.accountId), accName(tx.payAccountId), info ? info.sender : ''].join(' ');
  }

  function applyFilters(entries) {
    const q = S.search;
    return entries.filter((e) => {
      if (S.type !== 'all' && e.cat !== S.type) return false;
      if (S.status !== 'all' && entryStatus(e) !== S.status) return false;
      if (q && !searchText(e).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  // ------------------------------------------
  // QUERY SUPABASE (filter tanggal di server)
  // ------------------------------------------
  async function fetchRange(table, start, endExcl, withUser) {
    const size = 1000;
    let from = 0;
    let all = [];
    for (;;) {
      let q = sb.from(table).select('*');
      // Data dibatasi per CABANG oleh aturan akses di database (RLS), bukan per user,
      // supaya karyawan melihat riwayat seluruh cabangnya.
      q = q.gte('date', start.toISOString()).lt('date', endExcl.toISOString())
        .order('date', { ascending: false }).order('id', { ascending: false })
        .range(from, from + size - 1);
      const { data, error } = await q;
      if (error) return { data: null, error };
      all = all.concat(data || []);
      if (!data || data.length < size) break;
      from += size;
    }
    return { data: all, error: null };
  }

  async function runFilter() {
    const range = getRange();
    S.dayKey = wibDayKey();
    S.shown = PAGE_STEP;
    if (!range) {
      S.txRows = null; S.trfRows = null; S.loading = false; S.error = false;
      renderFilterUi(); render();
      return;
    }
    const seq = ++S.seq; // abaikan hasil query lama bila filter sudah berganti
    S.loading = true;
    renderFilterUi(); render();

    try {
      const txRes = await fetchRange('transactions', range.start, range.endExcl, true);
      if (seq !== S.seq) return;
      if (txRes.error) throw txRes.error;
      // Pindah Saldo: tabel terpisah. Jika belum ada, Riwayat transaksi tetap tampil.
      let trf = [];
      try {
        const trfRes = await fetchRange('balance_transfers', range.start, range.endExcl, false);
        if (seq !== S.seq) return;
        if (!trfRes.error) trf = trfRes.data || [];
      } catch (e) { /* abaikan */ }
      S.txRows = txRes.data || [];
      S.trfRows = trf;
      S.error = false;
    } catch (err) {
      if (seq !== S.seq) return;
      console.error('Gagal memfilter transaksi:', err);
      S.txRows = []; S.trfRows = []; S.error = true;
      if (isAuthError(err)) {
        showNotification('Sesi login berakhir. Silakan masuk kembali.', 'error');
        setTimeout(handleLogout, 1500);
      } else {
        showNotification('Gagal memuat transaksi periode ini. Periksa koneksi lalu coba lagi.', 'error');
      }
    }
    S.loading = false;
    renderFilterUi(); render();
  }

  // ------------------------------------------
  // FILTER UI
  // ------------------------------------------
  function renderFilterUi() {
    document.querySelectorAll('#tx-filter-chips .tx-chip').forEach((chip) => {
      const r = chip.dataset.range;
      chip.classList.toggle('active', r === 'custom' ? (S.customOpen || S.preset === 'custom') : r === S.preset);
    });
    document.querySelectorAll('#tx-type-chips .tx-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.type === S.type);
    });
    const custom = $('tx-filter-custom');
    if (custom) custom.hidden = !S.customOpen;

    const activeEl = $('tx-filter-active');
    const textEl = $('tx-filter-active-text');
    if (activeEl && textEl) {
      const range = getRange();
      if (!range) {
        textEl.textContent = 'Menampilkan: Semua riwayat';
      } else {
        textEl.textContent = `${PRESET_LABELS[S.preset]} (${periodText(range)}) \u00b7 WIB`;
      }
      // tombol reset hanya berguna jika bukan default
      const clear = $('btn-tx-filter-clear');
      if (clear) clear.hidden = S.preset === 'today';
      activeEl.hidden = false;
    }
  }

  function refreshStatusOptions(entries) {
    const sel = $('tx-status-filter');
    if (!sel) return;
    const labels = new Set(['Berhasil', 'Hutang']);
    entries.forEach((e) => labels.add(entryStatus(e)));
    const html = '<option value="all">Semua Status</option>' +
      Array.from(labels).map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
    if (sel.dataset.sig !== html) {
      sel.dataset.sig = html;
      sel.innerHTML = html;
    }
    sel.value = labels.has(S.status) || S.status === 'all' ? S.status : 'all';
  }

  function selectRange(range) {
    if (range === 'all') {
      S.preset = 'all'; S.customOpen = false; S.txRows = null; S.trfRows = null;
      runFilter();
      return;
    }
    if (range === 'custom') {
      S.customOpen = true;
      const startEl = $('tx-filter-start');
      const endEl = $('tx-filter-end');
      const today = wibDayKey();
      if (startEl && !startEl.value) startEl.value = today;
      if (endEl && !endEl.value) endEl.value = today;
      renderFilterUi();
      return;
    }
    if (!PRESET_LABELS[range]) return;
    S.customOpen = false;
    S.preset = range;
    S.txRows = null; S.trfRows = null;
    runFilter();
  }

  function applyCustomRange() {
    const startEl = $('tx-filter-start');
    const endEl = $('tx-filter-end');
    let start = parseWibDateInput(startEl && startEl.value);
    let end = parseWibDateInput(endEl && endEl.value);
    if (!start && !end) { showNotification('Pilih tanggal mulai atau tanggal akhir terlebih dahulu.', 'error'); return; }
    if (!start) { start = end; startEl.value = endEl.value; }
    if (!end) { end = start; endEl.value = startEl.value; }
    if (start.getTime() > end.getTime()) { showNotification('Tanggal mulai tidak boleh setelah tanggal akhir.', 'error'); return; }
    S.preset = 'custom';
    S.customStart = start;
    S.customEndExcl = new Date(end.getTime() + 24 * 3600 * 1000);
    S.txRows = null; S.trfRows = null;
    S.customOpen = true;
    runFilter();
  }

  // Reset = kembali ke tampilan awal (hari ini)
  function resetFilters() {
    S.seq++;
    S.preset = 'today';
    S.customStart = null; S.customEndExcl = null;
    S.type = 'all'; S.status = 'all'; S.search = '';
    S.customOpen = false;
    S.txRows = null; S.trfRows = null;
    const s = $('search-tx-input'); if (s) s.value = '';
    const a = $('tx-filter-start'); if (a) a.value = '';
    const b = $('tx-filter-end'); if (b) b.value = '';
    runFilter();
  }

  // ------------------------------------------
  // RENDER DAFTAR
  // ------------------------------------------
  function rowHtml(e) {
    const id = escapeHtml(e.id);
    const dateTxt = escapeHtml(fmtDateTime(e.date));
    const status = entryStatus(e);
    const debtBadge = status === 'Hutang' ? ' <span class="badge-debt">Hutang</span>' : '';

    const actions = (printable) => `
      <div class="tx-action-btns">
        <button type="button" class="btn-detail" data-act="detail" title="Detail"><i class="fa-solid fa-eye"></i></button>
        <button type="button" class="btn-edit" data-act="edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
        ${printable ? '<button type="button" class="btn-receipt" data-act="print" title="Cetak struk"><i class="fa-solid fa-print"></i></button>' : ''}
        <button type="button" class="btn-delete" data-act="delete" title="Hapus"><i class="fa-solid fa-trash-can"></i></button>
      </div>`;

    if (e.kind === 'transfer') {
      const t = e.t;
      const note = `${accName(t.from_account_id)} \u2192 ${accName(t.to_account_id)}` + (t.notes ? ` \u00b7 ${t.notes}` : '');
      return `
        <tr data-kind="transfer" data-id="${id}">
          <td style="text-align:center;"><span class="tx-check-spacer"></span></td>
          <td><strong style="color:#38bdf8; font-size:11px; display:block;">${escapeHtml(String(t.id).toUpperCase())}</strong>
            <span style="font-size:10px; color:var(--text-muted);">${dateTxt}</span></td>
          <td>Owner</td>
          <td>${escapeHtml(accName(t.from_account_id))}</td>
          <td>Pindah Saldo</td>
          <td><div class="tx-ket" title="${escapeHtml(note)}">${escapeHtml(note)}</div></td>
          <td style="text-align:right; font-weight:600; color:#34d399;">${rp(t.amount)}</td>
          <td style="text-align:right; color:var(--text-muted);">-</td>
          <td style="text-align:right; color:var(--text-muted);">-</td>
          <td>${actions(false)}</td>
        </tr>`;
    }

    const tx = e.tx;
    const cost = tx.cost_price !== null && tx.cost_price !== undefined ? tx.cost_price : tx.amount;
    const note = tx.notes || '';
    return `
      <tr data-kind="tx" data-id="${id}">
        <td style="text-align:center;"><input type="checkbox" class="tx-checkbox" value="${id}"></td>
        <td><strong style="color:#38bdf8; font-size:11px; display:block;">${escapeHtml(String(tx.id).toUpperCase())}</strong>
          <span style="font-size:10px; color:var(--text-muted);">${dateTxt}</span></td>
        <td>Owner</td>
        <td>${escapeHtml(accName(tx.accountId))}</td>
        <td>${escapeHtml(txTypeLabel(tx.type))}</td>
        <td><div class="tx-ket" title="${escapeHtml(note)}">${escapeHtml(note)}</div>${debtBadge}</td>
        <td style="text-align:right; font-weight:600; color:#34d399;">${rp(tx.admin_fee)}</td>
        <td style="text-align:right; color:var(--text-muted);">${rp(cost)}</td>
        <td style="text-align:right; font-weight:600; color:${num(tx.profit) >= 0 ? '#34d399' : '#f87171'};">${rp(tx.profit)}</td>
        <td>${actions(true)}</td>
      </tr>`;
  }

  function render() {
    const listEl = $('tx-list');
    const countEl = $('tx-count-label');
    const moreBtn = $('btn-tx-more');
    if (!listEl) return;

    const filtered = S.preset !== 'all';
    if (filtered && S.txRows === null) {
      if (countEl) countEl.textContent = 'Memuat data...';
      listEl.innerHTML = '<tr><td colspan="10" class="empty-state" style="text-align:center; padding:24px;">Memuat transaksi...</td></tr>';
      if (moreBtn) moreBtn.hidden = true;
      return;
    }

    const base = buildEntries();
    refreshStatusOptions(base);
    const entries = applyFilters(base);

    const checkAll = $('tx-check-all');
    if (checkAll) checkAll.checked = false;

    if (countEl) countEl.textContent = `Menampilkan total ${entries.length} data`;

    if (entries.length === 0) {
      let msg;
      if (S.error) msg = 'Gagal memuat transaksi periode ini. Coba pilih filter lagi.';
      else if (S.search || S.type !== 'all' || S.status !== 'all') msg = 'Tidak ada transaksi yang cocok dengan filter / pencarian.';
      else if (S.preset === 'today') msg = 'Belum ada transaksi hari ini. Pilih filter tanggal untuk melihat riwayat sebelumnya.';
      else msg = filtered ? 'Tidak ada transaksi pada periode ini.' : 'Belum ada transaksi tercatat.';
      listEl.innerHTML = `<tr><td colspan="10" class="empty-state" style="text-align:center; padding:24px;">${escapeHtml(msg)}</td></tr>`;
      if (moreBtn) moreBtn.hidden = true;
      return;
    }

    listEl.innerHTML = entries.slice(0, S.shown).map(rowHtml).join('');
    if (moreBtn) {
      moreBtn.hidden = entries.length <= S.shown;
      moreBtn.textContent = `Tampilkan lebih banyak (${entries.length - S.shown} lagi)`;
    }
  }

  // ------------------------------------------
  // DETAIL
  // ------------------------------------------
  function detailRows(e) {
    const rows = [];
    const add = (k, v, cls) => {
      if (v === null || v === undefined || v === '' || v === '-') return; // jangan tampilkan kolom kosong
      rows.push({ k, v: String(v), cls: cls || '' });
    };

    if (e.kind === 'transfer') {
      const t = e.t;
      add('ID Transaksi', String(t.id).toUpperCase());
      add('Jenis Transaksi', 'Pindah Saldo');
      add('Tanggal & Waktu', fmtDateTime(t.date) + ' WIB');
      add('Aplikasi Pengirim', accName(t.from_account_id));
      add('Aplikasi Penerima', accName(t.to_account_id));
      add('Nominal Transaksi', rp(t.amount));
      if (num(t.admin_fee) > 0) add('Biaya Admin', rp(t.admin_fee));
      add('Status', 'Berhasil');
      add('Keterangan', t.notes, 'long');
      return rows;
    }

    const tx = e.tx;
    const info = tarikInfo(tx);
    add('ID Transaksi', String(tx.id).toUpperCase());
    add('Jenis Transaksi', info ? `Tarik Tunai (${info.typeLabel})` : (CATEGORY[e.cat].label + (e.cat === 'layanan' ? ` - ${serviceName(tx)}` : '')));
    add('Tanggal & Waktu', fmtDateTime(tx.date) + ' WIB');
    add('Nama Pelanggan', customerOf(tx));

    if (info) {
      add('Aplikasi Pengirim', info.sender);
      add('Aplikasi Penerima', accName(tx.payAccountId));
      add('Kas Fisik', accName(tx.accountId));
      add('Nominal Transaksi', rp(info.nominal));
      add('Biaya Admin', rp(info.admin));
      add('Saldo Diterima', rp(info.received));
      add('Cash Diberikan', rp(info.cash));
    } else if (tx.type === 'voucher') {
      add('Pembayaran Lewat', accName(tx.payAccountId));
      add('Sumber Modal', accName(tx.accountId));
      if (num(tx.quantity) > 0) add('Jumlah Barang', String(tx.quantity));
      add('Total Penjualan', rp(tx.admin_fee));
      add('Modal', rp(tx.cost_price !== null && tx.cost_price !== undefined ? tx.cost_price : tx.amount));
    } else {
      add('Aplikasi Pengirim', accName(tx.accountId));
      add('Aplikasi Penerima', accName(tx.payAccountId));
      add('Nominal Transaksi', rp(tx.admin_fee));
      add('Harga Modal', rp(tx.cost_price !== null && tx.cost_price !== undefined ? tx.cost_price : tx.amount));
    }
    add('Keuntungan', rp(tx.profit), num(tx.profit) >= 0 ? 'pos' : 'neg');
    add('Status', statusLabel(tx.status));
    add('Keterangan', tx.notes, 'long');
    return rows;
  }

  function openDetail(kind, id) {
    const e = buildEntries().find((x) => x.kind === kind && x.id === String(id));
    if (!e) return;
    const rows = detailRows(e).map((r) =>
      `<div class="tx-detail-row ${r.cls}"><span>${escapeHtml(r.k)}</span><strong>${escapeHtml(r.v)}</strong></div>`).join('');
    const modal = createModal('tx-detail-modal', `
      <div class="app-modal-head" style="color:#34d399;"><i class="fa-solid fa-receipt"></i><h3>Detail Transaksi</h3></div>
      <div class="tx-detail-list">${rows}</div>
      <div class="app-modal-actions">
        <button type="button" class="app-btn-ghost" data-close>Tutup</button>
        <button type="button" class="app-btn-solid" data-edit style="background:#17A897;"><i class="fa-solid fa-pen"></i> Edit</button>
      </div>`, 'rgba(52,211,153,0.4)');
    modal.querySelector('[data-close]').onclick = () => modal.remove();
    modal.querySelector('[data-edit]').onclick = () => { modal.remove(); openEdit(kind, id); };
  }

  // ------------------------------------------
  // EDIT
  // ------------------------------------------
  // Promise<boolean>: true bila pengguna menekan "Ya, Lanjutkan"; false untuk Batal / tutup dialog
  function confirmAsync(title, message) {
    return new Promise((resolve) => {
      let done = false;
      let observer = null;
      const finish = (v) => { if (done) return; done = true; if (observer) observer.disconnect(); resolve(v); };
      showConfirm(title, message, () => finish(true), false);
      const modal = document.getElementById('custom-confirm-modal');
      observer = new MutationObserver(() => { if (!document.body.contains(modal)) finish(false); });
      observer.observe(document.body, { childList: true });
    });
  }

  function accountOptions2(withEmpty) {
    const head = withEmpty ? [{ value: '', label: '-- Pilih --' }] : [];
    return head.concat((appData.accounts || []).map((a) => ({ value: String(a.id), label: `${a.name} - Saldo: ${rp(a.balance)}` })));
  }

  // Dampak saldo sebuah transaksi (sama dengan saat dibuat): sumber -amount, penerima +admin_fee
  function balanceEffects(src, pay, amount, fee) {
    const m = new Map();
    const add = (id, d) => { if (id && id !== 'Hutang') m.set(String(id), (m.get(String(id)) || 0) + d); };
    add(src, -num(amount));
    add(pay, num(fee));
    return m;
  }

  // Selisih saldo = dampak baru - dampak lama (yang akan benar-benar diubah di database)
  function diffEffects(oldTx, next) {
    const oldE = balanceEffects(oldTx.accountId, oldTx.payAccountId, oldTx.amount, oldTx.admin_fee);
    const newE = balanceEffects(next.src, next.pay, next.amount, next.fee);
    const out = new Map();
    new Set([...oldE.keys(), ...newE.keys()]).forEach((k) => {
      const d = (newE.get(k) || 0) - (oldE.get(k) || 0);
      if (d !== 0) out.set(k, d);
    });
    return out;
  }

  function effectsText(diff) {
    if (diff.size === 0) return 'Saldo rekening tidak berubah.';
    return 'Saldo dikoreksi: ' + Array.from(diff.entries())
      .map(([id, d]) => `${accName(id)} ${d > 0 ? '+' : '-'}${rp(Math.abs(d))}`).join(', ') + '.';
  }

  // Peringatan (bukan blokir) bila hasil edit membuat saldo minus - sama seperti saat input transaksi
  async function confirmNegative(diff) {
    for (const [id, d] of diff.entries()) {
      if (d >= 0) continue;
      const acc = findAccount(id);
      if (!(await confirmLowBalance(acc, -d))) return false;
    }
    return true;
  }

  async function callEdit(txId, patch) {
    try {
      const { error } = await sb.rpc('nx_edit_transaction', { p_id: String(txId), p_patch: patch });
      if (error) throw error;
    } catch (err) {
      console.error('nx_edit_transaction gagal:', err);
      const msg = String((err && err.message) || err || '') + ' ' + String((err && err.code) || '');
      if (/could not find the function|schema cache|PGRST202|42883/i.test(msg)) {
        showNotification('Fungsi edit belum dipasang. Jalankan sql/nexora_riwayat_edit.sql di Supabase SQL Editor.', 'error');
      } else {
        showNotification('Gagal menyimpan perubahan, tidak ada data yang berubah: ' + ((err && err.message) || err), 'error');
      }
      return false;
    }
    await fetchCloudData();   // muat ulang transaksi + saldo dari server (sumber kebenaran)
    refreshAllViews();
    return true;
  }

  // Validasi langsung di modal edit: tampilkan pesan, matikan tombol simpan
  function wireEditGuard(getMessage) {
    const modal = document.getElementById('custom-form-modal');
    if (!modal) return;
    const sync = () => {
      const msg = getMessage();
      const err = modal.querySelector('#fm-error');
      const btn = modal.querySelector('#fm-submit');
      if (err) err.textContent = msg;
      if (btn) btn.disabled = !!msg;
    };
    modal.addEventListener('change', sync);
    modal.addEventListener('input', sync);
    sync();
    return sync;
  }
  const fmVal = (id) => { const el = document.getElementById(`fm-${id}`); return el ? el.value : ''; };

  function openEdit(kind, id) {
    if (kind === 'transfer') {
      if (typeof openEditTransfer === 'function') openEditTransfer(id);
      return;
    }
    const tx = (appData.transactions || []).find((t) => String(t.id) === String(id));
    if (!tx) { showNotification('Transaksi tidak ditemukan. Muat ulang halaman.', 'error'); return; }

    if (isLockedTx(tx)) return openEditLimited(tx);
    if (tarikInfo(tx)) return openEditTarikTunai(tx);
    return openEditGeneric(tx);
  }

  // --- Kasir / Hutang: hanya tanggal & keterangan ---
  function openEditLimited(tx) {
    showFormModal({
      title: 'Edit Transaksi',
      icon: 'fa-solid fa-pen-to-square',
      submitText: 'Simpan Perubahan',
      fields: [
        { type: 'info', text: 'Transaksi Kasir / Hutang terikat stok dan catatan hutang, sehingga hanya tanggal dan keterangan yang bisa diubah. Untuk mengubah nominal atau akun, hapus lalu input ulang.' },
        { id: 'date', label: 'Tanggal & Waktu', type: 'datetime', value: toLocalInput(tx.date) },
        { id: 'notes', label: 'Keterangan', type: 'text', value: tx.notes || '' }
      ],
      onSubmit: async (v) => {
        if (!(await confirmAsync('Simpan Perubahan', 'Simpan perubahan tanggal / keterangan transaksi ini?'))) return false;
        const ok = await callEdit(tx.id, { date: v.date ? new Date(v.date).toISOString() : tx.date, notes: v.notes });
        if (!ok) return false;
        showNotification('Transaksi berhasil diperbarui!', 'success');
      }
    });
  }

  // --- Tarik Tunai (Admin Luar / Admin Dalam) ---
  function openEditTarikTunai(tx) {
    const info = tarikInfo(tx);
    const rawNotes = String(tx.notes || '');
    const arrow = rawNotes.indexOf('\u2192');
    const cut = arrow >= 0 ? rawNotes.indexOf(') - ', arrow) : -1;
    const extra = cut >= 0 ? rawNotes.slice(cut + 4) : '';

    showFormModal({
      title: 'Edit Tarik Tunai',
      icon: 'fa-solid fa-hand-holding-dollar',
      submitText: 'Simpan Perubahan',
      fields: [
        { id: 'date', label: 'Tanggal & Waktu', type: 'datetime', value: toLocalInput(tx.date) },
        { id: 'customer', label: 'Nama Pelanggan', type: 'text', value: info.customer === '-' ? '' : info.customer, required: true },
        { id: 'sender', label: 'Aplikasi Pengirim (Pelanggan)', type: 'text', value: info.sender === '-' ? '' : info.sender, required: true },
        { id: 'receiver', label: 'Aplikasi Penerima (Milik Agen)', type: 'select', value: String(tx.payAccountId), options: accountOptions2(true), required: true },
        { id: 'cash', label: 'Kas Fisik', type: 'select', value: String(tx.accountId), options: accountOptions2(true), required: true },
        { id: 'nominal', label: 'Nominal Tarik Tunai (Rp)', type: 'number', value: info.nominal, required: true },
        { id: 'adminType', label: 'Jenis Admin', type: 'select', value: info.type, options: [{ value: 'luar', label: 'Admin Luar' }, { value: 'dalam', label: 'Admin Dalam' }], required: true },
        { id: 'admin', label: 'Biaya Admin (Rp)', type: 'number', value: info.admin, required: true, allowZero: true },
        { id: 'notes', label: 'Keterangan Tambahan', type: 'text', value: extra }
      ],
      onSubmit: async (v) => {
        const f = { customer: v.customer, sender: v.sender, receiverId: v.receiver, cashId: v.cash, nominal: v.nominal, admin: v.admin, type: v.adminType };
        const msg = validateTarikTunai(f, true);
        if (msg) { showNotification(msg, 'error'); return false; }
        const recv = findAccount(v.receiver);
        const cash = findAccount(v.cash);
        if (!recv || !cash) { showNotification('Akun penerima / kas fisik tidak ditemukan.', 'error'); return false; }

        const c = calcTarikTunai(f.nominal, f.admin, f.type);   // hitung ulang semua komponen
        if (c.cash < 0 || c.received <= 0 || c.profit < 0) { showNotification('Perhitungan tidak valid. Periksa nominal dan biaya admin.', 'error'); return false; }

        const diff = diffEffects(tx, { src: cash.id, pay: recv.id, amount: c.cash, fee: c.received });
        if (!(await confirmNegative(diff))) return false;
        const label = f.type === 'dalam' ? 'Admin Dalam' : 'Admin Luar';
        const ok0 = await confirmAsync('Simpan Perubahan',
          `Nominal ${rp(c.nominal)}, admin ${rp(c.admin)}, saldo diterima ${rp(c.received)}, cash ${rp(c.cash)}, untung ${rp(c.profit)}. ${effectsText(diff)} Lanjutkan?`);
        if (!ok0) return false;

        const notes = `Tarik Tunai [${label}] ${v.customer} (${v.sender} \u2192 ${recv.name})` + (v.notes ? ` - ${v.notes}` : '');
        const ok = await callEdit(tx.id, {
          date: v.date ? new Date(v.date).toISOString() : tx.date,
          notes,
          account_id: String(cash.id),
          pay_account_id: String(recv.id),
          amount: c.cash,
          admin_fee: c.received,
          customer_name: v.customer,
          sender_app: v.sender,
          admin_type: f.type,
          withdraw_amount: c.nominal,
          admin_amount: c.admin
        });
        if (!ok) return false;
        showNotification('Transaksi diperbarui dan saldo dikoreksi!', 'success');
        setTimeout(() => guardSync && guardSync(), 0);
      }
    });
    var guardSync = wireEditGuard(() => {
      const sender = fmVal('sender').trim();
      const msg = validateTarikTunai({
        customer: '', sender, receiverId: fmVal('receiver'), cashId: fmVal('cash'),
        nominal: parseMoney(fmVal('nominal')), admin: parseMoney(fmVal('admin')), type: fmVal('adminType')
      }, false);
      return msg;
    });
  }

  // --- Tarik/Setor lain & PPOB: akun sumber, penerima, modal, harga jual ---
  function openEditGeneric(tx) {
    const isPpob = tx.type === 'ppob';
    const oldSrcName = accName(tx.accountId);
    showFormModal({
      title: isPpob ? 'Edit Transaksi PPOB' : 'Edit Transaksi Tarik / Setor',
      icon: 'fa-solid fa-pen-to-square',
      submitText: 'Simpan Perubahan',
      fields: [
        { id: 'date', label: 'Tanggal & Waktu', type: 'datetime', value: toLocalInput(tx.date) },
        { id: 'source', label: 'Aplikasi Sumber', type: 'select', value: String(tx.accountId), options: accountOptions2(true), required: true },
        { id: 'receiver', label: 'Aplikasi Penerima', type: 'select', value: String(tx.payAccountId), options: accountOptions2(true), required: true },
        { id: 'modal', label: 'Harga Modal (Rp)', type: 'number', value: num(tx.amount), required: true, allowZero: true },
        { id: 'jual', label: 'Harga Jual (Rp)', type: 'number', value: num(tx.admin_fee), required: true },
        { id: 'notes', label: 'Keterangan', type: 'text', value: tx.notes || '' }
      ],
      onSubmit: async (v) => {
        const pair = NxValidation.validateAccountPair(v.source, v.receiver);
        if (!pair.ok) { showNotification(pair.message, 'error'); return false; }
        const src = findAccount(v.source);
        const recv = findAccount(v.receiver);
        if (!src || !recv) { showNotification('Pilih akun yang valid!', 'error'); return false; }

        const diff = diffEffects(tx, { src: src.id, pay: recv.id, amount: v.modal, fee: v.jual });
        if (!(await confirmNegative(diff))) return false;
        const profit = v.jual - v.modal;
        const ok0 = await confirmAsync('Simpan Perubahan',
          `Modal ${rp(v.modal)}, harga jual ${rp(v.jual)}, untung ${rp(profit)}. ${effectsText(diff)} Lanjutkan?`);
        if (!ok0) return false;

        // Nama aplikasi sumber di keterangan otomatis ikut diganti bila akun sumber diubah
        let notes = v.notes;
        if (!isPpob && oldSrcName !== '-' && String(src.id) !== String(tx.accountId)) {
          notes = notes.split(`(${oldSrcName})`).join(`(${src.name})`);
        }
        const ok = await callEdit(tx.id, {
          date: v.date ? new Date(v.date).toISOString() : tx.date,
          notes,
          account_id: String(src.id),
          pay_account_id: String(recv.id),
          amount: v.modal,
          admin_fee: v.jual
        });
        if (!ok) return false;
        showNotification('Transaksi diperbarui dan saldo dikoreksi!', 'success');
        setTimeout(() => guardSync2 && guardSync2(), 0);
      }
    });
    var guardSync2 = wireEditGuard(() => {
      const r = NxValidation.validateAccountPair(fmVal('source'), fmVal('receiver'));
      return r.ok ? '' : r.message;
    });
  }


  // Gaya Riwayat disisipkan lewat JS (tidak bergantung cache style.css)
  function injectStyles() {
    if (document.getElementById('nx-history-style')) return;
    const st = document.createElement('style');
    st.id = 'nx-history-style';
    st.textContent = `
      .tx-search-card { padding: 12px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 10px; }
      .tx-search-card .glass-input { width: 100%; }
      .tx-more { width: 100%; justify-content: center; margin: 12px 0 16px; font-size: 12px; }
      .tx-more[hidden] { display: none; }
      .tx-check-spacer { display: inline-block; width: 14px; }
      /* Keterangan dipendekkan: maksimal 2 baris, sisanya "..." (teks asli tetap di database & Detail) */
      .tx-ket { width: 220px; max-width: 220px; white-space: normal; line-height: 1.4; font-size: 12px;
        display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden; overflow-wrap: anywhere; word-break: break-word; }
      .tx-action-btns button.btn-detail { color: #38bdf8; background: rgba(56,189,248,.12); }
      .tx-action-btns button.btn-edit { color: #fbbf24; background: rgba(251,191,36,.12); }
      .tx-detail-list { display: flex; flex-direction: column; max-height: 60vh; overflow-y: auto; margin: 6px 0 14px; }
      .tx-detail-row { display: flex; justify-content: space-between; gap: 14px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 12px; }
      .tx-detail-row span { color: var(--text-muted); flex-shrink: 0; }
      .tx-detail-row strong { text-align: right; min-width: 0; overflow-wrap: anywhere; word-break: break-word; font-weight: 600; }
      .tx-detail-row.pos strong { color: #34d399; }
      .tx-detail-row.neg strong { color: #f87171; }
      .tx-detail-row.long { flex-direction: column; gap: 4px; }
      .tx-detail-row.long strong { text-align: left; font-weight: 500; white-space: pre-wrap; }
    `;
    document.head.appendChild(st);
  }

  // ------------------------------------------
  // EVENT
  // ------------------------------------------
  function bind() {
    injectStyles();
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

    on('search-tx-input', 'input', (e) => { S.search = e.target.value.trim().toLowerCase(); S.shown = PAGE_STEP; render(); });
    on('tx-status-filter', 'change', (e) => { S.status = e.target.value; S.shown = PAGE_STEP; render(); });

    const dateChips = $('tx-filter-chips');
    if (dateChips) dateChips.addEventListener('click', (e) => { const c = e.target.closest('[data-range]'); if (c) selectRange(c.dataset.range); });
    const typeChips = $('tx-type-chips');
    if (typeChips) typeChips.addEventListener('click', (e) => {
      const c = e.target.closest('[data-type]');
      if (!c) return;
      S.type = c.dataset.type; S.shown = PAGE_STEP; renderFilterUi(); render();
    });

    on('btn-tx-filter-apply', 'click', applyCustomRange);
    on('btn-tx-filter-reset', 'click', resetFilters);
    on('btn-tx-filter-clear', 'click', resetFilters);
    on('btn-tx-more', 'click', () => { S.shown += PAGE_STEP; render(); });
    on('tx-check-all', 'change', (e) => {
      document.querySelectorAll('#tx-list .tx-checkbox').forEach((cb) => { cb.checked = e.target.checked; });
    });

    const list = $('tx-list');
    if (list) list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      const card = e.target.closest('tr[data-id]');
      if (!btn || !card) return;
      const kind = card.dataset.kind;
      const id = card.dataset.id;
      switch (btn.dataset.act) {
        case 'detail': openDetail(kind, id); break;
        case 'edit': openEdit(kind, id); break;
        case 'print': printReceipts([id]); break;
        case 'delete':
          if (kind === 'transfer') { if (typeof deleteTransfer === 'function') deleteTransfer(id); } else deleteTransaction(id);
          break;
        default: break;
      }
    });

    // Ganti hari (00:00 WIB) -> filter relatif (Hari ini, Kemarin, ...) otomatis diperbarui
    const checkRollover = () => {
      const key = wibDayKey();
      if (key === S.dayKey) return;
      S.dayKey = key;
      if (S.preset !== 'all' && S.preset !== 'custom') {
        const page = $('page-transactions');
        if (page && page.classList.contains('active')) runFilter();
        else { S.txRows = null; S.trfRows = null; }
      }
    };
    setInterval(checkRollover, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkRollover(); });
  }

  // ------------------------------------------
  // PENDAFTARAN KE APLIKASI
  // ------------------------------------------
  function loadPage() {
    renderFilterUi();
    if (S.preset === 'all') render();
    else runFilter();   // selalu muat ulang dari database (mis. setelah tambah / edit / hapus)
  }

  window.loadTransactionsPage = loadPage;
  window.renderFullTransactionsList = render;
  window.resetTxFilter = resetFilters;
  window.selectTxRange = selectRange;
  PAGE_LOADERS.transactions = loadPage;

  document.addEventListener('DOMContentLoaded', bind);

  // Dipakai pengujian
  window.NxHistory = { wibStart, wibDayKey, getRange, txCategory, diffEffects, state: S };
})();
