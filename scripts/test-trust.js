'use strict';
// Computadores de confiança (src/renderer/trust.js): provas, comparação, impressão digital e lista guardada.
const assert = require('node:assert');
const T = require('../src/renderer/trust');

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('OK   ' + name); };
const H = (s) => /^[0-9a-f]{64}$/.test(s);

(async () => {
  await t('WebCrypto disponível', () => assert.ok(T.available()));
  await t('segredo (256 bits) e desafio (128 bits) são aleatórios e únicos', () => {
    const a = T.newSecret(), b = T.newSecret(), c = T.newNonce(), d = T.newNonce();
    assert.ok(H(a) && H(b) && a !== b); assert.ok(/^[0-9a-f]{32}$/.test(c) && c !== d);
  });
  await t('HMAC-SHA-256: igual ao do módulo crypto do Node (chave de 32 bytes)', async () => {
    // chave 0x00 x32 e mensagem "x": valor de referência calculado com o módulo crypto do Node
    const ref = require('node:crypto').createHmac('sha256', Buffer.alloc(32)).update('x').digest('hex');
    assert.strictEqual(await T.hmacHex('00'.repeat(32), 'x'), ref);
  });
  await t('prova do pedido: mesma entrada = mesma prova; qualquer mudança muda a prova', async () => {
    const s = T.newSecret(), nonce = T.newNonce();
    const p = await T.callProof(s, nonce, '111111111', '222222222');
    assert.ok(H(p)); assert.strictEqual(p, await T.callProof(s, nonce, '111111111', '222222222'));
    assert.notStrictEqual(p, await T.callProof(s, T.newNonce(), '111111111', '222222222'));       // desafio novo
    assert.notStrictEqual(p, await T.callProof(T.newSecret(), nonce, '111111111', '222222222'));  // outro segredo
    assert.notStrictEqual(p, await T.callProof(s, nonce, '111111111', '333333333'));              // outro controlador (código falso)
    assert.notStrictEqual(p, await T.callProof(s, nonce, '999999999', '222222222'));              // outro computador controlado
  });
  await t('prova do pedido não vale como prova do canal (e vice-versa)', async () => {
    const s = T.newSecret(), nonce = T.newNonce();
    assert.notStrictEqual(await T.callProof(s, nonce, '111111111', '222222222'), await T.chanProof(s, nonce, 'AA', 'BB', '111111111', '222222222'));
  });
  await t('prova do canal: amarrada às impressões digitais (intermediário não consegue repetir)', async () => {
    const s = T.newSecret(), nonce = T.newNonce();
    const p = await T.chanProof(s, nonce, 'AA:BB', 'CC:DD', '111111111', '222222222');
    assert.strictEqual(p, await T.chanProof(s, nonce, 'AA:BB', 'CC:DD', '111111111', '222222222'));
    assert.notStrictEqual(p, await T.chanProof(s, nonce, 'EE:FF', 'CC:DD', '111111111', '222222222'));
    assert.notStrictEqual(p, await T.chanProof(s, nonce, 'AA:BB', 'EE:FF', '111111111', '222222222'));
    assert.notStrictEqual(p, await T.chanProof(s, nonce, 'CC:DD', 'AA:BB', '111111111', '222222222'));   // lados trocados
  });
  await t('comparação em tempo constante', () => {
    assert.ok(T.equal('abc', 'abc')); assert.ok(!T.equal('abc', 'abd')); assert.ok(!T.equal('abc', 'ab'));
    assert.ok(!T.equal('abc', undefined)); assert.ok(!T.equal(null, 'abc')); assert.ok(!T.equal('', 'a')); assert.ok(T.equal('', ''));
  });
  await t('impressão digital DTLS sai do SDP', () => {
    const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\na=fingerprint:sha-256 ab:CD:ef:01\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';
    assert.strictEqual(T.fingerprintOf(sdp), 'AB:CD:EF:01');
    assert.strictEqual(T.fingerprintOf('v=0'), null); assert.strictEqual(T.fingerprintOf(undefined), null);
  });
  await t('lista: lê dados corrompidos sem quebrar e descarta o que não vale', () => {
    assert.deepStrictEqual(T.parse('lixo'), {}); assert.deepStrictEqual(T.parse('[]'), {}); assert.deepStrictEqual(T.parse('null'), {});
    const s = T.newSecret();
    const m = T.parse(JSON.stringify({ '123456789': { secret: s, name: 'PC\u0000 da Ana', control: 1, files: 0, at: 5, last: 9 }, '12345': { secret: s }, '987654321': { secret: 'curto' }, '555555555': null }));
    assert.deepStrictEqual(Object.keys(m), ['123456789']);
    assert.deepStrictEqual(m['123456789'], { secret: s, name: 'PC da Ana', control: true, files: false, at: 5, last: 9 });
  });
  await t('lista: guardar, atualizar, remover (sem alterar o original)', () => {
    const s1 = T.newSecret(), s2 = T.newSecret();
    const a = {}; const b = T.put(a, '111111111', { secret: s1, name: 'Ana', control: true, files: true }, 100);
    assert.deepStrictEqual(a, {}); assert.strictEqual(b['111111111'].secret, s1);
    const c = T.put(b, '111111111', { secret: s2, name: 'Ana 2', control: false, files: true }, 200);     // lembrar de novo troca o segredo
    assert.strictEqual(c['111111111'].secret, s2); assert.strictEqual(c['111111111'].control, false);
    assert.deepStrictEqual(T.put(c, 'abc', { secret: s1 }), c); assert.deepStrictEqual(T.put(c, '222222222', { secret: 'x' }), c);
    const d = T.touch(c, '111111111', 'Novo nome', 300); assert.strictEqual(d['111111111'].last, 300); assert.strictEqual(d['111111111'].name, 'Novo nome');
    assert.deepStrictEqual(T.touch(c, '999999999', 'x'), c);
    assert.deepStrictEqual(T.remove(d, '111111111'), {}); assert.ok(d['111111111']);
  });
  await t('lista: ordem pelo uso mais recente e limite de 50', () => {
    let m = {};
    for (let i = 0; i < 60; i++) m = T.put(m, String(100000000 + i), { secret: T.newSecret() }, 1000 + i);
    assert.strictEqual(Object.keys(m).length, 50);
    assert.strictEqual(T.list(m)[0].id, '100000059'); assert.ok(!m['100000000']);
  });
  console.log(`OK: computadores de confiança passaram (${n} grupos de testes)`);
})().catch((e) => { console.error('FALHA', e); process.exit(1); });
