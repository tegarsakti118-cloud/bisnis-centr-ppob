// ==========================================
// NEXORA - NOTIFIKASI HALAMAN LOGIN / DAFTAR / LUPA PASSWORD
// Menggantikan alert() bawaan browser.
//   notify(pesan, tipe, durasiMs)  -> tipe: 'success' | 'error' | 'warning' | 'info'
//   authMessage(error)             -> pesan error Supabase dalam bahasa Indonesia
// ==========================================
(function () {
  const css = `
    #sk-toast-stack {
      position: fixed;
      top: max(16px, env(safe-area-inset-top, 0px));
      left: 50%;
      transform: translateX(-50%);
      width: min(92vw, 380px);
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 100000;
      pointer-events: none;
    }
    .sk-toast {
      --sk-accent: #58a6ff;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 14px 16px 14px;
      background: #161b22;
      border: 1px solid #30363d;
      border-left: 4px solid var(--sk-accent);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
      color: #e6edf3;
      font-family: 'Plus Jakarta Sans', sans-serif;
      pointer-events: auto;
      cursor: pointer;
      opacity: 0;
      transform: translateY(-14px) scale(0.97);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    .sk-toast.sk-in { opacity: 1; transform: translateY(0) scale(1); }
    .sk-toast.sk-out { opacity: 0; transform: translateY(-10px) scale(0.97); }
    .sk-toast.sk-success { --sk-accent: #17A897; }
    .sk-toast.sk-error   { --sk-accent: #f85149; }
    .sk-toast.sk-warning { --sk-accent: #d29922; }
    .sk-toast.sk-info    { --sk-accent: #58a6ff; }
    .sk-toast-icon {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: var(--sk-accent);
      background: color-mix(in srgb, var(--sk-accent) 16%, transparent);
    }
    .sk-toast-body { flex: 1; min-width: 0; }
    .sk-toast-title { font-size: 12px; font-weight: 700; color: var(--sk-accent); margin-bottom: 2px; }
    .sk-toast-text { font-size: 13px; line-height: 1.45; color: #e6edf3; word-wrap: break-word; }
    .sk-toast-close {
      flex-shrink: 0;
      background: none;
      border: none;
      color: #8b949e;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 0 2px;
    }
    .sk-toast-bar {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 3px;
      width: 100%;
      background: var(--sk-accent);
      opacity: 0.7;
      transform-origin: left;
      animation: sk-bar linear forwards;
    }
    @keyframes sk-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    .login-card.sk-shake { animation: sk-shake 0.4s ease; }
    @keyframes sk-shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-8px); }
      40% { transform: translateX(7px); }
      60% { transform: translateX(-5px); }
      80% { transform: translateX(3px); }
    }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const TYPES = {
    success: { icon: 'fa-circle-check', title: 'Berhasil', time: 3000 },
    error:   { icon: 'fa-circle-xmark', title: 'Gagal', time: 5000 },
    warning: { icon: 'fa-triangle-exclamation', title: 'Perhatian', time: 3500 },
    info:    { icon: 'fa-circle-info', title: 'Info', time: 3500 }
  };

  function getStack() {
    let stack = document.getElementById('sk-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'sk-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    return stack;
  }

  function escapeText(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function shakeCard() {
    const card = document.querySelector('.login-card');
    if (!card) return;
    card.classList.remove('sk-shake');
    void card.offsetWidth; // restart animasi
    card.classList.add('sk-shake');
    setTimeout(() => card.classList.remove('sk-shake'), 450);
  }

  // Menampilkan notifikasi. Mengembalikan Promise yang selesai saat notifikasi hilang
  // (berguna: await notify(...) sebelum redirect agar pesan sempat terbaca).
  window.notify = function (message, type, duration) {
    const cfg = TYPES[type] || TYPES.info;
    const key = (TYPES[type] ? type : 'info');
    const ms = duration || cfg.time;
    const stack = getStack();

    // Pesan identik yang masih tampil tidak ditumpuk (mencegah spam saat tombol ditekan berulang)
    const existing = Array.from(stack.children).find((el) => el.dataset.msg === message && el.dataset.type === key);
    if (existing) {
      existing.classList.remove('sk-in');
      void existing.offsetWidth;
      existing.classList.add('sk-in');
      if (key === 'error' || key === 'warning') shakeCard();
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    while (stack.children.length >= 3) stack.firstElementChild.remove();

    const el = document.createElement('div');
    el.className = `sk-toast sk-${key}`;
    el.dataset.msg = message;
    el.dataset.type = key;
    el.setAttribute('role', key === 'error' ? 'alert' : 'status');
    el.innerHTML = `
      <div class="sk-toast-icon"><i class="fa-solid ${cfg.icon}"></i></div>
      <div class="sk-toast-body">
        <div class="sk-toast-title">${cfg.title}</div>
        <div class="sk-toast-text">${escapeText(message)}</div>
      </div>
      <button type="button" class="sk-toast-close" aria-label="Tutup">&times;</button>
      <div class="sk-toast-bar" style="animation-duration:${ms}ms"></div>
    `;
    stack.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('sk-in')));

    if (key === 'error' || key === 'warning') shakeCard();

    return new Promise((resolve) => {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        el.classList.remove('sk-in');
        el.classList.add('sk-out');
        setTimeout(() => { el.remove(); resolve(); }, 260);
      };
      el.addEventListener('click', close);
      setTimeout(close, ms);
    });
  };

  // Terjemahan pesan error Supabase Auth
  window.authMessage = function (err) {
    if (!err) return 'Terjadi kesalahan. Silakan coba lagi.';
    const raw = typeof err === 'string' ? err : (err.message || err.error_description || '');
    const code = String(err.code || err.error_code || '').toLowerCase();
    const msg = raw.toLowerCase();

    if (msg.includes('invalid login credentials')) return 'Email atau password salah.';
    if (msg.includes('email not confirmed')) return 'Email belum dikonfirmasi. Cek inbox atau folder spam Anda.';
    if (msg.includes('user already registered') || code === 'user_already_exists') return 'Email ini sudah terdaftar. Silakan masuk.';
    if (msg.includes('rate limit') || code.includes('rate_limit')) return 'Terlalu banyak permintaan email. Tunggu sekitar 1 jam lalu coba lagi.';

    const wait = raw.match(/after (\d+) seconds?/i);
    if (wait) return `Demi keamanan, tunggu ${wait[1]} detik sebelum mencoba lagi.`;

    if (msg.includes('at least 6 characters')) return 'Password minimal 6 karakter.';
    if (msg.includes('different from the old password')) return 'Password baru harus berbeda dari password lama.';
    if (msg.includes('token has expired') || msg.includes('otp') || code === 'otp_expired') return 'Kode salah atau sudah kedaluwarsa.';
    if (msg.includes('invalid format') || msg.includes('unable to validate email')) return 'Format email tidak valid.';
    if (msg.includes('signups not allowed') || code === 'signup_disabled') return 'Pendaftaran akun baru sedang dinonaktifkan.';
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed')) {
      return 'Koneksi internet bermasalah. Periksa jaringan Anda.';
    }
    if (msg.includes('auth session missing')) return 'Sesi tidak ditemukan. Silakan ulangi dari awal.';

    return raw || 'Terjadi kesalahan. Silakan coba lagi.';
  };
})();
