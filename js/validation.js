// ==========================================
// NEXORA - VALIDASI SAMA APLIKASI (UI BADGE MODERN V9)
// ==========================================
(function () {
  'use strict';

  const SAME_APP_MESSAGE = 'Aplikasi pengirim dan penerima tidak boleh sama.';

  // 1. Injeksi Style CSS Langsung ke DOM Header
  function injectStyles() {
    if (document.getElementById('nx-alert-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'nx-alert-fix-style';
    style.textContent = `
      /* Ubah teks peringatan biasa menjadi Card Badge Glassmorphic Koral */
      .nx-alert-card,
      #ts-same-warning,
      #tf-same-warning,
      .nx-field-warning {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        margin: 12px 0 16px 0 !important;
        padding: 12px 16px !important;
        background: rgba(248, 113, 113, 0.12) !important;
        border: 1px solid rgba(248, 113, 113, 0.4) !important;
        border-left: 4px solid #f87171 !important;
        border-radius: 12px !important;
        color: #fca5a5 !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        line-height: 1.4 !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35) !important;
        backdrop-filter: blur(12px) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        animation: nxWarningPop 0.25s ease-out !important;
      }

      /* Sembunyikan elemen jika dalam kondisi tersembunyi */
      #ts-same-warning[style*="display: none"],
      #tf-same-warning[style*="display: none"],
      .nx-field-warning[style*="display: none"] {
        display: none !important;
      }

      /* Ikon Seruan Merah di Depan Pesan */
      .nx-alert-card::before,
      #ts-same-warning::before,
      #tf-same-warning::before,
      .nx-field-warning::before {
        content: "\\f06a" !important;
        font-family: "Font Awesome 6 Free" !important;
        font-weight: 900 !important;
        font-size: 16px !important;
        color: #f87171 !important;
        flex-shrink: 0 !important;
      }

      /* Highlight merah pada select box yang bentrok */
      select.input-invalid,
      .input-wrapper:has(select.input-invalid) {
        border-color: #f87171 !important;
        box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.25) !important;
      }

      @keyframes nxWarningPop {
        0% { opacity: 0; transform: translateY(-6px); }
        100% { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  // 2. Scan Teks di Layar dan Ubah Otomatis saat Teks Muncul
  function startAutoStyling() {
    const applyToElements = () => {
      document.querySelectorAll('div, p, span, small').forEach((el) => {
        if (el.children.length === 0 && el.textContent.trim() === SAME_APP_MESSAGE) {
          const target = el.parentElement && el.parentElement.children.length === 1 ? el.parentElement : el;
          if (!target.classList.contains('nx-alert-card')) {
            target.classList.add('nx-alert-card');
          }
        }
      });
    };

    applyToElements();
    const observer = new MutationObserver(applyToElements);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  // 3. Validasi Pasangan Akun
  function validateAccountPair(fromId, toId) {
    if (!fromId || !toId) return { ok: true, message: '' };
    if (toId === 'Hutang') return { ok: true, message: '' };
    if (String(fromId) === String(toId)) {
      return { ok: false, message: SAME_APP_MESSAGE };
    }
    return { ok: true, message: '' };
  }

  function bindPairGuard(formElement, inputElements, getPairFn, targetContainerEl) {
    injectStyles();
    if (!formElement) return;

    function checkAndApply() {
      const pair = getPairFn();
      if (!pair) {
        clearWarning(formElement, inputElements);
        return true;
      }
      const [fromId, toId] = pair;
      const res = validateAccountPair(fromId, toId);
      const submitBtn = formElement.querySelector('button[type="submit"]');

      if (!res.ok) {
        showWarning(formElement, res.message, targetContainerEl, inputElements);
        formElement.dataset.pairInvalid = '1';
        if (submitBtn) submitBtn.disabled = true;
        return false;
      } else {
        clearWarning(formElement, inputElements);
        formElement.dataset.pairInvalid = '0';
        if (submitBtn && formElement.dataset.busy !== '1') submitBtn.disabled = false;
        return true;
      }
    }

    inputElements.forEach((el) => {
      if (el) {
        el.addEventListener('change', checkAndApply);
        el.addEventListener('input', checkAndApply);
      }
    });

    checkAndApply();
    return checkAndApply;
  }

  function showWarning(formElement, message, targetContainerEl, inputElements) {
    let warnEl = formElement.querySelector('.nx-field-warning');
    if (!warnEl) {
      warnEl = document.createElement('div');
      warnEl.className = 'nx-field-warning nx-alert-card';
      warnEl.innerHTML = `<span>${message}</span>`;
      
      const anchor = targetContainerEl || formElement.querySelector('.input-group:nth-child(5)') || formElement.lastElementChild;
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(warnEl, anchor.nextSibling);
      } else {
        formElement.appendChild(warnEl);
      }
    } else {
      warnEl.classList.add('nx-alert-card');
      const span = warnEl.querySelector('span');
      if (span) span.textContent = message;
      else warnEl.textContent = message;
    }
    warnEl.style.display = 'flex';

    if (inputElements) {
      inputElements.forEach(el => {
        if (el && el.value) el.classList.add('input-invalid');
      });
    }
  }

  function clearWarning(formElement, inputElements) {
    const warnEl = formElement.querySelector('.nx-field-warning');
    if (warnEl) warnEl.style.display = 'none';

    const tfWarn = formElement.querySelector('#tf-same-warning');
    if (tfWarn) tfWarn.style.display = 'none';

    const tsWarn = formElement.querySelector('#ts-same-warning');
    if (tsWarn) tsWarn.style.display = 'none';

    if (inputElements) {
      inputElements.forEach(el => {
        if (el) el.classList.remove('input-invalid');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectStyles();
      startAutoStyling();
    });
  } else {
    injectStyles();
    startAutoStyling();
  }

  window.NxValidation = {
    SAME_APP_MESSAGE,
    validateAccountPair,
    bindPairGuard,
    injectStyles
  };
})();