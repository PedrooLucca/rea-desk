'use strict';
// Teste do servidor de sinalização: registro, chamada, aceite, relay e bye.
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { start } = require('./server');

const PORT = 18787;
const wss = start(PORT, '127.0.0.1');

function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const queue = [];
  const waiters = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    const w = waiters.shift();
    w ? w(m) : queue.push(m);
  });
  ws.next = () => new Promise((r) => (queue.length ? r(queue.shift()) : waiters.push(r)));
  ws.sendj = (o) => ws.send(JSON.stringify(o));
  return new Promise((r) => ws.on('open', () => r(ws)));
}

(async () => {
  const a = await client();
  const b = await client();
  a.sendj({ t: 'register' });
  b.sendj({ t: 'register' });
  const ra = await a.next();
  const rb = await b.next();
  assert.match(ra.id, /^\d{9}$/);
  assert.notEqual(ra.id, rb.id);

  // sinal sem chamada ativa é ignorado
  a.sendj({ t: 'sig', to: rb.id, data: 'x' });
  // chamada
  a.sendj({ t: 'call', to: rb.id, name: 'Ana' });
  assert.deepEqual(await b.next(), { t: 'incoming', from: ra.id, name: 'Ana' });
  b.sendj({ t: 'answer', to: ra.id, accept: true, name: 'Bia' });
  assert.deepEqual(await a.next(), { t: 'answered', from: rb.id, accept: true, name: 'Bia' });
  b.sendj({ t: 'sig', to: ra.id, data: { sdp: 'offer' } });
  assert.deepEqual(await a.next(), { t: 'sig', from: rb.id, data: { sdp: 'offer' } });

  // ID inexistente
  a.sendj({ t: 'call', to: '999999999' });
  assert.equal((await a.next()).t, 'error');

  // recusa encerra o vínculo
  const c = await client();
  c.sendj({ t: 'register' });
  const rc = await c.next();
  c.sendj({ t: 'call', to: rb.id });
  await b.next();
  b.sendj({ t: 'answer', to: rc.id, accept: false });
  assert.equal((await c.next()).accept, false);

  // bye
  a.sendj({ t: 'bye', to: rb.id });
  assert.deepEqual(await b.next(), { t: 'bye', from: ra.id });

  console.log('OK: servidor de sinalização passou em todos os testes');
  [a, b, c].forEach((w) => w.close());
  wss.close();
})().catch((e) => { console.error(e); process.exit(1); });
