const { makeEnv } = require('./harness');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; failures.push(name); console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
const eq = (a, b, name) => ok(a === b, name, `didapat ${JSON.stringify(a)}, harapan ${JSON.stringify(b)}`);
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const bal = (env, id) => env.db.accounts.find((a) => a.id === id).balance;
const appBal = (env, id) => env.run(`findAccount('${id}').balance`);
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

async function boot(opts) {
  const env = makeEnv(opts);
  env.run('bindUi()');                         // memasang form Tarik/Setor (+ lainnya)
  env.document._l['DOMContentLoaded'].filter((f) => f.name !== 'bootApp').forEach((f) => { f(); }); // bootApp butuh sesi login asli; dilewati
  return env;
}
async function submit(env, formId) {
  await env.get(formId).onsubmit({ preventDefault() {} });
  await tick();
}
function fillTarik(env, { type, nominal, admin, customer = 'Budi', sender = 'DANA', receiver = 'sea', cash = 'kas' }) {
  env.run('initTarikSetorPage()');
  env.get('ts-service').value = 'Tarik Tunai'; env.get('ts-service').dispatch('change');
  env.get('ts-date').value = nowLocal();
  env.get('ts-customer').value = customer;
  env.get('tt-sender').value = sender;
  env.get('tt-receiver').value = receiver;
  env.get('tt-cash').value = cash;
  env.get('tt-nominal').value = String(nominal);
  env.get('tt-admin').value = String(admin);
  env.radios.forEach((r) => { r.checked = r.value === type; });
  env.get('tt-nominal').dispatch('input');
}

(async () => {
  // ---------------------------------------------------------------
  console.log('\n[1] Transfer BRI -> BRI harus ditolak');
  let env = await boot();
  env.run('loadTransferPage = undefined'); // (tidak dipakai; halaman dimuat lewat PAGE_LOADERS.transfer)
  env.run('PAGE_LOADERS.transfer()');
  const tfFrom = env.get('tf-from'), tfTo = env.get('tf-to');
  tfFrom.value = 'bri'; tfFrom.dispatch('change');
  tfTo.value = 'bri'; tfTo.dispatch('change');
  eq(env.get('tf-same-warning').style.display, 'block', 'pesan validasi tampil langsung saat memilih aplikasi sama');
  eq(env.get('transfer-form')._qs['button[type="submit"]'].disabled, true, 'tombol simpan dinonaktifkan');
  env.get('tf-amount').value = '100.000'; env.get('tf-fee').value = '1.000';
  const before = JSON.stringify(env.db.accounts);
  await submit(env, 'transfer-form');
  ok(env.notes.some((n) => n.m === 'Aplikasi pengirim dan penerima tidak boleh sama.' && n.t === 'error'), 'submit menampilkan pesan "Aplikasi pengirim dan penerima tidak boleh sama."');
  eq(env.db.rpcCalls.filter((c) => c === 'create_balance_transfer').length, 0, 'RPC tidak dipanggil sama sekali');
  eq(JSON.stringify(env.db.accounts), before, 'saldo sumber & tujuan tidak berubah');
  eq(env.get('transfer-form')._qs['button[type="submit"]'].disabled, true, 'tombol tetap nonaktif setelah percobaan submit');

  console.log('\n[1b] Backend (tiruan trigger SQL): RPC langsung dengan akun sama ditolak & di-rollback');
  const r = await env.sb.rpc('create_balance_transfer', { p_id: 'x1', p_from: 'bri', p_to: 'bri', p_amount: 100000, p_fee: 1000, p_date: new Date().toISOString(), p_notes: '' });
  ok(r.error && /tidak boleh sama/.test(r.error.message), 'server menolak');
  eq(JSON.stringify(env.db.accounts), before, 'saldo kembali (rollback) walau saldo sempat diubah di dalam fungsi');
  eq(env.db.balance_transfers.length, 0, 'tidak ada riwayat transfer tersimpan');

  // ---------------------------------------------------------------
  console.log('\n[2] Transfer BRI -> SeaBank harus diterima');
  tfTo.value = 'sea'; tfTo.dispatch('change');
  eq(env.get('tf-same-warning').style.display, 'none', 'pesan hilang saat aplikasi berbeda');
  eq(env.get('transfer-form')._qs['button[type="submit"]'].disabled, false, 'tombol aktif lagi');
  await submit(env, 'transfer-form');
  eq(bal(env, 'bri'), 1000000 - 101000, 'BRI berkurang nominal + admin');
  eq(bal(env, 'sea'), 500000 + 100000, 'SeaBank bertambah nominal');
  eq(env.db.balance_transfers.length, 1, 'riwayat transfer tersimpan');

  // ---------------------------------------------------------------
  console.log('\n[3] Tarik tunai ADMIN LUAR Rp500.000, admin Rp3.000');
  env = await boot();
  fillTarik(env, { type: 'luar', nominal: '500.000', admin: '3.000' });
  eq(env.get('tt-section').style.display, 'flex', 'form khusus Tarik Tunai tampil');
  eq(env.get('ts-account').closest('.form-group').style.display, 'none', 'kolom modal/jual lama disembunyikan');
  ok(/497\.000/.test(env.get('tt-calc').innerHTML) && /503\.000/.test(env.get('tt-calc').innerHTML), 'tabel perhitungan memuat Rp497.000 (luar) & Rp503.000 (dalam)');
  await submit(env, 'tarik-setor-form');
  ok(!env.notes.some((n) => n.t === 'error'), 'tidak ada error', JSON.stringify(env.notes));
  eq(bal(env, 'sea'), 500000 + 500000, '[5] saldo rekening agen +500.000');
  eq(bal(env, 'kas'), 2000000 - 497000, '[6] kas fisik -497.000');
  let tx = env.db.transactions[0];
  eq(tx.profit, 3000, '[7] keuntungan = 3.000 (bukan seluruh saldo diterima)');
  eq(tx.admin_fee, 500000, 'saldo diterima 500.000');
  eq(tx.amount, 497000, 'cash diberikan 497.000');
  eq(tx.admin_type, 'luar', 'jenis admin tersimpan');
  eq(appBal(env, 'sea'), 1000000, 'saldo di layar sama dengan server');

  // ---------------------------------------------------------------
  console.log('\n[4] Tarik tunai ADMIN DALAM Rp500.000, admin Rp3.000');
  fillTarik(env, { type: 'dalam', nominal: '500.000', admin: '3.000', customer: 'Sari', sender: 'BRI' });
  await submit(env, 'tarik-setor-form');
  eq(bal(env, 'sea'), 1000000 + 503000, 'saldo rekening agen +503.000');
  eq(bal(env, 'kas'), 2000000 - 497000 - 500000, 'kas fisik -500.000');
  tx = env.db.transactions[1];
  eq(tx.profit, 3000, 'keuntungan = 3.000');
  eq(tx.admin_fee, 503000, 'saldo diterima 503.000');
  eq(tx.amount, 500000, 'cash diberikan 500.000');

  // ---------------------------------------------------------------
  console.log('\n[8] Dashboard + laporan harian & bulanan');
  env.run('loadDashboardData()');
  eq(env.get('val-profit-today').textContent.replace(/\s/g, ''), 'Rp6.000', 'laba hari ini = 6.000 (3.000 + 3.000)');
  eq(env.get('val-profit-month').textContent.replace(/\s/g, ''), 'Rp6.000', 'laba bulan ini = 6.000');
  eq(env.get('val-tx-today').textContent, '2', 'jumlah transaksi hari ini = 2');
  const total = env.run('appData.accounts.reduce((s,a)=>s+Number(a.balance),0)');
  eq(total, 3800000 + 6000, 'total saldo naik tepat sebesar keuntungan (6.000), bukan sebesar seluruh saldo diterima');

  console.log('\n[8b] Riwayat transaksi menampilkan semua kolom wajib');
  env.run('renderFullTransactionsList()');
  const html = env.get('full-tx-table-body').innerHTML;
  ['Admin Luar', 'Admin Dalam', 'Budi', 'Sari', 'Nominal', 'Admin', 'Diterima', 'Cash', 'Untung', 'Berhasil'].forEach((k) => ok(html.includes(k), 'riwayat memuat "' + k + '"'));
  ok(html.includes('TX_'), 'riwayat memuat ID transaksi');

  console.log('\n[8c] Export Excel memuat info tarik tunai');
  env.run("exportTransactionsExcel('monthly')");
  const rows = env.xlsxOut.wb.sheets[0].rows;
  const luar = rows.find((x) => x['Jenis Admin'] === 'Admin Luar');
  ok(luar && luar['Nama Pelanggan'] === 'Budi' && luar['Nominal Tarik Tunai'] === 500000 && luar['Biaya Admin'] === 3000 && luar['Saldo Diterima'] === 500000 && luar['Cash Diberikan'] === 497000 && luar['Keuntungan'] === 3000, 'baris Admin Luar benar', JSON.stringify(luar));
  const dalam = rows.find((x) => x['Jenis Admin'] === 'Admin Dalam');
  ok(dalam && dalam['Nominal Tarik Tunai'] === 500000 && dalam['Saldo Diterima'] === 503000 && dalam['Cash Diberikan'] === 500000, 'baris Admin Dalam benar', JSON.stringify(dalam));
  const totalRow = rows[rows.length - 1];
  eq(totalRow['Keuntungan'], 6000, 'total keuntungan di baris TOTAL = 6.000');

  console.log('\n[8d] Hapus transaksi mengembalikan saldo & kas');
  await env.run(`deleteTransaction('${env.db.transactions[1].id}')`);
  await tick();
  eq(bal(env, 'sea'), 1000000, 'saldo rekening kembali (Admin Dalam dibatalkan)');
  eq(bal(env, 'kas'), 2000000 - 497000, 'kas fisik kembali');
  eq(env.db.transactions.length, 1, 'transaksi terhapus');

  // ---------------------------------------------------------------
  console.log('\n[V] Validasi input Tarik Tunai');
  const V = (o) => env.run(`validateTarikTunai(${JSON.stringify(o)}, true)`);
  const base = { customer: 'A', sender: 'DANA', receiverId: 'sea', cashId: 'kas', nominal: 500000, admin: 3000, type: 'luar' };
  eq(V({ ...base, nominal: 0 }), 'Nominal tarik tunai harus lebih dari 0.', 'nominal 0 ditolak');
  eq(V({ ...base, admin: -1 }), 'Biaya admin tidak boleh negatif.', 'admin negatif ditolak');
  eq(V({ ...base, cashId: 'sea' }), 'Kas Fisik dan rekening penerima tidak boleh sama.', 'kas = penerima ditolak');
  ok(/lebih kecil/.test(V({ ...base, admin: 500000 })), 'Admin Luar dengan admin >= nominal ditolak');
  eq(V({ ...base, admin: 500000, type: 'dalam' }), '', 'Admin Dalam dengan admin besar tetap valid (cash = nominal)');
  ok(/jenis admin/i.test(V({ ...base, type: '' })), 'jenis admin wajib dipilih');
  const cnt = env.db.transactions.length;
  fillTarik(env, { type: 'luar', nominal: '0', admin: '3.000' });
  await submit(env, 'tarik-setor-form');
  eq(env.db.transactions.length, cnt, 'nominal 0: tidak ada transaksi tersimpan');
  fillTarik(env, { type: 'luar', nominal: '500.000', admin: '3.000', cash: 'sea', receiver: 'sea' });
  await submit(env, 'tarik-setor-form');
  eq(env.db.transactions.length, cnt, 'kas = penerima: tidak ada transaksi tersimpan');

  console.log('\n[V2] Tanpa ganda: klik simpan dua kali berturut-turut');
  const tBefore = env.db.transactions.length, sBefore = bal(env, 'sea');
  fillTarik(env, { type: 'luar', nominal: '100.000', admin: '2.000' });
  const f = env.get('tarik-setor-form');
  await Promise.all([f.onsubmit({ preventDefault() {} }), f.onsubmit({ preventDefault() {} })]);
  await tick();
  eq(env.db.transactions.length, tBefore + 1, 'hanya satu transaksi tersimpan');
  eq(bal(env, 'sea'), sBefore + 100000, 'saldo hanya bertambah sekali');

  console.log('\n[V3] Server menolak data tidak konsisten (tiruan trigger) & saldo tetap');
  const accSnap = JSON.stringify(env.db.accounts);
  const bad = await env.sb.rpc('nx_apply_ops', { p_ops: [
    { t: 'insert', table: 'transactions', row: { id: 'bad1', type: 'tarik_setor', admin_type: 'luar', withdraw_amount: 500000, admin_amount: 3000, received_amount: 500000, cash_given: 500000, admin_fee: 500000, amount: 500000, profit: 500000 } },
    { t: 'incr', table: 'accounts', id: 'sea', amount: 500000 }] });
  ok(bad.error, 'server menolak (cash/profit salah)');
  eq(JSON.stringify(env.db.accounts), accSnap, 'saldo tidak berubah (rollback)');

  // ---------------------------------------------------------------
  console.log('\n[9] Transaksi lama tetap berfungsi');
  env = await boot();
  env.run('initTarikSetorPage()');
  env.get('ts-service').value = 'Setor Tunai'; env.get('ts-service').dispatch('change');
  eq(env.get('tt-section').style.display, 'none', 'layanan lain: form tarik tunai tersembunyi');
  eq(env.get('ts-admin-bank').closest('.form-group').style.display, '', 'layanan lain: kolom modal/jual lama tampil');
  env.get('ts-date').value = nowLocal();
  env.get('ts-account').value = 'bri'; env.get('ts-admin-bank').value = '100.000'; env.get('ts-admin-agen').value = '102.000'; env.get('ts-pay-method').value = 'kas';
  await submit(env, 'tarik-setor-form');
  eq(bal(env, 'bri'), 1000000 - 100000, 'Setor Tunai lama: sumber -modal');
  eq(bal(env, 'kas'), 2000000 + 102000, 'Setor Tunai lama: penerima +jual');
  eq(env.db.transactions[0].profit, 2000, 'Setor Tunai lama: profit = jual - modal');
  ok(!('admin_type' in env.db.transactions[0]), 'Setor Tunai lama: tidak ada kolom baru terkirim');

  // tarik tunai lama (tanpa penanda) tetap tampil seperti biasa
  env.run(`appData.transactions.push({ id:'tx_lama', type:'tarik_setor', accountId:'bri', payAccountId:'kas', notes:'Tarik Tunai (BRI)', amount:97000, admin_fee:100000, cost_price:97000, profit:3000, date:new Date().toISOString(), status:'Success' })`);
  eq(env.run("getTarikTunaiInfo(appData.transactions.find(t=>t.id==='tx_lama'))"), null, 'tarik tunai lama tidak dianggap format baru');
  env.run('renderFullTransactionsList()');
  ok(env.get('full-tx-table-body').innerHTML.includes('Tarik Tunai (BRI)'), 'tarik tunai lama tampil dengan keterangan aslinya');

  // ---------------------------------------------------------------
  console.log('\n[M] Mode tanpa kolom baru (SQL belum dijalankan): tetap benar');
  env = await boot({ metaCols: false });
  fillTarik(env, { type: 'dalam', nominal: '500.000', admin: '3.000', customer: 'Dewi', sender: 'OVO' });
  await submit(env, 'tarik-setor-form');
  tx = env.db.transactions[0];
  ok(tx && !('admin_type' in tx), 'kolom baru tidak dikirim');
  eq(bal(env, 'sea'), 500000 + 503000, 'saldo benar');
  eq(bal(env, 'kas'), 2000000 - 500000, 'kas benar');
  const info = env.run(`getTarikTunaiInfo(appData.transactions[0])`);
  ok(info && info.type === 'dalam' && info.nominal === 500000 && info.admin === 3000 && info.received === 503000 && info.cash === 500000 && info.customer === 'Dewi' && info.sender === 'OVO', 'jenis admin & rincian terbaca dari keterangan', JSON.stringify(info));

  // ---------------------------------------------------------------
  console.log(`\n==== HASIL: ${pass} lulus, ${fail} gagal ====`);
  if (fail) { console.log('Gagal:', failures); process.exit(1); }
})().catch((e) => { console.error('ERROR HARNESS:', e); process.exit(2); });
