/*
 * Secret Codebook UI. All data stays in this browser.
 * Matching and encryption live in src/codebook.js.
 */
(function () {
  'use strict';

  const SC = window.SecretCodebook;
  const STORAGE_KEY = 'secret-codebook.vault.v1';
  const AUTO_LOCK_MS = 5 * 60 * 1000;
  const DEMO_PASSPHRASE = 'demo1234';
  const DEMO_ENTRIES = [
    { code: 'project mango', value: 'Acme Robotics Pvt. Ltd.' },
    { code: 'my usual number', value: '+91 98765 43210' },
    { code: 'home base | homebase', value: 'Flat 4B, Green Park, New Delhi 110016' },
    { code: 'code falcon', value: 'the Zeta Labs interview on Friday at 4 pm' },
    { code: 'the blue file', value: 'Q3 salary revision sheet' },
  ];

  const $ = (id) => document.getElementById(id);

  const state = {
    vault: null,
    key: null,
    entries: [],
    decoded: '',
    lastSpoken: '',
    editingIndex: -1,
    lastActivity: Date.now(),
  };

  // ---- Storage ----

  function loadStoredVault() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? SC.checkVault(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  function storeVault(vault) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vault));
    } catch {
      toast('Could not save: browser storage is blocked. Export a backup to keep your changes.');
    }
  }

  function clearStoredVault() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing stored, nothing to clear.
    }
  }

  // ---- Small helpers ----

  let toastTimer;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function setLockError(message) {
    $('lock-error').textContent = message;
  }

  // Disables a form's buttons while slow work (key derivation) runs.
  async function withBusy(container, work) {
    const buttons = container.querySelectorAll('button');
    buttons.forEach((b) => { b.disabled = true; });
    setLockError('');
    try {
      await work();
    } catch (err) {
      setLockError(err.message);
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  // ---- Screens ----

  function showLockScreen() {
    const hasVault = Boolean(loadStoredVault());
    $('app-screen').hidden = true;
    $('lock-btn').hidden = true;
    $('lock-screen').hidden = false;
    $('setup-view').hidden = hasVault;
    $('unlock-view').hidden = !hasVault;
    setLockError('');
    (hasVault ? $('unlock-pass') : $('setup-pass')).focus();
  }

  function unlockWith(vault, key, entries) {
    state.vault = vault;
    state.key = key;
    state.entries = entries;
    state.lastActivity = Date.now();
    ['setup-pass', 'setup-confirm', 'unlock-pass'].forEach((id) => { $(id).value = ''; });

    $('lock-screen').hidden = true;
    $('app-screen').hidden = false;
    $('lock-btn').hidden = false;
    showMessages([], []);
    renderEntries();
    renderDecoded();
    $('spoken').focus();
  }

  function lock() {
    state.vault = null;
    state.key = null;
    state.entries = [];
    state.decoded = '';
    $('spoken').value = '';
    state.lastSpoken = '';
    $('decoded').textContent = '';
    $('entry-list').textContent = '';
    resetEntryForm();
    showLockScreen();
  }

  // ---- Lock screen actions ----

  $('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('setup-pass').value !== $('setup-confirm').value) {
      setLockError('The two passphrases do not match.');
      return;
    }
    withBusy(e.target, async () => {
      const { vault, key } = await SC.createVault($('setup-pass').value, []);
      storeVault(vault);
      unlockWith(vault, key, []);
      toast('Codebook created. Add your first code word.');
      $('entry-code').focus();
    });
  });

  $('demo-btn').addEventListener('click', (e) => {
    withBusy(e.target.closest('.lock-card'), async () => {
      const { vault, key } = await SC.createVault(DEMO_PASSPHRASE, DEMO_ENTRIES);
      storeVault(vault);
      unlockWith(vault, key, DEMO_ENTRIES.map((entry) => ({ ...entry })));
      toast(`Demo loaded. Its passphrase is ${DEMO_PASSPHRASE}.`);
    });
  });

  $('unlock-form').addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(e.target, async () => {
      const stored = loadStoredVault();
      if (!stored) {
        showLockScreen();
        return;
      }
      const { entries, key } = await SC.openVault(stored, $('unlock-pass').value);
      unlockWith(stored, key, entries);
    });
  });

  $('reset-btn').addEventListener('click', () => {
    const sure = window.confirm(
      'Delete the codebook stored in this browser? This cannot be undone. ' +
      'Without the passphrase, the data cannot be recovered.'
    );
    if (!sure) return;
    clearStoredVault();
    showLockScreen();
    toast('Codebook deleted.');
  });

  $('lock-btn').addEventListener('click', lock);

  // ---- Backup ----

  function openImportPicker() {
    $('import-file').value = '';
    $('import-file').click();
  }

  $('import-btn').addEventListener('click', openImportPicker);
  $('unlock-import-btn').addEventListener('click', openImportPicker);

  $('import-file').addEventListener('change', async () => {
    const file = $('import-file').files[0];
    if (!file) return;
    let vault;
    try {
      vault = SC.checkVault(JSON.parse(await file.text()));
    } catch {
      toast('That file is not a Secret Codebook backup.');
      return;
    }
    if (loadStoredVault() && !window.confirm('Replace the codebook in this browser with this backup?')) return;
    storeVault(vault);
    lock();
    toast('Backup restored. Unlock it with the passphrase it was made with.');
  });

  $('export-btn').addEventListener('click', () => {
    if (!state.vault) return;
    const blob = new Blob([JSON.stringify(state.vault, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `secret-codebook-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast('Encrypted backup downloaded. It still needs your passphrase to open.');
  });

  // ---- Secret pad ----

  function renderDecoded() {
    const spoken = $('spoken').value;
    const result = SC.decode(spoken, state.entries);
    const out = $('decoded');
    state.lastSpoken = spoken;
    state.decoded = result.text;

    out.textContent = '';
    out.classList.toggle('empty', !spoken.trim());
    if (!spoken.trim()) {
      out.textContent = 'Your decoded message will appear here.';
    } else {
      for (const segment of result.segments) {
        if (segment.secret) {
          const mark = element('mark', '', segment.text);
          mark.title = `You said “${segment.spoken}”`;
          out.append(mark);
        } else {
          out.append(document.createTextNode(segment.text));
        }
      }
    }
    $('match-count').textContent = plural(result.count, 'secret');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to the older copy command below.
    }
    const area = element('textarea', 'offscreen');
    area.value = text;
    area.setAttribute('readonly', '');
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }

  async function copyAndClear() {
    if (!state.decoded.trim()) {
      toast('Nothing to copy yet. Dictate something first.');
      return;
    }
    if (!(await copyText(state.decoded))) {
      toast('Copy failed. Turn off Discreet view and copy the text by hand.');
      return;
    }
    $('spoken').value = '';
    renderDecoded();
    toast('Copied. Paste it anywhere with ⌘V or Ctrl+V.');
  }

  $('spoken').addEventListener('input', renderDecoded);
  $('spoken').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      copyAndClear();
    }
  });
  $('copy-btn').addEventListener('click', copyAndClear);
  $('clear-btn').addEventListener('click', () => {
    $('spoken').value = '';
    renderDecoded();
    $('spoken').focus();
  });

  $('discreet').addEventListener('change', () => {
    $('decoded').classList.toggle('blurred', $('discreet').checked);
  });

  function setPeek(on) {
    if ($('discreet').checked) $('decoded').classList.toggle('blurred', !on);
  }
  $('peek-btn').addEventListener('pointerdown', () => setPeek(true));
  ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((type) => {
    $('peek-btn').addEventListener(type, () => setPeek(false));
  });
  $('peek-btn').addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPeek(true); }
  });
  $('peek-btn').addEventListener('keyup', () => setPeek(false));

  // ---- Codebook editor ----

  function showMessages(errors, warnings) {
    const list = $('entry-messages');
    list.textContent = '';
    errors.forEach((text) => list.append(element('li', 'error', text)));
    warnings.forEach((text) => list.append(element('li', 'warning', text)));
  }

  async function saveEntries(next, message) {
    const check = SC.validateEntries(next);
    showMessages(check.errors, check.warnings);
    if (!check.valid) return false;

    const vault = await SC.sealVault(state.vault, state.key, next);
    state.vault = vault;
    state.entries = next.map((entry) => ({ code: entry.code.trim(), value: entry.value.trim() }));
    storeVault(vault);
    renderEntries();
    renderDecoded();
    toast(message);
    return true;
  }

  function resetEntryForm() {
    state.editingIndex = -1;
    $('entry-form').reset();
    $('entry-submit').textContent = 'Add code word';
    $('entry-cancel').hidden = true;
    setValueRevealed(false);
  }

  function setValueRevealed(on) {
    $('entry-value').classList.toggle('masked-input', !on);
    $('entry-reveal').textContent = on ? 'Hide' : 'Show';
    $('entry-reveal').setAttribute('aria-pressed', String(on));
  }

  function startEditing(index) {
    const entry = state.entries[index];
    state.editingIndex = index;
    $('entry-code').value = entry.code;
    $('entry-value').value = entry.value;
    $('entry-submit').textContent = 'Save changes';
    $('entry-cancel').hidden = false;
    $('entry-code').focus();
  }

  async function deleteEntry(index) {
    const entry = state.entries[index];
    if (!window.confirm(`Delete the code word “${entry.code}”?`)) return;
    const next = state.entries.filter((_, i) => i !== index);
    if (await saveEntries(next, 'Code word deleted.') && state.editingIndex === index) resetEntryForm();
  }

  function renderEntries() {
    const list = $('entry-list');
    const count = state.entries.length;
    list.textContent = '';
    $('entry-count').textContent = plural(count, 'code word');

    if (count === 0) {
      list.append(element('li', 'empty-entry', 'No code words yet. Add one above, for example “project mango” for a client’s name.'));
      return;
    }

    state.entries.forEach((entry, index) => {
      const item = element('li', 'entry');
      const text = element('div', 'entry-text');
      const value = element('span', 'entry-value', '••••••••');
      text.append(element('span', 'entry-code', entry.code), value);

      const tools = element('div', 'entry-tools');
      const show = element('button', 'ghost small', 'Show');
      show.type = 'button';
      show.addEventListener('click', () => {
        const revealed = show.textContent === 'Hide';
        value.textContent = revealed ? '••••••••' : entry.value;
        show.textContent = revealed ? 'Show' : 'Hide';
      });
      const edit = element('button', 'ghost small', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', () => startEditing(index));
      const remove = element('button', 'ghost small danger', 'Delete');
      remove.type = 'button';
      remove.addEventListener('click', () => deleteEntry(index));
      tools.append(show, edit, remove);

      item.append(text, tools);
      list.append(item);
    });
  }

  $('entry-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const entry = { code: $('entry-code').value, value: $('entry-value').value };
    const editing = state.editingIndex >= 0;
    const next = state.entries.slice();
    if (editing) next[state.editingIndex] = entry;
    else next.push(entry);

    if (await saveEntries(next, editing ? 'Code word updated.' : 'Code word added.')) {
      resetEntryForm();
      $('entry-code').focus();
    }
  });

  $('entry-cancel').addEventListener('click', () => {
    resetEntryForm();
    showMessages([], []);
  });

  $('entry-reveal').addEventListener('click', () => {
    setValueRevealed($('entry-value').classList.contains('masked-input'));
  });

  // ---- Auto-lock and dictation watcher ----

  ['pointerdown', 'keydown', 'input'].forEach((type) => {
    document.addEventListener(type, () => { state.lastActivity = Date.now(); }, true);
  });

  setInterval(() => {
    if (!state.key) return;
    if (Date.now() - state.lastActivity > AUTO_LOCK_MS) {
      lock();
      toast('Locked after 5 minutes of inactivity.');
      return;
    }
    // Some dictation tools insert text without firing an input event.
    if ($('spoken').value !== state.lastSpoken) renderDecoded();
  }, 500);

  showLockScreen();
})();
