// ==========================================
// NEXORA v2.3 - TARIK TUNAI (ADMIN LUAR / ADMIN DALAM)
//
// Dimuat SETELAH js/app.js (lihat index.html). Dipanggil dari app.js:
//   - initTarikTunaiFields()        -> dari initTarikSetorPage()
//   - submitTarikTunai(form)        -> dari handler submit form Tarik/Setor bila layanan = "Tarik Tunai"
//   - getTarikTunaiInfo(tx)         -> riwayat transaksi & export Excel
//
// Pemetaan ke struktur transaksi yang SUDAH ADA (tabel & rumus laporan tidak berubah):
//   accountId   = akun Kas Fisik (berkurang sebesar `amount`)
//   payAccountId= rekening/aplikasi penerima milik agen (bertambah sebesar `admin_fee`)
//   amount      = cash yang diberikan ke pelanggan      (kolom lama "modal")
//   admin_fee   = saldo yang diterima agen              (kolom lama "penjualan")
//   profit      = biaya admin (saldo diterima - cash)   -> inilah keuntungan
//
//   Admin Luar : diterima = nominal,         cash = nominal - admin
//   Admin Dalam: diterima = nominal + admin, cash = nominal
//
// Dashboard, laporan harian/bulanan, hapus transaksi (pengembalian saldo), dan Buku Mutasi
// otomatis benar karena semuanya sudah memakai kolom-kolom di atas.
// ==========================================
(function () {
  'use strict';

  const SERVICE_NAME = 'Tarik Tunai';
  const ADMIN_LABEL = { luar: 'Admin Luar', dalam: 'Admin Dalam' };
  const DEFAULT_FEE_KEY = 'nx_tt_default_admin';
  const META_COLUMNS = ['customer_name', 'sender_app', 'admin_type', 'withdraw_amount', 'admin_amount', 'received_amount', 'cash_given'];

  const $ = (id) => document.getElementById(id);
  const num = (v) => Number(v) || 0;
  const rp = (v) => formatRupiah(v);

  // ------------------------------------------
  // PERHITUNGAN (fungsi murni, dipakai UI, validasi, dan pengujian)
  // ------------------------------------------
  function calcTarikTunai(nominal, admin, type) {
    const n = Math.round(num(nominal));
    const a = Math.round(num(admin));
    if (type === 'dalam') return { nominal: n, admin: a, received: n + a, cash: n, profit: a };
    return { nominal: n, admin: a, received: n, cash: n - a, profit: a }; // luar
  }

  // Kembalikan teks error, atau '' jika valid. `strict` = cek juga kolom yang belum diisi.
  function validateTarikTunai(f, strict) {
    if (strict) {
      if (!f.customer) return 'Nama pelanggan wajib diisi.';
      if (!f.sender) return 'Isi aplikasi / rekening pengirim pelanggan.';
      if (!f.receiverId) return 'Pilih rekening / aplikasi penerima milik agen.';
      if (!f.cashId) return 'Pilih akun Kas Fisik.';
      if (!(f.nominal > 0)) return 'Nominal tarik tunai harus lebih dari 0.';
      if (f.type !== 'luar' && f.type !== 'dalam') return 'Pilih jenis admin: Admin Luar atau Admin Dalam.';
    }
    if (f.admin < 0 || !Number.isFinite(f.admin)) return 'Biaya admin tidak boleh negatif.';
    if (f.nominal < 0 || !Number.isFinite(f.nominal)) return 'Nominal tarik tunai tidak valid.';
    if (f.cashId && f.receiverId && String(f.cashId) === String(f.receiverId)) {
      return 'Kas Fisik dan rekening penerima tidak boleh sama.';
    }
    // Aplikasi pengirim pelanggan tidak boleh sama dengan aplikasi penerima milik agen (validasi bersama)
    if (f.sender && f.receiverId && window.NxValidation) {
      const pair = NxValidation.validateAccountPair(f.sender, f.receiverId);
      if (!pair.ok) return pair.message;
    }
    if (f.type === 'luar' && f.nominal > 0 && f.admin >= f.nominal) {
      return 'Pada Admin Luar, biaya admin harus lebih kecil dari nominal tarik tunai.';
    }
    return '';
  }

  // ------------------------------------------
  // BACA DATA FORM
  // ------------------------------------------
  function readForm() {
    const typeEl = document.querySelector('input[name="tt-admin-type"]:checked');
    return {
      customer: ($('ts-customer').value || '').trim(),
      sender: ($('tt-sender').value || '').trim(),
      receiverId: $('tt-receiver').value,
      cashId: $('tt-cash').value,
      nominal: getCleanNumber($('tt-nominal')),
      admin: getCleanNumber($('tt-admin')),
      type: typeEl ? typeEl.value : ''
    };
  }

  // ------------------------------------------
  // MODE TAMPILAN: layanan "Tarik Tunai" menampilkan form khusus,
  // layanan lain tetap memakai form lama TANPA perubahan.
  // ------------------------------------------
  const OLD_FIELD_IDS = ['ts-account', 'ts-admin-bank', 'ts-admin-agen', 'ts-pay-method'];

  function isTarikTunaiSelected() {
    const s = $('ts-service');
    return !!s && s.value === SERVICE_NAME;
  }

  function applyMode() {
    const on = isTarikTunaiSelected();
    OLD_FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (!el) return;
      const group = el.closest('.form-group');
      if (group) group.style.display = on ? 'none' : '';
      // input tersembunyi yang "required" membuat browser menolak submit, jadi dinonaktifkan sementara
      if (on && el.required) { el.dataset.ttWasRequired = '1'; el.required = false; }
      if (!on && el.dataset.ttWasRequired === '1') { el.required = true; delete el.dataset.ttWasRequired; }
    });
    const section = $('tt-section');
    if (section) section.style.display = on ? 'flex' : 'none';
    if (!on) {
      const f0 = $('tarik-setor-form');
      if (f0) { f0.dataset.pairInvalid = '0'; const b0 = f0.querySelector('button[type="submit"]'); if (b0) b0.disabled = false; }
    }

    const custLabel = $('ts-customer') && $('ts-customer').closest('.form-group') && $('ts-customer').closest('.form-group').querySelector('label');
    if (custLabel) {
      if (!custLabel.dataset.ttOrig) custLabel.dataset.ttOrig = custLabel.innerHTML;
      custLabel.innerHTML = on ? '<i class="fa-solid fa-user"></i> Nama Pelanggan' : custLabel.dataset.ttOrig;
    }

    if (on) {
      const adminEl = $('tt-admin');
      const cfgFee = window.nxBranchCfg ? window.nxBranchCfg.fee_tarik_tunai : null;
      if (adminEl) {
        if (cfgFee !== null && cfgFee !== undefined) {
          // Biaya diatur Super Admin untuk cabang ini: terisi otomatis dan dikunci
          adminEl.value = Number(cfgFee).toLocaleString('id-ID');
          adminEl.readOnly = true;
        } else {
          adminEl.readOnly = false;
          if (!adminEl.value) {
            const saved = loadDefaultFee();
            if (saved > 0) adminEl.value = saved.toLocaleString('id-ID');
          }
        }
      }
      renderCalc();
    }
  }

  function loadDefaultFee() {
    try { return num(localStorage.getItem(DEFAULT_FEE_KEY)); } catch (e) { return 0; }
  }
  function saveDefaultFee(v) {
    try { if (v > 0) localStorage.setItem(DEFAULT_FEE_KEY, String(v)); } catch (e) { /* abaikan */ }
  }

  // ------------------------------------------
  // TAMPILAN PERHITUNGAN OTOMATIS
  // ------------------------------------------
  function renderCalc() {
    const box = $('tt-calc');
    if (!box) return;
    const f = readForm();
    const hasNominal = f.nominal > 0;
    const L = calcTarikTunai(f.nominal, f.admin, 'luar');
    const D = calcTarikTunai(f.nominal, f.admin, 'dalam');
    const cell = (v, col) => {
      const sel = f.type === col;
      return `<td style="text-align:right; padding:6px 8px;${sel ? ' font-weight:700; color:#34d399;' : ''}">${hasNominal ? rp(v) : '-'}</td>`;
    };
    const row = (label, l, d) => `<tr><td style="padding:6px 8px; color:var(--text-muted);">${label}</td>${cell(l, 'luar')}${cell(d, 'dalam')}</tr>`;
    const head = (label, col) => `<th style="text-align:right; padding:6px 8px;${f.type === col ? ' color:#34d399;' : ''}">${label}</th>`;
    box.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead><tr style="border-bottom:1px solid var(--glass-border);">
            <th style="text-align:left; padding:6px 8px;">Keterangan</th>${head('Admin Luar', 'luar')}${head('Admin Dalam', 'dalam')}
          </tr></thead>
          <tbody>
            ${row('Nominal tarik', L.nominal, D.nominal)}
            ${row('Biaya admin', L.admin, D.admin)}
            ${row('Saldo diterima', L.received, D.received)}
            ${row('Cash diberikan', L.cash, D.cash)}
            ${row('Keuntungan', L.profit, D.profit)}
          </tbody>
        </table>
      </div>`;

    const result = $('tt-result');
    if (result) {
      if (hasNominal && (f.type === 'luar' || f.type === 'dalam')) {
        const c = calcTarikTunai(f.nominal, f.admin, f.type);
        result.style.display = 'block';
        result.innerHTML = `
          <div>Saldo yang diterima agen: <strong>${rp(c.received)}</strong></div>
          <div>Uang tunai diberikan ke pelanggan: <strong>${rp(c.cash)}</strong></div>
          <div>Keuntungan agen: <strong style="color:#34d399;">${rp(c.profit)}</strong></div>`;
      } else {
        result.style.display = 'none';
        result.innerHTML = '';
      }
    }

    const errEl = $('tt-error');
    if (errEl) {
      const msg = validateTarikTunai(f, false);
      errEl.style.display = msg ? 'block' : 'none';
      errEl.textContent = msg;
      // Tombol proses dinonaktifkan selama pilihan tidak valid (guardSubmit menghormati flag ini)
      const form = $('tarik-setor-form');
      if (form && isTarikTunaiSelected()) {
        form.dataset.pairInvalid = msg ? '1' : '0';
        const btn = form.querySelector('button[type="submit"]');
        if (btn) btn.disabled = !!msg;
      }
    }
  }

  // ------------------------------------------
  // KOLOM TAMBAHAN (opsional) DI TABEL transactions
  // Dicek sekali: jika kolom belum dipasang (sql/nexora_update_transfer_tarik_tunai.sql belum dijalankan),
  // transaksi tetap tersimpan dengan benar; jenis admin dibaca dari keterangan.
  // ------------------------------------------
  let metaColumns = null;
  async function hasMetaColumns() {
    if (metaColumns !== null) return metaColumns;
    try {
      const { error } = await sb.from('transactions').select(META_COLUMNS.join(',')).limit(1);
      metaColumns = !error;
    } catch (e) {
      metaColumns = false;
    }
    return metaColumns;
  }

  // ------------------------------------------
  // SIMPAN TRANSAKSI
  // ------------------------------------------
  async function submitTarikTunai(form) {
    const f = readForm();
    const errMsg = validateTarikTunai(f, true);
    if (errMsg) {
      const errEl = $('tt-error');
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = errMsg; }
      showNotification(errMsg, 'error');
      return;
    }

    const cashAcc = findAccount(f.cashId);
    const recvAcc = findAccount(f.receiverId);
    if (!cashAcc || !recvAcc) {
      showNotification('Akun Kas Fisik / penerima tidak ditemukan. Muat ulang aplikasi.', 'error');
      return;
    }

    const c = calcTarikTunai(f.nominal, f.admin, f.type);
    if (c.cash < 0 || c.received <= 0 || c.profit < 0) {
      showNotification('Perhitungan tidak valid. Periksa nominal dan biaya admin.', 'error');
      return;
    }
    if (!(await confirmLowBalance(cashAcc, c.cash))) return;

    const dateVal = $('ts-date').value;
    const parsed = dateVal ? new Date(dateVal) : new Date();
    const txDate = (isNaN(parsed.getTime()) ? new Date() : parsed).toISOString();
    const extraNotes = $('ts-notes').value.trim();
    const label = ADMIN_LABEL[f.type];
    // Format keterangan dipakai sebagai cadangan pembaca jenis admin (lihat getTarikTunaiInfo)
    const notes = `${SERVICE_NAME} [${label}] ${f.customer} (${f.sender} \u2192 ${recvAcc.name})` + (extraNotes ? ` - ${extraNotes}` : '');

    const tx = {
      id: genId('tx'),
      user_id: currentUserId,
      type: 'tarik_setor',
      accountId: String(cashAcc.id),
      payAccountId: String(recvAcc.id),
      debtId: null,
      notes,
      amount: c.cash,
      admin_fee: c.received,
      cost_price: c.cash,
      profit: c.profit,
      date: txDate,
      status: 'Success'
    };

    if (await hasMetaColumns()) {
      Object.assign(tx, {
        customer_name: f.customer,
        sender_app: f.sender,
        admin_type: f.type,
        withdraw_amount: c.nominal,
        admin_amount: c.admin,
        received_amount: c.received,
        cash_given: c.cash
      });
    }

    const deltas = [
      { accountId: cashAcc.id, delta: -c.cash },
      { accountId: recvAcc.id, delta: c.received }
    ];

    const ok = await recordTransaction({ tx, deltas });
    if (!ok) return;

    saveDefaultFee(f.admin);
    form.reset();
    setDefaultDateTime($('ts-date'));
    refreshAllViews();
    showNotification('Transaksi tarik tunai berhasil disimpan!', 'success');
    switchPage('transactions');
  }

  // ------------------------------------------
  // PEMBACA DATA UNTUK RIWAYAT & EXPORT
  // Mengembalikan null untuk transaksi biasa / tarik tunai lama (tanpa jenis admin),
  // sehingga riwayat lama tampil persis seperti sebelumnya.
  // ------------------------------------------
  function getTarikTunaiInfo(tx) {
    if (!tx || tx.type !== 'tarik_setor') return null;
    const notes = String(tx.notes || '');
    const m = /^Tarik Tunai \[Admin (Luar|Dalam)\]\s*(.*?)\s*(?:\(([^)]*?)\s*\u2192|$)/.exec(notes);
    let type = tx.admin_type ? String(tx.admin_type).toLowerCase() : '';
    if (type !== 'luar' && type !== 'dalam') type = m ? m[1].toLowerCase() : '';
    if (type !== 'luar' && type !== 'dalam') return null;

    const has = (v) => v !== null && v !== undefined && v !== '';
    const received = has(tx.received_amount) ? num(tx.received_amount) : num(tx.admin_fee);
    const cash = has(tx.cash_given) ? num(tx.cash_given) : num(tx.amount);
    const admin = has(tx.admin_amount) ? num(tx.admin_amount) : num(tx.profit);
    const nominal = has(tx.withdraw_amount) ? num(tx.withdraw_amount) : (type === 'luar' ? received : cash);
    return {
      type,
      typeLabel: ADMIN_LABEL[type],
      customer: tx.customer_name || (m ? m[2] : '') || '-',
      sender: tx.sender_app || (m && m[3] ? m[3] : '') || '-',
      nominal, admin, received, cash,
      profit: num(tx.profit),
      status: tx.status === 'Success' ? 'Berhasil' : (tx.status || '-')
    };
  }

  function tarikTunaiDetailHtml(tx) {
    const i = getTarikTunaiInfo(tx);
    if (!i) return null;
    const item = (k, v, color) => `<span style="display:inline-block; margin:2px 10px 2px 0; white-space:nowrap;"><span style="color:var(--text-muted);">${k}</span> <strong${color ? ` style="color:${color};"` : ''}>${v}</strong></span>`;
    return `
      <div style="font-weight:600;">Tarik Tunai &middot; ${escapeHtml(i.typeLabel)} &middot; ${escapeHtml(i.customer)}</div>
      <div style="font-size:11px; line-height:1.5;">
        ${item('Nominal', rp(i.nominal))}${item('Admin', rp(i.admin))}${item('Diterima', rp(i.received))}${item('Cash', rp(i.cash))}${item('Untung', rp(i.profit), '#34d399')}${item('Status', escapeHtml(i.status))}
      </div>`;
  }

  // Kolom tambahan untuk export Excel (kosong untuk transaksi selain tarik tunai baru)
  function tarikTunaiExportFields(tx) {
    const i = getTarikTunaiInfo(tx);
    return {
      'Nama Pelanggan': i ? i.customer : '',
      'Jenis Admin': i ? i.typeLabel : '',
      'Nominal Tarik Tunai': i ? i.nominal : '',
      'Biaya Admin': i ? i.admin : '',
      'Saldo Diterima': i ? i.received : '',
      'Cash Diberikan': i ? i.cash : ''
    };
  }

  // ------------------------------------------
  // INISIALISASI (dipanggil setiap halaman Tarik/Setor dibuka)
  // ------------------------------------------
  let bound = false;

  function defaultCashAccountId() {
    const kas = appData.accounts.find((a) => /kas|laci|cash|tunai/i.test(String(a.name || '')));
    return kas ? String(kas.id) : '';
  }

  function initTarikTunaiFields() {
    if (!$('tt-section')) return;
    setSelectOptions($('tt-receiver'), accountOptions('-- Pilih Rekening Penerima --'));
    setSelectOptions($('tt-cash'), accountOptions('-- Pilih Kas Fisik --'));
    if (!$('tt-cash').value) {
      const kasId = defaultCashAccountId();
      if (kasId) $('tt-cash').value = kasId;
    }
    formatNumberInput($('tt-nominal'));
    formatNumberInput($('tt-admin'));

    if (!bound) {
      bound = true;
      const form = $('tarik-setor-form');
      $('ts-service').addEventListener('change', applyMode);
      ['tt-receiver', 'tt-cash'].forEach((id) => $(id).addEventListener('change', renderCalc));
      ['tt-nominal', 'tt-admin', 'tt-sender'].forEach((id) => $(id).addEventListener('input', renderCalc));
      document.querySelectorAll('input[name="tt-admin-type"]').forEach((r) => r.addEventListener('change', renderCalc));
      // form.reset() mengembalikan layanan ke pilihan awal; sesuaikan tampilan setelahnya
      form.addEventListener('reset', () => setTimeout(() => { applyMode(); renderCalc(); }, 0));
    }
    applyMode();
  }

  // Dipakai app.js (fungsi global)
  window.calcTarikTunai = calcTarikTunai;
  window.validateTarikTunai = validateTarikTunai;
  window.getTarikTunaiInfo = getTarikTunaiInfo;
  window.tarikTunaiDetailHtml = tarikTunaiDetailHtml;
  window.tarikTunaiExportFields = tarikTunaiExportFields;
  window.initTarikTunaiFields = initTarikTunaiFields;
  window.submitTarikTunai = submitTarikTunai;
})();
