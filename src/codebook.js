/*
 * Secret Codebook core: code-word matching and codebook encryption.
 *
 * Runs in the browser (as window.SecretCodebook) and in Node (via require),
 * so the same code is used by the app and by the unit tests.
 * No dependencies and no network access.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SecretCodebook = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VAULT_VERSION = 1;
  const DEFAULT_ITERATIONS = 600000;
  const MIN_ITERATIONS = 1000;
  const MIN_CODE_LENGTH = 3;
  const MIN_PASSPHRASE_LENGTH = 8;

  // Up to 3 non-letter characters may sit between the words of a code phrase,
  // because Wispr may write "project mango", "Project, Mango" or "project-mango".
  const WORD_GAP = '[^\\p{L}\\p{M}\\p{N}]{1,3}';

  // Everyday words make poor code words: they would be replaced in normal speech.
  const COMMON_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'so', 'if', 'yes', 'no', 'ok', 'okay',
    'hi', 'hey', 'hello', 'thanks', 'thank', 'please', 'sorry',
    'i', 'me', 'my', 'you', 'your', 'we', 'our', 'he', 'she', 'they', 'it', 'this', 'that',
    'is', 'are', 'was', 'be', 'do', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from',
    'send', 'call', 'meet', 'meeting', 'today', 'tomorrow', 'now', 'time', 'good', 'new',
    'home', 'work', 'office', 'number', 'phone', 'address', 'email', 'name', 'money',
    'file', 'plan', 'project', 'team', 'boss', 'mom', 'dad', 'friend',
  ]);

  // Lowercase, and treat any run of non-letters/digits as a single space.
  function normalizeCode(code) {
    return String(code ?? '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
      .trim();
  }

  // One entry can list several spoken variants separated by "|",
  // e.g. "item seven | item 7".
  function splitAliases(code) {
    return String(code ?? '')
      .split('|')
      .map(normalizeCode)
      .filter(Boolean);
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function cleanEntry(entry) {
    return {
      code: String(entry?.code ?? '').trim(),
      value: String(entry?.value ?? '').trim(),
    };
  }

  function validateEntries(entries) {
    const errors = [];
    const warnings = [];
    const seen = new Set();

    entries.map(cleanEntry).forEach((entry, i) => {
      const aliases = splitAliases(entry.code);
      if (aliases.length === 0) errors.push(`Entry ${i + 1}: the code phrase is empty.`);
      if (!entry.value) errors.push(`Entry ${i + 1}: the secret value is empty.`);

      for (const alias of aliases) {
        if (alias.length < MIN_CODE_LENGTH) {
          errors.push(`"${alias}" is too short. Use at least ${MIN_CODE_LENGTH} characters.`);
        }
        if (seen.has(alias)) {
          errors.push(`"${alias}" is used more than once.`);
        }
        seen.add(alias);
        if (alias.split(' ').every((word) => COMMON_WORDS.has(word))) {
          warnings.push(`"${alias}" is made of everyday words, so it will be replaced whenever you say it normally.`);
        }
      }
    });

    return { valid: errors.length === 0, errors, warnings };
  }

  function buildMatcher(entries) {
    const lookup = new Map();
    for (const entry of entries) {
      const { value } = cleanEntry(entry);
      for (const alias of splitAliases(entry.code)) {
        if (!lookup.has(alias)) lookup.set(alias, value);
      }
    }
    if (lookup.size === 0) return null;

    // Longest first, so "my usual number" wins over "usual number" at the same position.
    const alternatives = [...lookup.keys()]
      .sort((a, b) => b.length - a.length)
      .map((alias) => alias.split(' ').map(escapeRegExp).join(WORD_GAP));

    // Whole words only: "mango" must not match inside "mangoes".
    const regex = new RegExp(
      `(?<![\\p{L}\\p{M}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{M}\\p{N}])`,
      'giu'
    );
    return { regex, lookup };
  }

  // Replaces spoken code words with their secret values in a single pass,
  // so a secret value is never itself expanded again.
  function decode(text, entries) {
    const input = String(text ?? '');
    const segments = [];
    const matcher = buildMatcher(entries || []);
    let last = 0;

    if (matcher) {
      for (const match of input.matchAll(matcher.regex)) {
        const value = matcher.lookup.get(normalizeCode(match[0]));
        if (value === undefined) continue;
        if (match.index > last) segments.push({ secret: false, text: input.slice(last, match.index) });
        segments.push({ secret: true, text: value, spoken: match[0] });
        last = match.index + match[0].length;
      }
    }
    if (last < input.length) segments.push({ secret: false, text: input.slice(last) });

    return {
      text: segments.map((segment) => segment.text).join(''),
      segments,
      count: segments.filter((segment) => segment.secret).length,
    };
  }

  // ---- Encryption: PBKDF2-SHA256 key derivation + AES-256-GCM ----

  function webCrypto() {
    const crypto = globalThis.crypto;
    if (!crypto || !crypto.subtle) {
      throw new Error('Encryption is not available here. Open the app from https:// or http://localhost.');
    }
    return crypto;
  }

  function toBase64(bytes) {
    let binary = '';
    for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function deriveKey(passphrase, salt, iterations) {
    const { subtle } = webCrypto();
    const material = await subtle.importKey(
      'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function checkVault(vault) {
    const ok = vault
      && vault.version === VAULT_VERSION
      && Number.isInteger(vault.iterations)
      && vault.iterations >= MIN_ITERATIONS
      && typeof vault.salt === 'string'
      && typeof vault.iv === 'string'
      && typeof vault.data === 'string';
    if (!ok) throw new Error('This is not a Secret Codebook backup file.');
    return vault;
  }

  // Encrypts the entries with an already-derived key. Keeps the vault's salt
  // and uses a fresh IV every time.
  async function sealVault(vault, key, entries) {
    const crypto = webCrypto();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(entries.map(cleanEntry)));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      version: VAULT_VERSION,
      kdf: 'PBKDF2-SHA256',
      cipher: 'AES-256-GCM',
      iterations: vault.iterations,
      salt: vault.salt,
      iv: toBase64(iv),
      data: toBase64(data),
    };
  }

  async function createVault(passphrase, entries, options = {}) {
    if (String(passphrase ?? '').length < MIN_PASSPHRASE_LENGTH) {
      throw new Error(`Use a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters.`);
    }
    const iterations = options.iterations || DEFAULT_ITERATIONS;
    const salt = webCrypto().getRandomValues(new Uint8Array(16));
    const key = await deriveKey(passphrase, salt, iterations);
    const vault = await sealVault({ iterations, salt: toBase64(salt) }, key, entries || []);
    return { vault, key };
  }

  async function openVault(vault, passphrase) {
    checkVault(vault);
    const key = await deriveKey(String(passphrase ?? ''), fromBase64(vault.salt), vault.iterations);
    let plaintext;
    try {
      plaintext = await webCrypto().subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(vault.iv) }, key, fromBase64(vault.data)
      );
    } catch {
      throw new Error('Wrong passphrase, or the codebook data is damaged.');
    }
    const entries = JSON.parse(new TextDecoder().decode(plaintext)).map(cleanEntry);
    return { entries, key };
  }

  return {
    MIN_CODE_LENGTH,
    MIN_PASSPHRASE_LENGTH,
    DEFAULT_ITERATIONS,
    normalizeCode,
    splitAliases,
    validateEntries,
    decode,
    checkVault,
    createVault,
    sealVault,
    openVault,
  };
});
