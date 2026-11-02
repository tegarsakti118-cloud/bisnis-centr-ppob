// ==========================================
// NEXORA - PEMILIH KUSTOM (pengganti tampilan semua <select>)
//
// Cara kerja:
//   - <select> asli TETAP ada di halaman (disembunyikan secara visual) dan menjadi sumber nilai.
//     Jadi semua kode lama (select.value, setSelectOptions, form.reset, validasi "required",
//     event "change") berjalan seperti biasa tanpa perubahan.
//   - Di atasnya dipasang tombol pemicu; saat diketuk muncul dialog daftar pilihan dengan radio.
//   - Select yang dibuat belakangan (modal, dialog fitur) otomatis ikut diubah.
//   - Select yang ingin tetap bawaan browser: beri atribut data-native-select.
// ==========================================
(function () {
  'use strict';
  if (window.__nxPickerLoaded) return;
  window.__nxPickerLoaded = true;

  const SEARCH_MIN_OPTIONS = 8; // kolom cari muncul jika pilihan lebih dari ini
  const CLOSE_MS = 180;

  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

  let overlay = null;
  let titleEl = null;
  let searchWrap = null;
  let searchInput = null;
  let listEl = null;
  let activeSelect = null;
  let closeTimer = null;

  function selectedOption(sel) {
    return sel.options[sel.selectedIndex] || null;
  }

  // Samakan tampilan tombol dengan kondisi <select> (teks terpilih, disabled, tersembunyi)
  function syncTrigger(sel) {
    const trigger = sel._pkTrigger;
    if (!trigger) return;
    const opt = selectedOption(sel);
    const text = opt ? opt.textContent.trim() : '';
    trigger.querySelector('.pk-label').textContent = text || '\u00A0';
    trigger.classList.toggle('pk-placeholder', !opt || opt.value === '');
    trigger.disabled = sel.disabled;
    sel._pkWrap.style.display = (sel.hidden || sel.style.display === 'none') ? 'none' : '';
  }

  function labelFor(sel) {
    const group = sel._pkWrap && sel._pkWrap.closest('.form-group');
    const label = group ? group.querySelector('label') : null;
    const text = label ? label.textContent.replace(/\s+/g, ' ').trim() : '';
    return text || sel.getAttribute('aria-label') || 'Pilih opsi';
  }

  function enhance(sel) {
    if (!sel || sel._pkTrigger || sel.multiple || sel.hasAttribute('data-native-select')) return;
    if (overlay && overlay.contains(sel)) return;

    const wrap = document.createElement('div');
    wrap.className = 'pk-wrap';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'glass-input pk-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span class="pk-label"></span><i class="fa-solid fa-chevron-down pk-caret" aria-hidden="true"></i>';

    // Tandai dulu agar observer global tidak memproses ulang select yang sedang dipindah
    sel._pkTrigger = trigger;
    sel._pkWrap = wrap;

    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(trigger);
    wrap.appendChild(sel);

    sel.classList.add('pk-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    // select.value = ... / select.selectedIndex = ... dari kode lain ikut memperbarui tombol
    Object.defineProperty(sel, 'value', {
      configurable: true,
      get() { return valueDesc.get.call(this); },
      set(v) { valueDesc.set.call(this, v); syncTrigger(this); }
    });
    Object.defineProperty(sel, 'selectedIndex', {
      configurable: true,
      get() { return indexDesc.get.call(this); },
      set(v) { indexDesc.set.call(this, v); syncTrigger(this); }
    });

    // Fokus (mis. dari validasi form) diarahkan ke tombol yang terlihat
    sel.focus = (opts) => trigger.focus(opts);
    sel.addEventListener('focus', () => trigger.focus());

    // Validasi "required" bawaan browser: tandai tombol merah
    sel.addEventListener('invalid', () => trigger.classList.add('pk-invalid'));
    sel.addEventListener('change', () => { trigger.classList.remove('pk-invalid'); syncTrigger(sel); });

    // Isi/atribut select berubah (setSelectOptions memakai innerHTML) -> sinkronkan
    new MutationObserver(() => {
      syncTrigger(sel);
      if (activeSelect === sel && overlay && !overlay.hidden) renderList(sel, searchInput.value);
    }).observe(sel, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'hidden', 'style', 'selected', 'label']
    });

    trigger.addEventListener('click', () => openPicker(sel));
    syncTrigger(sel);
  }

  // ---------- Dialog ----------
  function buildOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'pk-overlay';
    overlay.className = 'pk-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="pk-sheet" role="dialog" aria-modal="true" aria-labelledby="pk-title">' +
        '<div class="pk-head">' +
          '<h5 id="pk-title"></h5>' +
          '<button type="button" class="pk-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="pk-search" hidden>' +
          '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
          '<input type="text" placeholder="Cari..." autocomplete="off" aria-label="Cari pilihan">' +
        '</div>' +
        '<div class="pk-list" role="listbox"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    titleEl = overlay.querySelector('#pk-title');
    searchWrap = overlay.querySelector('.pk-search');
    searchInput = searchWrap.querySelector('input');
    listEl = overlay.querySelector('.pk-list');

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closePicker(); });
    overlay.querySelector('.pk-close').addEventListener('click', () => closePicker());
    searchInput.addEventListener('input', () => { if (activeSelect) renderList(activeSelect, searchInput.value); });

    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.pk-item');
      if (!item || item.disabled || !activeSelect) return;
      choose(Number(item.dataset.index));
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePicker();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(listEl.querySelectorAll('.pk-item:not(:disabled)'));
        if (items.length === 0) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
        items[next].focus();
      }
    });
  }

  function renderList(sel, query) {
    const q = String(query || '').trim().toLowerCase();
    const opts = Array.from(sel.options);
    searchWrap.hidden = opts.filter((o) => !o.disabled).length <= SEARCH_MIN_OPTIONS;

    const frag = document.createDocumentFragment();
    let shown = 0;
    opts.forEach((opt, index) => {
      if (opt.hidden) return;
      const text = opt.textContent.trim();
      if (q && !text.toLowerCase().includes(q)) return;

      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'pk-item' + (opt.value === '' ? ' pk-item-empty' : '');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
      item.dataset.index = String(index);
      item.disabled = opt.disabled;

      const label = document.createElement('span');
      label.className = 'pk-item-text';
      label.textContent = text || '\u00A0';
      const radio = document.createElement('span');
      radio.className = 'pk-radio';
      radio.setAttribute('aria-hidden', 'true');
      item.appendChild(label);
      item.appendChild(radio);
      frag.appendChild(item);
      shown++;
    });

    listEl.textContent = '';
    if (shown === 0) {
      const empty = document.createElement('div');
      empty.className = 'pk-empty';
      empty.textContent = 'Tidak ada pilihan yang cocok';
      listEl.appendChild(empty);
    } else {
      listEl.appendChild(frag);
    }
  }

  function openPicker(sel) {
    if (sel.disabled) return;
    buildOverlay();
    clearTimeout(closeTimer);

    if (activeSelect && activeSelect !== sel) activeSelect._pkTrigger.setAttribute('aria-expanded', 'false');
    activeSelect = sel;
    sel._pkTrigger.setAttribute('aria-expanded', 'true');

    titleEl.textContent = labelFor(sel);
    searchInput.value = '';
    renderList(sel, '');

    overlay.hidden = false;
    document.body.classList.add('pk-lock');
    requestAnimationFrame(() => overlay.classList.add('pk-open'));

    // Fokus ke pilihan terpilih (bukan kolom cari, agar keyboard HP tidak langsung muncul)
    const current = listEl.querySelector('.pk-item[aria-selected="true"]') || listEl.querySelector('.pk-item:not(:disabled)');
    if (current) {
      current.focus({ preventScroll: true });
      current.scrollIntoView({ block: 'center' });
    }
  }

  function closePicker(restoreFocus) {
    if (!overlay || overlay.hidden) return;
    const sel = activeSelect;
    overlay.classList.remove('pk-open');
    document.body.classList.remove('pk-lock');
    if (sel && sel._pkTrigger) {
      sel._pkTrigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus !== false) sel._pkTrigger.focus({ preventScroll: true });
    }
    activeSelect = null;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (!activeSelect) overlay.hidden = true; }, CLOSE_MS);
  }

  function choose(index) {
    const sel = activeSelect;
    if (!sel) return;
    const changed = sel.selectedIndex !== index;
    if (changed) sel.selectedIndex = index; // setter kita sekaligus memperbarui tombol
    closePicker();
    if (changed) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // ---------- Inisialisasi ----------
  function enhanceAll(root) {
    if (root.tagName === 'SELECT') { enhance(root); return; }
    if (root.querySelectorAll) root.querySelectorAll('select').forEach(enhance);
  }

  function init() {
    enhanceAll(document);

    // Select yang dibuat belakangan (modal form, dialog fitur)
    new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((n) => { if (n.nodeType === 1) enhanceAll(n); });
      });
    }).observe(document.body, { childList: true, subtree: true });

    // form.reset() mengembalikan nilai tanpa event -> sinkronkan tombol setelahnya
    document.addEventListener('reset', (e) => {
      const form = e.target;
      setTimeout(() => {
        if (form && form.querySelectorAll) form.querySelectorAll('select').forEach(syncTrigger);
      }, 0);
    }, true);
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
