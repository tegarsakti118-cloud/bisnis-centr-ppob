// ==========================================
// NEXORA - KASIR: KERANJANG, LIVE SEARCH & PEMBAYARAN
// ==========================================
(function () {
  'use strict';

  let cart = [];
  let discount = { rp: 0, pct: 0 };
  let bound = false;

  const $ = (id) => document.getElementById(id);
  const PAY_VIEW = 'sell-voucher-form';
  const CART_VIEW = 'kasir-cart-view';

  function getProduct(id) {
    return (appData.vouchers || []).find((v) => String(v.id) === String(id)) || null;
  }

  function getLines() {
    cart = cart.filter((c) => getProduct(c.id));
    return cart.map((c) => {
      const v = getProduct(c.id);
      const price = Number(v.price) || 0;
      return { v, qty: c.qty, price, sell: price * c.qty, stock: Number(v.stock) || 0 };
    });
  }

  function sumSell(lines) {
    return lines.reduce((s, l) => s + l.sell, 0);
  }

  function pctLabel(n) {
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }

  function isPayOpen() {
    const f = $(PAY_VIEW);
    return !!f && !f.hidden;
  }

  function resultCard(v) {
    const stock = Number(v.stock) || 0;
    const barcode = v.barcode ? `<span>Barcode: ${escapeHtml(v.barcode)}</span>` : '';
    const out = stock <= 0;
    return `
      <div class="kasir-result" role="option">
        <div class="kasir-result-info">
          <strong>${escapeHtml(v.name)}</strong>
          ${barcode}
          <span>Harga Jual: <b>${formatRupiah(v.price)}</b></span>
          <span class="${out ? 'kasir-stock-out' : ''}">Stok: ${stock}</span>
        </div>
        <button type="button" class="kasir-add" data-add="${escapeHtml(v.id)}" ${out ? 'disabled' : ''}>
          ${out ? 'Habis' : '+ Keranjang'}
        </button>
      </div>`;
  }

  function findMatches(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (appData.vouchers || []).filter((v) =>
      String(v.name || '').toLowerCase().includes(q) ||
      String(v.barcode || '').toLowerCase().includes(q)
    ).slice(0, 30);
  }

  function renderResults() {
    const box = $('kasir-results');
    const input = $('kasir-search');
    if (!box || !input) return;

    const raw = input.value.trim();
    if (!raw) { closeResults(); return; }

    const list = findMatches(raw);
    if (list.length === 0) {
      box.innerHTML = `
        <div class="kasir-noresult">
          <p>Produk &quot;${escapeHtml(raw)}&quot; belum ada.</p>
          <button type="button" class="btn-mini btn-mini-green" data-new-product="1">
            <i class="fa-solid fa-plus"></i> Tambah produk baru
          </button>
        </div>`;
    } else {
      box.innerHTML = list.map(resultCard).join('');
    }
    box.hidden = false;
  }

  function closeResults() {
    const box = $('kasir-results');
    if (box) { box.hidden = true; box.innerHTML = ''; }
  }

  function clearSearch() {
    const input = $('kasir-search');
    if (input) input.value = '';
    closeResults();
  }

  function addToCart(id) {
    const v = getProduct(id);
    if (!v) return;
    const stock = Number(v.stock) || 0;
    const item = cart.find((c) => String(c.id) === String(v.id));
    const nextQty = (item ? item.qty : 0) + 1;

    if (stock < nextQty) {
      showNotification(`Stok ${v.name} tidak mencukupi! Sisa: ${stock}`, 'error');
      return;
    }
    if (item) item.qty = nextQty;
    else cart.push({ id: String(v.id), qty: 1 });

    clearSearch();
    renderKasirCart();
  }

  function setQty(id, qty) {
    const item = cart.find((c) => String(c.id) === String(id));
    const v = getProduct(id);
    if (!item || !v) return;

    let next = Math.max(1, Math.floor(Number(qty) || 1));
    const stock = Number(v.stock) || 0;
    if (next > stock) {
      showNotification(`Stok ${v.name} tidak mencukupi! Sisa: ${stock}`, 'error');
      next = Math.max(1, stock);
    }
    item.qty = next;
    renderKasirCart();
  }

  function removeFromCart(id) {
    cart = cart.filter((c) => String(c.id) !== String(id));
    renderKasirCart();
  }

  function itemHtml(l) {
    const id = escapeHtml(l.v.id);
    const over = l.qty > l.stock;
    return `
      <div class="kasir-item" data-id="${id}">
        <div class="kasir-item-top">
          <strong class="kasir-item-name">${escapeHtml(l.v.name)}</strong>
          <button type="button" class="kasir-item-del" data-act="del" aria-label="Hapus ${escapeHtml(l.v.name)} dari keranjang">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
        <div class="kasir-item-bottom">
          <span class="kasir-pill">Ecer</span>
          <div class="kasir-qty">
            <button type="button" data-act="dec" aria-label="Kurangi">&minus;</button>
            <input type="text" inputmode="numeric" value="${l.qty}" aria-label="Jumlah" data-act="qty">
            <button type="button" data-act="inc" aria-label="Tambah">+</button>
          </div>
          <strong class="kasir-item-sub">${formatRupiah(l.sell)}</strong>
        </div>
        <small class="kasir-item-meta ${over ? 'warn' : ''}">
          ${over ? `Stok hanya ${l.stock} pcs, kurangi jumlahnya.` : `@ ${formatRupiah(l.price)} &middot; Stok ${l.stock} pcs`}
        </small>
      </div>`;
  }

  function renderKasirCart() {
    const listEl = $('kasir-cart-list');
    if (!listEl) return;

    const lines = getLines();
    if (lines.length === 0) {
      listEl.innerHTML = `
        <div class="kasir-empty">
          <i class="fa-solid fa-cart-shopping"></i>
          <strong>Keranjang masih kosong</strong>
          <span>Cari nama produk di atas untuk menambahkannya.</span>
        </div>`;
    } else {
      listEl.innerHTML = lines.map(itemHtml).join('');
    }

    const totalQty = lines.reduce((s, l) => s + l.qty, 0);
    $('kasir-cart-count').textContent = `${totalQty} item`;
    $('kasir-cart-total').textContent = formatRupiah(sumSell(lines));
    $('kasir-btn-next').disabled = lines.length === 0;

    const dateEl = $('kasir-date');
    if (dateEl) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      dateEl.max = now.toISOString().slice(0, 16);
    }

    if (isPayOpen()) {
      if (lines.length === 0) showCart();
      else updatePay();
    }
  }

  function showCart() {
    $(PAY_VIEW).hidden = true;
    $(CART_VIEW).hidden = false;
    window.scrollTo(0, 0);
  }

  function showPay() {
    const lines = getLines();
    if (lines.length === 0) {
      showNotification('Keranjang masih kosong!', 'error');
      return;
    }
    setSelectOptions($('vouch-pay-method'), accountOptions('-- Pilih Pembayaran --', true));
    setSelectOptions($('vouch-select-account'), accountOptions('-- Pilih Akun / Sumber Modal (Inject) --'));

    $(CART_VIEW).hidden = true;
    $(PAY_VIEW).hidden = false;
    updatePay();
    window.scrollTo(0, 0);
  }

  function calcTotals() {
    const lines = getLines();
    const subtotal = sumSell(lines);
    const rp = Math.min(Math.max(0, discount.rp), subtotal);
    return { lines, subtotal, discount: rp, total: subtotal - rp };
  }

  function setRpField(value) {
    $('kasir-disc-rp').value = value > 0 ? value.toLocaleString('id-ID') : '';
  }

  function updatePay() {
    const { lines, subtotal, discount: disc, total } = calcTotals();
    discount.rp = disc;

    $('kasir-pay-subtotal').textContent = formatRupiah(subtotal);
    const qty = lines.reduce((s, l) => s + l.qty, 0);
    $('kasir-pay-items').textContent = `${lines.length} produk, ${qty} item`;
    $('kasir-disc-hint').innerHTML = `&asymp; ${formatRupiah(disc)} dari ${pctLabel(subtotal ? (disc / subtotal) * 100 : 0)}%`;

    $('kasir-after-disc').querySelector('span').textContent = `Total Setelah Diskon: ${formatRupiah(total)}`;

    const isDebt = $('vouch-pay-method').value === 'Hutang';
    $('kasir-paid-wrap').hidden = isDebt;

    const box = $('kasir-change');
    const label = box.querySelector('span');
    const icon = box.querySelector('i');
    if (isDebt) {
      box.className = 'kasir-status info';
      icon.className = 'fa-solid fa-book-bookmark';
      label.textContent = `Dicatat sebagai hutang: ${formatRupiah(total)}`;
      return;
    }

    const diff = getCleanNumber($('kasir-paid')) - total;
    if (diff < 0) {
      box.className = 'kasir-status warn';
      icon.className = 'fa-solid fa-hand-holding-dollar';
      label.textContent = `Kurang: ${formatRupiah(-diff)}`;
    } else {
      box.className = 'kasir-status ok';
      icon.className = 'fa-solid fa-circle-check';
      label.textContent = `Kembalian: ${formatRupiah(diff)}`;
    }
  }

  function onDiscountRp() {
    const { subtotal } = calcTotals();
    const rp = Math.min(getCleanNumber($('kasir-disc-rp')), subtotal);
    discount.rp = rp;
    discount.pct = subtotal ? Math.round((rp / subtotal) * 10000) / 100 : 0;
    if (getCleanNumber($('kasir-disc-rp')) > subtotal) setRpField(rp);
    $('kasir-disc-pct').value = discount.pct > 0 ? pctLabel(discount.pct) : '';
    updatePay();
  }

  function onDiscountPct() {
    const el = $('kasir-disc-pct');
    el.value = el.value.replace(/[^\d.,]/g, '');
    let pct = parseFloat(el.value.replace(',', '.'));
    if (!isFinite(pct) || pct < 0) pct = 0;
    if (pct > 100) { pct = 100; el.value = '100'; }

    const { subtotal } = calcTotals();
    discount.pct = pct;
    discount.rp = Math.round((subtotal * pct) / 100);
    setRpField(discount.rp);
    updatePay();
  }

  function setPaid(amount) {
    const { total } = calcTotals();
    const value = amount === 'exact' ? total : Number(amount) || 0;
    $('kasir-paid').value = value > 0 ? value.toLocaleString('id-ID') : '';
    updatePay();
  }

  function resetKasir() {
    cart = [];
    discount = { rp: 0, pct: 0 };
    const form = $(PAY_VIEW);
    form.reset();
    form.dataset.print = '0';
    ['kasir-disc-rp', 'kasir-disc-pct', 'kasir-paid', 'kasir-date', 'kasir-search'].forEach((id) => { $(id).value = ''; });
    closeResults();
    showCart();
    renderKasirCart();
  }

  async function submitKasirSale() {
    const form = $(PAY_VIEW);
    const printAfter = form.dataset.print === '1';
    form.dataset.print = '0';

    const { lines, subtotal, discount: totalDisc, total } = calcTotals();
    if (lines.length === 0) {
      showNotification('Keranjang masih kosong!', 'error');
      return;
    }

    const accountId = $('vouch-select-account').value;
    const payMethod = $('vouch-pay-method').value;
    const customerName = $('vouch-customer-name').value.trim();

    if (!accountId || !payMethod) {
      showNotification('Lengkapi metode pembayaran dan akun sumber modal!', 'error');
      return;
    }
    const isDebt = payMethod === 'Hutang';
    if (isDebt && !customerName) {
      showNotification('Nama pelanggan wajib diisi untuk transaksi hutang!', 'error');
      return;
    }

    const accInject = findAccount(accountId);
    const receiver = findAccount(payMethod);
    if (!accInject || (!isDebt && !receiver)) {
      showNotification('Produk atau akun tidak ditemukan!', 'error');
      return;
    }

    for (const l of lines) {
      if (l.stock < l.qty) {
        showNotification(`Stok ${l.v.name} tidak mencukupi! Sisa: ${l.stock}`, 'error');
        return;
      }
    }

    const paid = getCleanNumber($('kasir-paid'));
    if (!isDebt && paid < total) {
      showNotification(`Nominal bayar masih kurang ${formatRupiah(total - paid)}.`, 'error');
      return;
    }

    let txDate = new Date().toISOString();
    const dateVal = $('kasir-date').value;
    if (dateVal) {
      const picked = new Date(dateVal);
      if (isNaN(picked.getTime())) {
        showNotification('Tanggal transaksi tidak valid.', 'error');
        return;
      }
      if (picked.getTime() > Date.now() + 60000) {
        showNotification('Tanggal transaksi tidak boleh di masa depan.', 'error');
        return;
      }
      txDate = picked.toISOString();
    }

    const totalModalSaldo = lines.reduce((s, l) => s + Number(l.v.modal_saldo || 0) * l.qty, 0);
    if (!(await confirmLowBalance(accInject, totalModalSaldo))) return;

    let remaining = totalDisc;
    const txs = [];
    const debts = [];
    const stockUpdates = [];

    lines.forEach((l, i) => {
      const isLast = i === lines.length - 1;
      let lineDisc = isLast ? remaining : Math.floor((totalDisc * l.sell) / (subtotal || 1));
      lineDisc = Math.min(lineDisc, l.sell, remaining);
      remaining -= lineDisc;

      const net = l.sell - lineDisc;
      const modalSaldo = Number(l.v.modal_saldo || 0) * l.qty;
      const modalFisik = Number(l.v.modal_fisik || 0) * l.qty;

      let notes = `Kasir: ${l.v.name} (${l.qty} pcs) via ${accInject.name}`;
      if (lineDisc > 0) notes += ` | Diskon ${formatRupiah(lineDisc)}`;
      if (customerName && !isDebt) notes += ` | Pelanggan: ${customerName}`;

      const txId = genId('tx');
      const debtId = isDebt ? genId('debt') : null;

      txs.push({
        id: txId,
        user_id: currentUserId,
        type: 'voucher',
        accountId: String(accInject.id),
        payAccountId: receiver ? String(receiver.id) : 'Hutang',
        voucherId: String(l.v.id),
        quantity: l.qty,
        debtId,
        notes,
        amount: modalSaldo,
        admin_fee: net,
        cost_price: modalSaldo + modalFisik,
        profit: net - (modalSaldo + modalFisik),
        date: txDate,
        status: isDebt ? 'Hutang' : 'Success'
      });

      if (isDebt) {
        debts.push({
          id: debtId, user_id: currentUserId, transactionId: txId,
          customer: customerName, amount: net, description: notes, date: txDate
        });
      }
      stockUpdates.push({ v: l.v, newStock: l.stock - l.qty });
    });

    const deltas = [{ accountId: accInject.id, delta: -totalModalSaldo }];
    if (receiver) deltas.push({ accountId: receiver.id, delta: total });
    const { ops: balanceOps, applies } = buildAccountOps(deltas);

    const ops = [];
    txs.forEach((tx) => ops.push(['transactions', tx, 'insert']));
    debts.forEach((d) => ops.push(['debts', d, 'insert']));
    stockUpdates.forEach((s) => ops.push(['vouchers', { stock: s.newStock }, 'update', s.v.id]));
    ops.push(...balanceOps);

    const ok = await runOps(ops);
    if (!ok) return;

    txs.forEach((tx) => appData.transactions.push(tx));
    debts.forEach((d) => appData.debts.push(d));
    stockUpdates.forEach((s) => { s.v.stock = s.newStock; });
    applies.forEach((fn) => fn());

    const ids = txs.map((t) => t.id);
    resetKasir();
    refreshAllViews();
    if (printAfter) printReceipts(ids);

    const change = !isDebt && paid > total ? ` Kembalian ${formatRupiah(paid - total)}.` : '';
    showNotification(`Transaksi kasir berhasil disimpan!${change}`, 'success');
    if (!isDebt) switchPage('transactions');
  }

  function setupKasirUi() {
    if (bound) return;
    const form = $(PAY_VIEW);
    if (!form || !$('kasir-search')) return;
    bound = true;

    const search = $('kasir-search');
    search.addEventListener('input', renderResults);
    search.addEventListener('focus', renderResults);
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const matches = findMatches(search.value);
      const exact = matches.find((v) => v.barcode && String(v.barcode).toLowerCase() === search.value.trim().toLowerCase());
      const pick = exact || (matches.length === 1 ? matches[0] : null);
      if (pick) addToCart(pick.id);
    });

    $('kasir-results').addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add && !add.disabled) { addToCart(add.dataset.add); return; }
      if (e.target.closest('[data-new-product]')) {
        const typed = search.value.trim();
        closeResults();
        if (typeof openAddProductModal === 'function') openAddProductModal(typed);
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.kasir-search')) closeResults();
    });

    const list = $('kasir-cart-list');
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      const row = e.target.closest('.kasir-item');
      if (!btn || !row) return;
      const item = cart.find((c) => String(c.id) === String(row.dataset.id));
      if (!item) return;
      if (btn.dataset.act === 'del') removeFromCart(item.id);
      else if (btn.dataset.act === 'inc') setQty(item.id, item.qty + 1);
      else if (btn.dataset.act === 'dec') setQty(item.id, item.qty - 1);
    });
    list.addEventListener('change', (e) => {
      const input = e.target.closest('input[data-act="qty"]');
      const row = e.target.closest('.kasir-item');
      if (input && row) setQty(row.dataset.id, parseMoney(input.value));
    });
    list.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input[data-act="qty"]')) { e.preventDefault(); e.target.blur(); }
    });

    $('kasir-btn-next').addEventListener('click', showPay);

    let html5QrCodeScanner = null;
    let scanHandled = false;
    const btnScanCam = $('btn-scan-camera');
    const wrapScanner = $('scanner-reader-wrap');
    const btnCloseCam = $('btn-close-scanner');

    if (btnScanCam && wrapScanner) {
      const stopCameraScanner = async () => {
        try {
          if (html5QrCodeScanner && html5QrCodeScanner.isScanning) {
            await html5QrCodeScanner.stop();
          }
        } catch (e) { /* abaikan */ }
        wrapScanner.style.display = 'none';
      };

      const onScanSuccess = (decodedText) => {
        if (scanHandled) return;
        scanHandled = true;
        const code = String(decodedText || '').trim();
        const match = (appData.vouchers || []).find(
          (v) => v.barcode && String(v.barcode).trim().toLowerCase() === code.toLowerCase()
        );

        if (match) {
          addToCart(match.id);
          showNotification(`"${match.name}" masuk ke keranjang!`, 'success');
        } else {
          search.value = code;
          renderResults();
          showNotification(`Barcode terbaca: ${code}`, 'success');
        }
        stopCameraScanner();
      };

      btnScanCam.addEventListener('click', async () => {
        if (typeof Html5Qrcode === 'undefined') {
          showNotification('Library scanner belum selesai dimuat. Periksa internet Anda.', 'error');
          return;
        }

        if (html5QrCodeScanner && html5QrCodeScanner.isScanning) {
          await stopCameraScanner();
          return;
        }

        scanHandled = false;
        wrapScanner.style.display = 'block';

        if (!html5QrCodeScanner) {
          const formats = (typeof Html5QrcodeSupportedFormats !== 'undefined') ? [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE
          ] : undefined;

          html5QrCodeScanner = new Html5Qrcode('scanner-reader', {
            formatsToSupport: formats,
            useBarCodeDetectorIfSupported: true,
            verbose: false
          });
        }

        const qrboxFn = (vw, vh) => ({
          width: Math.max(180, Math.floor(vw * 0.85)),
          height: Math.max(100, Math.floor(vh * 0.45))
        });

        try {
          await html5QrCodeScanner.start(
            { facingMode: 'environment' },
            {
              fps: 15,
              qrbox: qrboxFn,
              videoConstraints: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 },
                focusMode: 'continuous'
              }
            },
            onScanSuccess,
            () => {}
          );
        } catch (err) {
          try {
            await html5QrCodeScanner.start(
              { facingMode: 'environment' },
              { fps: 12, qrbox: qrboxFn },
              onScanSuccess,
              () => {}
            );
          } catch (err2) {
            console.error(err2);
            wrapScanner.style.display = 'none';
            showNotification('Gagal mengakses kamera. Izinkan izin kamera di browser Anda.', 'error');
          }
        }
      });

      if (btnCloseCam) {
        btnCloseCam.addEventListener('click', stopCameraScanner);
      }
      document.addEventListener('click', (e) => {
        if (e.target.closest('[data-page], #kasir-btn-next')) stopCameraScanner();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopCameraScanner();
      });
    }

    $('kasir-pay-back').addEventListener('click', showCart);
    $('kasir-btn-cancel').addEventListener('click', showCart);

    formatNumberInput($('kasir-disc-rp'));
    formatNumberInput($('kasir-paid'));
    $('kasir-disc-rp').addEventListener('input', onDiscountRp);
    $('kasir-disc-pct').addEventListener('input', onDiscountPct);
    $('kasir-paid').addEventListener('input', updatePay);
    $('vouch-pay-method').addEventListener('change', updatePay);

    form.querySelector('.kasir-quick').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-amt]');
      if (btn) setPaid(btn.dataset.amt);
    });

    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
    });

    $('kasir-btn-print').addEventListener('click', () => {
      form.dataset.print = '1';
      form.requestSubmit();
    });

    guardSubmit(form, submitKasirSale);
    renderKasirCart();
  }

  window.setupKasirUi = setupKasirUi;
  window.renderKasirCart = renderKasirCart;
})();