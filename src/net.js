'use strict';
// Descoberta automática do servidor de conexão, sem configuração do usuário.
//  1) Se config/defaults.json tiver "serverUrl" (servidor na internet), usa ele.
//  2) Senão, procura outro REA Desk na rede local (broadcast UDP).
//  3) Se ninguém responder, este computador vira o "ponto de encontro" da rede.
const dgram = require('node:dgram');
const { start } = require('../server/server');

const WS_PORT = 8787;
const DISCO_PORT = 41234;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let embedded = null;
let responder = null;
let inflight = null;

function probe(timeout = 1200) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock.close(); } catch {}
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeout);
    sock.on('error', () => finish(null));
    sock.on('message', (msg, r) => {
      const m = /^READESK!(\d+)$/.exec(msg.toString());
      if (m) finish(`ws://${r.address}:${m[1]}`);
    });
    sock.bind(0, () => {
      try {
        sock.setBroadcast(true);
        sock.send('READESK?', DISCO_PORT, '255.255.255.255');
        sock.send('READESK?', DISCO_PORT, '127.0.0.1');
      } catch { finish(null); }
    });
  });
}

function startResponder() {
  if (responder) return;
  responder = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  responder.on('error', () => { try { responder.close(); } catch {} responder = null; });
  responder.on('message', (msg, r) => {
    if (msg.toString() === 'READESK?') responder.send(`READESK!${WS_PORT}`, r.port, r.address);
  });
  responder.bind(DISCO_PORT);
}

function startEmbedded() {
  return new Promise((resolve) => {
    let wss;
    try { wss = start(WS_PORT, '0.0.0.0'); } catch { return resolve(false); }
    wss.on('error', () => resolve(false)); // porta ocupada: outro computador/instância já é o ponto de encontro
    wss.on('listening', () => { embedded = wss; startResponder(); resolve(true); });
  });
}

async function resolveOnce(defaults) {
  if (defaults.serverUrl) return { url: defaults.serverUrl, mode: 'internet' };
  if (embedded) return { url: `ws://127.0.0.1:${WS_PORT}`, mode: 'host' };
  let url = await probe();
  if (!url) { await sleep(Math.random() * 600); url = await probe(600); } // evita dois PCs virarem servidor juntos
  if (url) return { url, mode: 'lan' };
  if (await startEmbedded()) return { url: `ws://127.0.0.1:${WS_PORT}`, mode: 'host' };
  url = await probe();
  return url ? { url, mode: 'lan' } : { url: `ws://127.0.0.1:${WS_PORT}`, mode: 'host' };
}

function resolveServer(defaults) {
  inflight ||= resolveOnce(defaults).finally(() => { inflight = null; });
  return inflight;
}

function stop() {
  try { embedded?.close(); } catch {}
  try { responder?.close(); } catch {}
  embedded = responder = null;
}

module.exports = { resolveServer, stop };
