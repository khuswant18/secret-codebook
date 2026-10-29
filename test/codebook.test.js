const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const SC = require('../src/codebook.js');

// Fast key derivation for tests; the app uses SC.DEFAULT_ITERATIONS.
const FAST = { iterations: 1000 };

const ENTRIES = [
  { code: 'project mango', value: 'Acme Robotics Pvt. Ltd.' },
  { code: 'my usual number', value: '+91 98765 43210' },
  { code: 'usual number', value: 'WRONG: shorter code should lose' },
  { code: 'home base | homebase', value: 'Flat 4B, Green Park' },
  { code: 'code falcon', value: 'the Zeta Labs interview' },
];

describe('normalizeCode', () => {
  test('lowercases and collapses spaces and punctuation', () => {
    assert.equal(SC.normalizeCode('  Project,   MANGO! '), 'project mango');
    assert.equal(SC.normalizeCode('project-mango'), 'project mango');
  });

  test('keeps non-English letters', () => {
    assert.equal(SC.normalizeCode('गुप्त  कोड'), 'गुप्त कोड');
  });
});

describe('splitAliases', () => {
  test('splits variants on "|" and drops empty ones', () => {
    assert.deepEqual(SC.splitAliases('item seven | Item 7 | '), ['item seven', 'item 7']);
  });
});

describe('decode', () => {
  test('replaces a code word with its secret', () => {
    const result = SC.decode('Send the deck to project mango today.', ENTRIES);
    assert.equal(result.text, 'Send the deck to Acme Robotics Pvt. Ltd. today.');
    assert.equal(result.count, 1);
  });

  test('ignores case and the punctuation Wispr adds', () => {
    const result = SC.decode('Project Mango, please call.', ENTRIES);
    assert.equal(result.text, 'Acme Robotics Pvt. Ltd., please call.');
  });

  test('matches when Wispr puts punctuation between the words', () => {
    assert.equal(SC.decode('project-mango', ENTRIES).text, 'Acme Robotics Pvt. Ltd.');
    assert.equal(SC.decode('Project, mango', ENTRIES).text, 'Acme Robotics Pvt. Ltd.');
    assert.equal(SC.decode('project\nmango', ENTRIES).text, 'Acme Robotics Pvt. Ltd.');
  });

  test('matches whole words only', () => {
    const text = 'The project mangoes are ripe.';
    assert.equal(SC.decode(text, ENTRIES).text, text);
    assert.equal(SC.decode('superproject mango', ENTRIES).text, 'superproject mango');
  });

  test('prefers the longest code phrase', () => {
    const result = SC.decode('Share my usual number.', ENTRIES);
    assert.equal(result.text, 'Share +91 98765 43210.');
  });

  test('supports variants separated by "|"', () => {
    assert.equal(SC.decode('Meet at homebase.', ENTRIES).text, 'Meet at Flat 4B, Green Park.');
    assert.equal(SC.decode('Meet at Home Base.', ENTRIES).text, 'Meet at Flat 4B, Green Park.');
  });

  test('replaces every occurrence and counts them', () => {
    const result = SC.decode('code falcon then project mango then Code Falcon', ENTRIES);
    assert.equal(result.text, 'the Zeta Labs interview then Acme Robotics Pvt. Ltd. then the Zeta Labs interview');
    assert.equal(result.count, 3);
  });

  test('does not expand a code word that appears inside a secret value', () => {
    const entries = [
      { code: 'alpha one', value: 'contains bravo two inside' },
      { code: 'bravo two', value: 'SHOULD NOT APPEAR' },
    ];
    assert.equal(SC.decode('alpha one', entries).text, 'contains bravo two inside');
  });

  test('treats regex characters in codes as plain text', () => {
    const entries = [{ code: 'a.b.c plan', value: 'SECRET' }];
    assert.equal(SC.decode('axbxc plan', entries).text, 'axbxc plan');
    assert.equal(SC.decode('a.b.c plan', entries).text, 'SECRET');
    assert.equal(SC.decode('C++ plan', [{ code: 'c++ plan', value: 'SECRET' }]).text, 'SECRET');
  });

  test('works with Hindi code words', () => {
    const entries = [{ code: 'लाल किताब', value: 'Budget 2026 draft' }];
    assert.equal(SC.decode('कृपया लाल किताब भेजो', entries).text, 'कृपया Budget 2026 draft भेजो');
  });

  test('works with Hinglish code words', () => {
    const entries = [{ code: 'meetha aam', value: 'Acme Robotics' }];
    assert.equal(SC.decode('Bhai, Meetha Aam ko call kar.', entries).text, 'Bhai, Acme Robotics ko call kar.');
  });

  test('returns segments that mark which parts are secret', () => {
    const { segments } = SC.decode('Hi project mango!', ENTRIES);
    assert.deepEqual(segments, [
      { secret: false, text: 'Hi ' },
      { secret: true, text: 'Acme Robotics Pvt. Ltd.', spoken: 'project mango' },
      { secret: false, text: '!' },
    ]);
  });

  test('leaves text unchanged when the codebook is empty', () => {
    assert.deepEqual(SC.decode('project mango', []), {
      text: 'project mango',
      segments: [{ secret: false, text: 'project mango' }],
      count: 0,
    });
    assert.equal(SC.decode('', ENTRIES).text, '');
  });
});

describe('validateEntries', () => {
  test('accepts a good codebook', () => {
    const result = SC.validateEntries(ENTRIES);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  test('rejects empty codes and empty values', () => {
    const result = SC.validateEntries([{ code: '  ', value: 'x' }, { code: 'blue moon', value: ' ' }]);
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 2);
  });

  test('rejects codes that are too short', () => {
    const result = SC.validateEntries([{ code: 'zq', value: 'secret' }]);
    assert.equal(result.valid, false);
    assert.match(result.errors[0], /too short/);
  });

  test('rejects duplicates even when spelled differently', () => {
    const result = SC.validateEntries([
      { code: 'Project Mango', value: 'a' },
      { code: 'project-mango', value: 'b' },
    ]);
    assert.equal(result.valid, false);
    assert.match(result.errors[0], /more than once/);
  });

  test('warns about everyday words but still allows them', () => {
    const result = SC.validateEntries([{ code: 'send email', value: 'x' }]);
    assert.equal(result.valid, true);
    assert.equal(result.warnings.length, 1);
  });
});

describe('encrypted vault', () => {
  test('round-trips entries with the right passphrase', async () => {
    const { vault } = await SC.createVault('correct horse', ENTRIES, FAST);
    const { entries } = await SC.openVault(vault, 'correct horse');
    assert.deepEqual(entries, ENTRIES);
  });

  test('works with the default (slow, strong) key derivation', async () => {
    const { vault } = await SC.createVault('correct horse', ENTRIES);
    assert.equal(vault.iterations, SC.DEFAULT_ITERATIONS);
    const { entries } = await SC.openVault(vault, 'correct horse');
    assert.equal(entries.length, ENTRIES.length);
  });

  test('rejects a wrong passphrase', async () => {
    const { vault } = await SC.createVault('correct horse', ENTRIES, FAST);
    await assert.rejects(SC.openVault(vault, 'wrong horse'), /Wrong passphrase/);
  });

  test('rejects tampered data', async () => {
    const { vault } = await SC.createVault('correct horse', ENTRIES, FAST);
    const bytes = Buffer.from(vault.data, 'base64');
    bytes[0] ^= 1;
    const tampered = { ...vault, data: bytes.toString('base64') };
    await assert.rejects(SC.openVault(tampered, 'correct horse'), /damaged/);
  });

  test('never stores secrets or code words in plain text', async () => {
    const { vault } = await SC.createVault('correct horse', ENTRIES, FAST);
    const stored = JSON.stringify(vault);
    for (const entry of ENTRIES) {
      assert.equal(stored.includes(entry.value), false);
      assert.equal(stored.includes(entry.code), false);
    }
  });

  test('re-sealing keeps the salt, changes the IV and still opens', async () => {
    const { vault, key } = await SC.createVault('correct horse', ENTRIES, FAST);
    const updated = [...ENTRIES, { code: 'blue moon', value: 'new secret' }];
    const resealed = await SC.sealVault(vault, key, updated);
    assert.equal(resealed.salt, vault.salt);
    assert.notEqual(resealed.iv, vault.iv);
    const { entries } = await SC.openVault(resealed, 'correct horse');
    assert.deepEqual(entries, updated);
  });

  test('rejects short passphrases', async () => {
    await assert.rejects(SC.createVault('short', ENTRIES, FAST), /at least 8/);
  });

  test('rejects files that are not vaults', async () => {
    assert.throws(() => SC.checkVault({ hello: 'world' }), /not a Secret Codebook/);
    await assert.rejects(SC.openVault(null, 'correct horse'), /not a Secret Codebook/);
  });
});
