// Harness uji: menjalankan KODE ASLI (config.js, app.js, features.js, tarik-tunai.js)
// di Node dengan DOM tiruan + Supabase tiruan (in-memory).
// CATATAN: fungsi server (nx_apply_ops, create_balance_transfer, trigger SQL) adalah TIRUAN
// yang meniru perilaku yang dijelaskan di kode & file SQL. Ini bukan pengujian ke PostgreSQL asli.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '/home/claude/nexora';

class El {
  constructor(id) {
    this.id = id; this._value = ''; this.style = {}; this.dataset = {}; this.disabled = false;
    this.required = false; this.textContent = ''; this.checked = false; this.listeners = {};
    this.options = []; this._html = ''; this._group = null; this._qs = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    this.type = '';
  }
  get value() { return this._value; }
  set value(v) { this._value = String(v === null || v === undefined ? '' : v); }
  get innerHTML() { return this._html; }
  set innerHTML(h) {
    this._html = String(h);
    if (/<option/.test(this._html)) {
      this.options = [...this._html.matchAll(/<option value="([^"]*)"/g)].map((m) => ({ value: m[1] }));
      if (this.options.length && !this.options.some((o) => o.value === this._value)) this._value = '';
    }
  }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  dispatch(t) { (this.listeners[t] || []).forEach((f) => f({ target: this, preventDefault() {} })); }
  closest(sel) {
    if (sel === '.form-group') {
      if (!this._group) {
        const label = new El(this.id + '-label'); label.innerHTML = '<i></i> Nama Pelanggan (Wajib jika Hutang)';
        this._group = new El(this.id + '-group'); this._group._qs['label'] = label;
      }
      return this._group;
    }
    return null;
  }
  querySelector(sel) { return this._qs[sel] || null; }
  querySelectorAll() { return []; }
  focus() {}
  select() {}
  remove() {}
}

function makeEnv(opts = {}) {
  const els = {};
  const radios = [new El('radio-luar'), new El('radio-dalam')];
  radios[0].value = 'luar'; radios[1].value = 'dalam';
  const get = (id) => (els[id] = els[id] || new El(id));

  // form tarik setor / transfer: tombol submit + reset
  ['tarik-setor-form', 'transfer-form'].forEach((fid) => {
    const f = get(fid);
    const btn = new El(fid + '-btn');
    f._qs['button[type="submit"]'] = btn;
    f.reset = () => {
      const fields = fid === 'tarik-setor-form'
        ? ['ts-date', 'ts-account', 'ts-service', 'ts-admin-bank', 'ts-admin-agen', 'ts-pay-method', 'ts-customer', 'ts-notes', 'tt-sender', 'tt-receiver', 'tt-cash', 'tt-nominal', 'tt-admin']
        : ['tf-date', 'tf-from', 'tf-to', 'tf-amount', 'tf-fee', 'tf-notes'];
      fields.forEach((x) => { get(x)._value = ''; });
      if (fid === 'tarik-setor-form') { get('ts-service')._value = 'Setor Tunai'; radios.forEach((r) => { r.checked = false; }); }
      f.dispatch('reset');
    };
  });

  const db = {
    accounts: [
      { id: 'kas', name: 'Kas Laci', balance: 2000000 },
      { id: 'bri', name: 'BRI', balance: 1000000 },
      { id: 'sea', name: 'SeaBank', balance: 500000 },
      { id: 'dana', name: 'DANA', balance: 300000 }
    ],
    transactions: [], vouchers: [], debts: [], expenses: [], customers: [], debt_payments: [],
    balance_transfers: [], commissions: [], cash_calculations: [], cash_calculation_items: [],
    metaCols: opts.metaCols !== false,
    rpcCalls: [], failNext: null
  };

  // ---- tiruan trigger SQL (sql/nexora_update_transfer_tarik_tunai.sql) ----
  function triggerTransfer(row) {
    if (row.from_account_id != null && row.to_account_id != null && String(row.from_account_id) === String(row.to_account_id)) throw new Error('Aplikasi pengirim dan penerima tidak boleh sama.');
    if (!(Number(row.amount) > 0)) throw new Error('Nominal pindah saldo harus lebih dari 0.');
    if (Number(row.admin_fee || 0) < 0) throw new Error('Biaya admin tidak boleh negatif.');
  }
  function triggerTarik(r) {
    if (r.admin_type == null) return;
    if (!(Number(r.withdraw_amount) > 0)) throw new Error('Nominal tarik tunai harus lebih dari 0.');
    if (!(Number(r.admin_amount) >= 0)) throw new Error('Biaya admin tidak boleh negatif.');
    const w = Number(r.withdraw_amount), a = Number(r.admin_amount);
    const expR = r.admin_type === 'luar' ? w : w + a;
    const expC = r.admin_type === 'luar' ? w - a : w;
    if (expC < 0) throw new Error('Biaya admin melebihi nominal tarik tunai.');
    if (Number(r.received_amount) !== expR || Number(r.cash_given) !== expC) throw new Error('Perhitungan tarik tunai tidak sesuai jenis admin.');
    if (Number(r.admin_fee) !== expR || Number(r.amount) !== expC || Number(r.profit) !== a) throw new Error('Saldo, cash, dan keuntungan tarik tunai tidak konsisten.');
  }

  const clone = (x) => JSON.parse(JSON.stringify(x));
  function atomic(fn) {
    const snap = clone({ a: db.accounts, t: db.transactions, d: db.debts, bt: db.balance_transfers });
    try { return fn(); } catch (e) {
      db.accounts = snap.a; db.transactions = snap.t; db.debts = snap.d; db.balance_transfers = snap.bt; // ROLLBACK
      throw e;
    }
  }
  const acc = (id) => db.accounts.find((a) => String(a.id) === String(id));

  const sb = {
    rpc(name, args) {
      db.rpcCalls.push(name);
      try {
        if (db.failNext) { const m = db.failNext; db.failNext = null; throw new Error(m); }
        const data = atomic(() => {
          if (name === 'nx_apply_ops') {
            args.p_ops.forEach((o) => {
              if (o.t === 'insert') {
                if (o.table === 'transactions') triggerTarik(o.row);
                if (o.table === 'transactions' && db.transactions.some((x) => x.id === o.row.id)) throw new Error('duplicate key value violates unique constraint');
                db[o.table].push(clone(o.row));
              } else if (o.t === 'incr') { acc(o.id).balance += o.amount; }
              else if (o.t === 'delete') { db[o.table] = db[o.table].filter((x) => String(x.id) !== String(o.id)); }
              else if (o.t === 'update') { Object.assign(db[o.table].find((x) => String(x.id) === String(o.id)), o.set); }
            });
            return { accounts: clone(db.accounts), vouchers: [] };
          }
          if (name === 'create_balance_transfer') {
            const row = { id: args.p_id, from_account_id: args.p_from, to_account_id: args.p_to, amount: args.p_amount, admin_fee: args.p_fee, date: args.p_date, notes: args.p_notes };
            acc(args.p_from).balance -= (args.p_amount + args.p_fee); // saldo diubah dulu, lalu insert (trigger menggagalkan => rollback)
            acc(args.p_to).balance += args.p_amount;
            triggerTransfer(row);
            db.balance_transfers.push(row);
            return null;
          }
          throw new Error('rpc tidak dikenal: ' + name);
        });
        return Promise.resolve({ data, error: null });
      } catch (e) { return Promise.resolve({ data: null, error: e }); }
    },
    from(table) {
      const q = {
        _cols: null,
        select(c) { this._cols = c; return this; }, order() { return this; }, range() { return this; }, limit() { return this; },
        then(res) {
          if (table === 'transactions' && this._cols && /admin_type/.test(this._cols)) {
            return Promise.resolve(db.metaCols ? { data: [], error: null } : { data: null, error: { message: 'column transactions.admin_type does not exist' } }).then(res);
          }
          return Promise.resolve({ data: clone(db[table] || []), error: null }).then(res);
        }
      };
      return q;
    }
  };

  const notes = [];
  const document = {
    addEventListener(t, f) { (document._l[t] = document._l[t] || []).push(f); }, _l: {},
    getElementById: get,
    querySelector(sel) { return sel === 'input[name="tt-admin-type"]:checked' ? (radios.find((r) => r.checked) || null) : null; },
    querySelectorAll(sel) { return sel === 'input[name="tt-admin-type"]' ? radios : []; },
    createElement() { return new El('x'); },
    body: new El('body'),
    contains() { return true; }
  };

  const xlsxOut = {};
  const ctx = {
    console, setTimeout, clearTimeout, Date, Math, Number, String, Array, JSON, Promise, Object, Intl, isNaN, parseInt, Map, Set, Error,
    document, supabaseClient: sb, notes,
    localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); } },
    XLSX: {
      utils: { json_to_sheet: (rows) => ({ rows }), book_new: () => ({ sheets: [] }), book_append_sheet: (wb, ws) => wb.sheets.push(ws) },
      writeFile: (wb, name) => { xlsxOut.wb = wb; xlsxOut.name = name; }
    },
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (f) => f()
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['config.js', 'app.js', 'features.js', 'tarik-tunai.js'].forEach((f) => {
    const p = path.join(ROOT, 'js', f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  });
  const run = (code) => vm.runInContext(code, ctx);
  run(`
    showNotification = (m, t) => { notes.push({ m, t: t || 'success' }); };
    refreshAllViews = () => {};
    switchPage = () => {};
    showConfirm = (title, msg, fn) => { fn(); };
    appData.accounts = ${JSON.stringify(db.accounts)};
    currentUserId = 'u1';
  `);
  return { run, ctx, db, els, get, radios, notes, document, xlsxOut, sb };
}

module.exports = { makeEnv, El };
