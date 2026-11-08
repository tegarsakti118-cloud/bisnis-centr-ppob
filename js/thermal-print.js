// ==========================================
// NEXORA - Cetak struk ke printer thermal Bluetooth LE (kertas 58 mm, 32 karakter)
// Web Bluetooth + perintah ESC/POS. Tidak mengubah data apa pun; hanya membaca.
// Hanya printer Bluetooth LE yang bisa dijangkau dari Chrome.
// ==========================================
(function () {
  'use strict';

  const COLS = 32;                       // lebar 58 mm = 32 karakter (font standar)
  const ESC = 0x1b, GS = 0x1d;
  // UUID layanan umum printer BLE murah (ISSC / Microchip / lainnya)
  const SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
  ];
  let link = { device: null, ch: null };
  const enc = new TextEncoder();

  const supported = () => !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- teks ----------
  function ascii(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
  }
  function rupiah(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
  function center(s) {
    const t = ascii(s).slice(0, COLS);
    const pad = Math.max(0, Math.floor((COLS - t.length) / 2));
    return ' '.repeat(pad) + t;
  }
  function row(label, value) {
    const l = ascii(label), v = ascii(value);
    const space = COLS - l.length - v.length;
    if (space >= 1) return l + ' '.repeat(space) + v;
    // nilai terlalu panjang: label di baris sendiri, nilai rata kanan di bawahnya
    return l + '\n' + ' '.repeat(Math.max(0, COLS - v.length)) + v;
  }
  function wrap(s) {
    const out = [];
    let cur = '';
    ascii(s).split(/\s+/).forEach((w) => {
      if (!w) return;
      if ((cur + ' ' + w).trim().length > COLS) { out.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    });
    if (cur) out.push(cur);
    return out;
  }
  const DASH = '-'.repeat(COLS);

  // ---------- susun struk ----------
  // ops: { t: 'text'|'bold'|'center'|'big'|'gap', s }
  function buildOps(list, ctx) {
    const biz = ctx.biz || {}, br = ctx.br || {}, names = ctx.names || {}, me = ctx.me || {};
    const fmtDT = (d) => new Date(d).toLocaleString('en-GB', {
      timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    });
    const ops = [];
    if (biz.logo) ops.push({ t: 'logo' });
    ops.push({ t: 'center', s: (biz.name || 'NEXORA').toUpperCase() });
    if (br.name || br.code) ops.push({ t: 'center', s: [br.name, br.code ? '(' + br.code + ')' : ''].filter(Boolean).join(' ') });
    if (br.address) wrap(br.address).forEach((x) => ops.push({ t: 'center', s: x }));
    if (br.phone) ops.push({ t: 'center', s: 'Telp/WA: ' + br.phone });
    ops.push({ t: 'text', s: DASH });

    list.forEach((tx, i) => {
      if (i > 0) ops.push({ t: 'text', s: DASH });
      const kasir = (tx.user_id && names[String(tx.user_id)]) || me.full_name || '-';
      ops.push({ t: 'text', s: row('No. Struk', String(tx.id).toUpperCase()) });
      ops.push({ t: 'text', s: row('Waktu', fmtDT(tx.date)) });
      ops.push({ t: 'text', s: row('Kasir', kasir) });
      ops.push({ t: 'text', s: DASH });
      if (tx.type === 'voucher') {
        wrap(tx.notes || '-').forEach((x, k) => ops.push({ t: 'text', s: k === 0 ? row('Produk', x) : ' '.repeat(COLS - x.length) + x }));
        if (tx.quantity) ops.push({ t: 'text', s: row('Jumlah', String(tx.quantity)) });
        ops.push({ t: 'text', s: row('Harga', rupiah(tx.admin_fee)) });
      } else {
        wrap(tx.notes || '-').forEach((x, k) => ops.push({ t: 'text', s: k === 0 ? row('Layanan', x) : ' '.repeat(COLS - x.length) + x }));
        ops.push({ t: 'text', s: row('Nominal', rupiah(tx.amount)) });
        ops.push({ t: 'text', s: row('Biaya Admin', rupiah(Number(tx.admin_fee || 0) - Number(tx.amount || 0))) });
      }
    });

    const total = list.reduce((s, tx) => s + Number(tx.admin_fee || 0), 0);
    const allLunas = list.every((tx) => tx.status !== 'Hutang');
    ops.push({ t: 'text', s: DASH });
    ops.push({ t: 'bold', s: row('TOTAL BAYAR', rupiah(total)) });
    ops.push({ t: 'text', s: row('Status', allLunas ? 'LUNAS' : 'HUTANG') });
    ops.push({ t: 'text', s: DASH });
    ops.push({ t: 'bold', s: center('*** TERIMA KASIH ***') });
    ops.push({ t: 'center', s: 'Terima kasih atas kunjungan Anda' });
    ops.push({ t: 'center', s: 'Simpan struk ini sebagai bukti' });
    ops.push({ t: 'center', s: 'pembayaran yang sah.' });
    ops.push({ t: 'center', s: 'Dicetak ' + fmtDT(new Date()) });
    return ops;
  }

  // ---------- ESC/POS ----------
  function toBytes(ops, logoBytes) {
    const parts = [];
    const push = (arr) => parts.push(Uint8Array.from(arr));
    push([ESC, 0x40]);                     // init
    push([ESC, 0x61, 0]);                  // rata kiri (default)
    ops.forEach((op) => {
      if (op.t === 'logo') {
        if (logoBytes) {
          push([ESC, 0x61, 1]);            // rata tengah untuk gambar
          parts.push(logoBytes);
          push([ESC, 0x61, 0]);
        }
      } else if (op.t === 'bold') {
        push([ESC, 0x45, 1]);
        parts.push(enc.encode(op.s + '\n'));
        push([ESC, 0x45, 0]);
      } else if (op.t === 'center') {
        parts.push(enc.encode(center(op.s) + '\n'));
      } else {
        parts.push(enc.encode(op.s + '\n'));
      }
    });
    push([ESC, 0x64, 3]);                  // maju 3 baris
    push([GS, 0x56, 0x00]);                // potong (jika printer punya pemotong)
    const len = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    parts.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
  }

  // Logo -> bitmap hitam putih -> perintah raster ESC/POS (GS v 0)
  async function rasterizeLogo(src, maxW) {
    const width = maxW || 200;
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
    const w = Math.min(width, img.width);
    const h = Math.max(1, Math.round(img.height * (w / img.width)));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, w, h);
    cx.drawImage(img, 0, 0, w, h);
    const px = cx.getImageData(0, 0, w, h).data;
    const bytesPerRow = Math.ceil(w / 8);
    const data = new Uint8Array(bytesPerRow * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        const lum = px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114;
        if (lum < 140) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    const head = Uint8Array.from([GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, h & 0xff, h >> 8]);
    const out = new Uint8Array(head.length + data.length + 1);
    out.set(head, 0);
    out.set(data, head.length);
    out[out.length - 1] = 0x0a;
    return out;
  }

  // ---------- Bluetooth ----------
  async function connect() {
    if (!supported()) throw new Error('Browser ini tidak mendukung Bluetooth. Pakai Chrome di Android.');
    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    const server = await device.gatt.connect();
    let ch = null;
    const services = await server.getPrimaryServices();
    for (const svc of services) {
      const chars = await svc.getCharacteristics();
      const w = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
      if (w) { ch = w; break; }
    }
    if (!ch) throw new Error('Printer ini tidak memakai Bluetooth LE yang didukung. Coba aplikasi RawBT.');
    link = { device, ch };
    device.addEventListener('gattserverdisconnected', () => { link.ch = null; });
    return device.name || 'Printer';
  }

  async function sendBytes(bytes) {
    if (!link.ch) throw new Error('Printer belum terhubung. Tekan Hubungkan Printer dulu.');
    const CHUNK = 100;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const part = bytes.slice(i, i + CHUNK);
      if (link.ch.properties.writeWithoutResponse) await link.ch.writeValueWithoutResponse(part);
      else await link.ch.writeValue(part);
      await sleep(25);
    }
  }

  async function printReceipts(list, ctx) {
    if (!list || list.length === 0) throw new Error('Tidak ada transaksi untuk dicetak.');
    let logo = null;
    if (ctx.biz && ctx.biz.logo) {
      try { logo = await rasterizeLogo(ctx.biz.logo, 200); } catch (e) { logo = null; }
    }
    await sendBytes(toBytes(buildOps(list, ctx), logo));
  }

  window.NxThermal = {
    supported, connect, printReceipts,
    isConnected: () => !!link.ch,
    deviceName: () => (link.device && link.device.name) || ''
  };
})();
