// ==========================================
// NEXORA - MUTASI REKENING (BUKU MUTASI)
//
// Menampilkan catatan setiap saldo rekening berubah (tabel account_ledger).
// Tabel itu ditulis OTOMATIS oleh trigger di database (lihat sql/nexora_atomik_mutasi.sql),
// jadi halaman ini hanya MEMBACA. Tidak mengubah saldo, transaksi, maupun logika lain.
//
// Dimuat setelah app.js (memakai: sb, appData, PAGE_LOADERS, findAccount, accountOptions,
// setSelectOptions, formatRupiah, escapeHtml, showNotification, localDateKey).
// ==========================================
(function () {
  'use strict';

  const MAX_ROWS = 1000;   // batas baris yang dimuat sekali tarik
  const PAGE_STEP = 100;   // jumlah baris yang ditampilkan per "Tampilkan lebih banyak"

  const KIND_LABEL = {
    tarik_setor: 'Tarik / Setor',
    ppob: 'PPOB',
    voucher: 'Penjualan Kasir',
    transaksi: 'Transaksi',
    hapus_transaksi: 'Transaksi dihapus (dikembalikan)',
    edit_transaksi: 'Transaksi diedit (saldo dikoreksi)',
    bayar_hutang: 'Pembayaran hutang',
    pengeluaran: 'Pengeluaran',
    prive: 'Prive (ambil pribadi)',
    hapus_pengeluaran: 'Pengeluaran dihapus (dikembalikan)',
    akun_baru: 'Rekening baru',
    penyesuaian: 'Penyesuaian saldo',
    saldo_awal: 'Saldo awal',
    pindah_saldo: 'Pindah saldo',
    pindah_saldo_edit: 'Pindah saldo (diedit)',
    pindah_saldo_batal: 'Pindah saldo (dibatalkan)',
    komisi: 'Fee & komisi',
    komisi_edit: 'Fee & komisi (diedit)',
    komisi_batal: 'Fee & komisi (dibatalkan)',
    hitung_kas: 'Hitung kas (kalkulator)',
    lainnya: 'Perubahan lain'
  };

  let rows = [];          // baris yang sudah dimuat (terbaru di atas)
  let shown = PAGE_STEP;  // jumlah baris yang ditampilkan
  let latestAfter = null; // saldo_setelah dari mutasi terakhir (semua waktu) untuk cek sinkron
  let capped = false;     // true jika data lebih banyak dari MAX_ROWS
  let tableMissing = false;
  let requestId = 0;
  let bound = false;

  const $ = (id) => document.getElementById(id);

  function isActive() {
    const page = $('page-ledger');
    return !!(page && page.classList.contains('active'));
  }

  function periodStart(value) {
    const now = new Date();
    if (value === 'all') return null;
    if (value === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    const days = parseInt(value, 10) || 30;
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - (days - 1));
    return d;
  }

  function periodLabel(value) {
    if (value === 'all') return 'semua waktu';
    if (value === 'month') return 'bulan ini';
    return `${parseInt(value, 10) || 30} hari terakhir`;
  }

  function fmtDate(value) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function isMissingTable(err) {
    const msg = String((err && err.message) || '') + ' ' + String((err && err.code) || '');
    return /42P01|PGRST205|does not exist|schema cache|Could not find the table/i.test(msg);
  }

  // ---------- Pilihan rekening ----------

  function fillAccountSelect() {
    const sel = $('ledger-account');
    if (!sel) return;
    const keep = sel.value;
    setSelectOptions(sel, accountOptions('-- Pilih Rekening --', false, false));
    if (!sel.value) {
      const wanted = keep && findAccount(keep) ? keep : (appData.accounts[0] ? String(appData.accounts[0].id) : '');
      if (wanted) sel.value = wanted;
    }
  }

  // ---------- Muat data ----------

  async function loadLedger() {
    const sel = $('ledger-account');
    const periodSel = $('ledger-period');
    if (!sel || !periodSel) return;

    const accId = sel.value;
    const listEl = $('ledger-list');
    if (!accId) {
      rows = [];
      latestAfter = null;
      render();
      return;
    }

    const myRequest = ++requestId;
    if (listEl) listEl.innerHTML = '<p class="empty-state">Memuat mutasi...</p>';

    const since = periodStart(periodSel.value);
    let query = sb.from('account_ledger').select('*')
      .eq('account_id', String(accId))
      .order('seq', { ascending: false })
      .limit(MAX_ROWS);
    if (since) query = query.gte('date', since.toISOString());

    const latestQuery = sb.from('account_ledger').select('balance_after, seq')
      .eq('account_id', String(accId))
      .order('seq', { ascending: false })
      .limit(1);

    try {
      const [listRes, latestRes] = await Promise.all([query, latestQuery]);
      if (myRequest !== requestId) return; // pilihan sudah berganti, abaikan hasil lama

      const err = listRes.error || latestRes.error;
      if (err) throw err;

      tableMissing = false;
      rows = listRes.data || [];
      capped = rows.length >= MAX_ROWS;
      latestAfter = latestRes.data && latestRes.data.length ? Number(latestRes.data[0].balance_after) : null;
      shown = PAGE_STEP;
      render();
    } catch (err) {
      if (myRequest !== requestId) return;
      console.error('Gagal memuat mutasi:', err);
      rows = [];
      latestAfter = null;
      tableMissing = isMissingTable(err);
      render();
      if (!tableMissing) showNotification('Gagal memuat mutasi: ' + ((err && err.message) || err), 'error');
    }
  }

  // ---------- Tampilan ----------

  function renderSummary() {
    const box = $('ledger-summary');
    if (!box) return;

    const acc = findAccount($('ledger-account').value);
    const masuk = rows.filter((r) => Number(r.delta) > 0).reduce((s, r) => s + Number(r.delta), 0);
    const keluar = rows.filter((r) => Number(r.delta) < 0).reduce((s, r) => s + Math.abs(Number(r.delta)), 0);

    let syncHtml;
    if (!acc) {
      syncHtml = '<strong>-</strong>';
    } else if (latestAfter === null) {
      const zero = Number(acc.balance || 0) === 0;
      syncHtml = zero
        ? '<strong>Belum ada mutasi</strong><p class="ledger-sub">Saldo rekening Rp 0.</p>'
        : '<strong class="ledger-warn">Belum tercatat</strong><p class="ledger-sub">Saldo ada, tetapi belum ada mutasi di buku.</p>';
    } else {
      const diff = Number(acc.balance || 0) - latestAfter;
      syncHtml = diff === 0
        ? '<strong class="ledger-ok"><i class="fa-solid fa-circle-check"></i> Sinkron</strong><p class="ledger-sub">Saldo sama dengan mutasi terakhir.</p>'
        : `<strong class="ledger-warn"><i class="fa-solid fa-triangle-exclamation"></i> Selisih ${formatRupiah(Math.abs(diff))}</strong><p class="ledger-sub">Saldo ${diff > 0 ? 'lebih besar' : 'lebih kecil'} dari mutasi terakhir. Muat ulang aplikasi.</p>`;
    }

    box.innerHTML = `
      <div class="ledger-card"><small>Saldo Saat Ini</small><strong>${acc ? formatRupiah(acc.balance) : '-'}</strong></div>
      <div class="ledger-card"><small>Status</small>${syncHtml}</div>
      <div class="ledger-card"><small>Uang Masuk</small><strong class="ledger-in-text">+${formatRupiah(masuk)}</strong></div>
      <div class="ledger-card"><small>Uang Keluar</small><strong class="ledger-out-text">-${formatRupiah(keluar)}</strong></div>
    `;
  }

  function rowHtml(r) {
    const delta = Number(r.delta) || 0;
    const isIn = delta >= 0;
    const label = KIND_LABEL[r.kind] || r.kind || 'Perubahan';
    return `
      <div class="ledger-row">
        <div class="ledger-ic ${isIn ? 'in' : 'out'}"><i class="fa-solid ${isIn ? 'fa-arrow-down' : 'fa-arrow-up'}"></i></div>
        <div class="ledger-main">
          <strong>${escapeHtml(label)}</strong>
          ${r.note ? `<span class="ledger-note">${escapeHtml(r.note)}</span>` : ''}
          <small>${escapeHtml(fmtDate(r.date))}</small>
        </div>
        <div class="ledger-amt">
          <b class="${isIn ? 'ledger-in-text' : 'ledger-out-text'}">${isIn ? '+' : '-'}${formatRupiah(Math.abs(delta))}</b>
          <small>Saldo ${formatRupiah(r.balance_after)}</small>
        </div>
      </div>`;
  }

  function render() {
    renderSummary();

    const listEl = $('ledger-list');
    const moreBtn = $('btn-ledger-more');
    if (!listEl) return;

    if (tableMissing) {
      listEl.innerHTML = '<p class="empty-state">Buku mutasi belum aktif.<br>Jalankan <b>sql/nexora_atomik_mutasi.sql</b> di Supabase SQL Editor.</p>';
      if (moreBtn) moreBtn.hidden = true;
      return;
    }

    if (!$('ledger-account').value) {
      listEl.innerHTML = '<p class="empty-state">Belum ada rekening. Tambahkan dulu di Balance Mgmt.</p>';
      if (moreBtn) moreBtn.hidden = true;
      return;
    }

    if (rows.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Belum ada mutasi untuk ${escapeHtml(periodLabel($('ledger-period').value))}.</p>`;
      if (moreBtn) moreBtn.hidden = true;
      return;
    }

    const visible = rows.slice(0, shown);
    let html = visible.map(rowHtml).join('');
    if (capped) {
      html += `<p class="empty-state" style="font-size:11px;">Menampilkan ${MAX_ROWS} mutasi terbaru. Persempit periode untuk melihat yang lebih lama.</p>`;
    }
    listEl.innerHTML = html;

    if (moreBtn) {
      moreBtn.hidden = rows.length <= shown;
      moreBtn.textContent = `Tampilkan lebih banyak (${rows.length - shown} lagi)`;
    }
  }

  // ---------- Export Excel ----------

  function exportExcel() {
    if (typeof XLSX === 'undefined') {
      showNotification('Library Excel belum termuat. Periksa koneksi internet.', 'error');
      return;
    }
    if (rows.length === 0) {
      showNotification('Tidak ada mutasi untuk diexport.', 'error');
      return;
    }
    const acc = findAccount($('ledger-account').value);
    const data = [...rows].reverse().map((r) => {
      const delta = Number(r.delta) || 0;
      return {
        'Tanggal': fmtDate(r.date),
        'Jenis': KIND_LABEL[r.kind] || r.kind || '',
        'Keterangan': r.note || '',
        'Masuk': delta > 0 ? delta : 0,
        'Keluar': delta < 0 ? Math.abs(delta) : 0,
        'Saldo Setelah': Number(r.balance_after) || 0
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mutasi');
    const safeName = String(acc ? acc.name : 'Rekening').replace(/[^\w\-]+/g, '_');
    XLSX.writeFile(wb, `Nexora_Mutasi_${safeName}_${localDateKey(new Date())}.xlsx`);
    showNotification('File Excel mutasi berhasil dibuat!', 'success');
  }

  // ---------- Pemasangan ----------

  function bind() {
    if (bound) return;
    bound = true;
    const accSel = $('ledger-account');
    const perSel = $('ledger-period');
    const more = $('btn-ledger-more');
    const exp = $('btn-ledger-export');
    if (accSel) accSel.addEventListener('change', loadLedger);
    if (perSel) perSel.addEventListener('change', loadLedger);
    if (more) more.addEventListener('click', () => { shown += PAGE_STEP; render(); });
    if (exp) exp.addEventListener('click', exportExcel);
  }

  document.addEventListener('DOMContentLoaded', bind);

  // Dipanggil switchPage() saat halaman dibuka dan refreshAllViews() setelah data berubah.
  // Mengambil data dari server hanya saat halaman ini sedang tampil.
  PAGE_LOADERS.ledger = () => {
    bind();
    fillAccountSelect();
    if (isActive()) loadLedger();
  };
})();
