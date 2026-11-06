'use strict';
// Computadores de confiança: lógica PURA (sem DOM), testada em scripts/test-trust.js.
//
// Ideia: na primeira vez, quem é acessado aceita o pedido e marca "Lembrar este computador". Os dois lados passam a guardar um SEGREDO
// aleatório, combinado pelo canal de dados criptografado (nunca pelo servidor de conexão). Nas próximas vezes o computador controlado
// não pergunta se o outro provar que conhece o segredo: o código de 9 dígitos sozinho NÃO basta (qualquer um pode registrar um código que
// esteja livre). A prova é uma resposta a um desafio novo a cada pedido (HMAC-SHA-256), então copiá-la não adianta, e o segredo
// nunca trafega depois do combinado. Uma segunda prova, amarrada às impressões digitais DTLS da conexão, é conferida no canal de dados
// antes de liberar mouse, teclado e arquivos (veja renderer.js).
(function (root) {
  const validId = (id) => /^\d{9}$/.test(String(id));
  const isHex = (s, n) => typeof s === 'string' && new RegExp('^[0-9a-f]{' + n + '}$').test(s);
  const cleanName = (n) => String(n == null ? '' : n).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
  const MAX = 50;                                   // limite de computadores de confiança

  const crypto_ = () => (root.crypto && root.crypto.subtle ? root.crypto : null);
  const available = () => !!crypto_();

  function randomHex(bytes) {
    const b = new Uint8Array(bytes); crypto_().getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  const newSecret = () => randomHex(32);            // 256 bits
  const newNonce = () => randomHex(16);

  async function hmacHex(secretHex, message) {
    const c = crypto_();
    const raw = new Uint8Array(secretHex.match(/../g).map((h) => parseInt(h, 16)));
    const key = await c.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = new Uint8Array(await c.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
    return Array.from(sig, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  // comparação em tempo constante (não vaza em qual posição as provas diferem)
  function equal(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  // Prova do pedido: o controlador responde ao desafio do computador controlado.
  const callProof = (secret, nonce, hostId, ctrlId) => hmacHex(secret, `call|${nonce}|${hostId}|${ctrlId}`);
  // Prova do canal: amarrada às impressões digitais DTLS dos dois lados (um intermediário no servidor de conexão não consegue repetir).
  const chanProof = (secret, nonce, hostFp, ctrlFp, hostId, ctrlId) => hmacHex(secret, `chan|${nonce}|${hostFp}|${ctrlFp}|${hostId}|${ctrlId}`);

  // Impressão digital DTLS (sha-256) de uma descrição SDP.
  function fingerprintOf(sdp) {
    const m = /^a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/m.exec(String(sdp || ''));
    return m ? m[1].toUpperCase() : null;
  }

  /* ---- lista guardada em localStorage: { "<código>": { secret, name, control, files, at, last } } ---- */
  function parse(text) {
    let raw; try { raw = JSON.parse(text); } catch { return {}; }
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [id, e] of Object.entries(raw)) {
      if (!validId(id) || !e || !isHex(e.secret, 64)) continue;
      out[id] = { secret: e.secret, name: cleanName(e.name), control: !!e.control, files: !!e.files, at: Number(e.at) > 0 ? Number(e.at) : 0, last: Number(e.last) > 0 ? Number(e.last) : 0 };
    }
    return limit(out);
  }
  function limit(map) {
    const ids = Object.keys(map).sort((a, b) => (map[b].last || map[b].at) - (map[a].last || map[a].at)).slice(0, MAX);
    const out = {}; for (const id of ids) out[id] = map[id]; return out;
  }
  function put(map, id, entry, now = Date.now()) {
    if (!validId(id) || !isHex(entry && entry.secret, 64)) return map;
    return limit({ ...map, [id]: { secret: entry.secret, name: cleanName(entry.name), control: !!entry.control, files: !!entry.files, at: now, last: now } });
  }
  function touch(map, id, name, now = Date.now()) {
    if (!map[id]) return map;
    return { ...map, [id]: { ...map[id], name: cleanName(name) || map[id].name, last: now } };
  }
  function remove(map, id) { const out = { ...map }; delete out[String(id)]; return out; }
  const list = (map) => Object.entries(map).map(([id, e]) => ({ id, ...e })).sort((a, b) => (b.last || b.at) - (a.last || a.at));

  const api = { available, newSecret, newNonce, randomHex, hmacHex, equal, callProof, chanProof, fingerprintOf, parse, put, touch, remove, list, validId, MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.REA_TRUST = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
