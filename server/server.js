'use strict';
// Servidor de sinalização: registra IDs, encaminha pedidos de conexão e mensagens WebRTC.
// Nenhum vídeo/dado de sessão passa por aqui (P2P via WebRTC).
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1'; // use 0.0.0.0 para aceitar conexões da rede
const MAX_PAYLOAD = 64 * 1024;

function start(port = PORT, host = HOST) {
  const wss = new WebSocketServer({ port, host, maxPayload: MAX_PAYLOAD });
  const clients = new Map(); // id -> ws
  const pairs = new Map(); // id -> Set(peer ids) (pedidos pendentes/ativos)

  const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const newId = () => {
    for (;;) {
      const id = String(100000000 + Math.floor(Math.random() * 900000000));
      if (!clients.has(id)) return id;
    }
  };
  const link = (a, b) => {
    (pairs.get(a) || pairs.set(a, new Set()).get(a)).add(b);
    (pairs.get(b) || pairs.set(b, new Set()).get(b)).add(a);
  };
  const unlink = (a, b) => {
    pairs.get(a)?.delete(b);
    pairs.get(b)?.delete(a);
  };

  wss.on('connection', (ws) => {
    ws.id = null;
    ws.alive = true;
    ws.on('pong', () => (ws.alive = true));
    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (!m || typeof m.t !== 'string') return;

      if (m.t === 'register') {
        if (ws.id) return;
        let id = typeof m.id === 'string' && /^\d{9}$/.test(m.id) ? m.id : null;
        if (!id || clients.has(id)) id = newId();
        ws.id = id;
        clients.set(id, ws);
        return send(ws, { t: 'registered', id });
      }
      if (!ws.id) return;

      const to = String(m.to || '');
      const peer = clients.get(to);
      const name = String(m.name || '').slice(0, 40);
      if (m.t === 'call') {
        if (!peer || to === ws.id) return send(ws, { t: 'error', code: 'not_found', msg: 'ID não encontrado ou offline' });
        link(ws.id, to);
        return send(peer, { t: 'incoming', from: ws.id, name });
      }
      if (!pairs.get(ws.id)?.has(to)) return; // só fala com quem tem chamada ligada
      if (!peer) return unlink(ws.id, to);
      if (m.t === 'answer') {
        if (!m.accept) unlink(ws.id, to);
        return send(peer, { t: 'answered', from: ws.id, accept: !!m.accept, name });
      }
      if (m.t === 'sig') return send(peer, { t: 'sig', from: ws.id, data: m.data });
      if (m.t === 'bye') {
        unlink(ws.id, to);
        return send(peer, { t: 'bye', from: ws.id });
      }
    });
    ws.on('close', () => {
      if (!ws.id) return;
      if (clients.get(ws.id) === ws) clients.delete(ws.id);
      for (const p of pairs.get(ws.id) || []) {
        const peer = clients.get(p);
        if (peer) send(peer, { t: 'bye', from: ws.id });
        pairs.get(p)?.delete(ws.id);
      }
      pairs.delete(ws.id);
    });
  });

  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(hb));
  return wss;
}

if (require.main === module) {
  start();
  console.log(`[rea-desk] sinalização em ws://${HOST}:${PORT}`);
}
module.exports = { start };
