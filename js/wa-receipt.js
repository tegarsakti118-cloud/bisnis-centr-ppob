// ==========================================
// NEXORA - KIRIM STRUK VIA WHATSAPP (wa-receipt.js)
// Fitur: Format pesan struk rapi + redirect ke WhatsApp
// ==========================================
(function () {
  'use strict';

  function formatRp(n) {
    return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  }

  function cleanPhone(raw) {
    let p = String(raw || '').replace(/\D/g, '');
    if (p.startsWith('0')) {
      p = '62' + p.slice(1);
    } else if (p.startsWith('8')) {
      p = '62' + p;
    }
    return p;
  }

  function generateReceiptText(txList, ctx) {
    const biz = ctx.biz || {};
    const br = biz.branch || {};
    const names = ctx.names || {};
    const me = ctx.me || {};

    const fmtDT = (d) => new Date(d).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const dash = '--------------------------------';
    let text = `🧾 *STRUK PEMBAYARAN*\n`;
    text += `*${(biz.name || 'NEXORA').toUpperCase()}*\n`;
    if (br.name) text += `${br.name} ${br.code ? `(${br.code})` : ''}\n`;
    if (br.address) text += `${br.address}\n`;
    if (br.phone) text += `Telp/WA: ${br.phone}\n`;
    text += `${dash}\n`;

    let totalBayar = 0;

    txList.forEach((tx) => {
      const kasir = (tx.user_id && names[String(tx.user_id)]) || me.full_name || '-';
      const isHutang = tx.status === 'Hutang';
      const payAmount = Number(tx.admin_fee || 0);
      totalBayar += payAmount;

      text += `No. Struk : \`${String(tx.id).toUpperCase()}\`\n`;
      text += `Waktu     : ${fmtDT(tx.date)} WIB\n`;
      text += `Kasir     : ${kasir}\n`;

      if (tx.type === 'voucher') {
        text += `Produk    : *${tx.notes || '-'}*\n`;
        if (tx.quantity) text += `Jumlah    : ${tx.quantity} pcs\n`;
        text += `Harga     : ${formatRp(payAmount)}\n`;
      } else {
        text += `Layanan   : *${tx.notes || '-'}*\n`;
        text += `Nominal   : ${formatRp(tx.amount)}\n`;
        const adminFee = Number(tx.admin_fee || 0) - Number(tx.amount || 0);
        if (adminFee > 0) {
          text += `Biaya Adm : ${formatRp(adminFee)}\n`;
        }
        text += `Total     : ${formatRp(payAmount)}\n`;
      }

      text += `Status    : *${isHutang ? '⚠️ BELUM LUNAS / HUTANG' : '✅ LUNAS / BERHASIL'}*\n`;
      text += `${dash}\n`;
    });

    text += `*TOTAL BAYAR : ${formatRp(totalBayar)}*\n`;
    text += `${dash}\n`;
    text += `_Terima kasih atas kunjungan Anda._\n`;
    text += `_Simpan pesan ini sebagai bukti transaksi sah._\n`;

    return text;
  }

  function sendReceiptWA(txIds, defaultPhone = '') {
    // Kumpulkan semua sumber data transaksi yang sedang aktif (appData + hasil filter Riwayat)
    const allTransactions = [
      ...((window.appData && window.appData.transactions) || []),
      ...((window.NxHistory && window.NxHistory.state && window.NxHistory.state.txRows) || [])
    ];

    // Cari transaksi dengan perbandingan string yang aman
    const list = (txIds || []).map((id) => {
      return allTransactions.find((t) => String(t.id).trim().toLowerCase() === String(id).trim().toLowerCase());
    }).filter(Boolean);

    // Hapus duplikat jika transaksi ada di kedua list
    const uniqueList = Array.from(new Map(list.map((item) => [String(item.id), item])).values());

    if (!uniqueList.length) {
      if (typeof showNotification === 'function') {
        showNotification('Transaksi tidak ditemukan.', 'error');
      }
      return;
    }

    const ctx = {
      biz: window.nxBiz || {},
      br: (window.nxBiz || {}).branch || {},
      names: window.nxStaffNames || {},
      me: window.nxMe || {}
    };

    // Deteksi nomor HP pelanggan jika ada di data transaksi
    let prefillPhone = String(defaultPhone || '').replace(/"/g, '');
    if (!prefillPhone) {
      const first = uniqueList[0];
      const match = String(first.notes || '').match(/08\d{8,12}/);
      if (match) prefillPhone = match[0];
    }

    // Modal popup meminta nomor WhatsApp pelanggan
    const modal = document.createElement('div');
    modal.className = 'app-modal';
    modal.style.zIndex = '100005';
    modal.innerHTML = `
      <div class="app-modal-box" style="border-color: rgba(34, 197, 94, 0.5);">
        <div class="app-modal-head" style="color: #22c55e;">
          <i class="fa-brands fa-whatsapp" style="font-size:24px;"></i>
          <h3>Kirim Struk via WhatsApp</h3>
        </div>
        <p class="app-modal-text">Masukkan nomor WhatsApp tujuan pelanggan:</p>
        <div class="form-group" style="margin-bottom: 14px;">
          <input type="tel" id="wa-phone-target" class="glass-input" 
            placeholder="Contoh: 081234567890" value="${prefillPhone}" autocomplete="off" style="font-size:15px; font-weight:600;">
        </div>
        <div class="app-modal-actions">
          <button type="button" id="wa-btn-cancel" class="app-btn-ghost">Batal</button>
          <button type="button" id="wa-btn-send" class="app-btn-solid" style="background: #22c55e; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <i class="fa-brands fa-whatsapp"></i> Buka WhatsApp
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    const input = modal.querySelector('#wa-phone-target');
    input.focus();
    input.select();

    modal.querySelector('#wa-btn-cancel').onclick = () => modal.remove();
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#wa-btn-send').onclick = () => {
      const phone = cleanPhone(input.value);
      if (!phone || phone.length < 9) {
        if (typeof showNotification === 'function') {
          showNotification('Nomor WhatsApp tidak valid!', 'error');
        }
        return;
      }

      const receiptMsg = generateReceiptText(uniqueList, ctx);
      const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(receiptMsg)}`;

      modal.remove();
      const win = window.open(url, '_blank');
      if (!win) window.location.href = url;
    };
  }

  window.NxWhatsApp = {
    generateReceiptText,
    sendReceiptWA,
    cleanPhone
  };
})();