'use strict';
const $ = (s) => document.querySelector(s);
const CHUNK = 16 * 1024;
const MAX_FILE = 200 * 1024 * 1024;

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} flushSoon(); },
};
// grava em disco logo depois de qualquer mudança (agrupa várias mudanças seguidas)
let flushTimer = null;
function flushSoon() { clearTimeout(flushTimer); flushTimer = setTimeout(() => { try { window.rea.flushStorage(); } catch {} }, 250); }
try { window.REA_MIGRATIONS.run(localStorage); } catch {}   // ajusta dados de versões anteriores (nunca apaga nada)
const cfg = {
  server: store.get('server', ''),   // vazio = automático
  stun: store.get('stun', ''),       // vazio = padrão do programa
};
let defaultStun = '';
let myName = store.get('name', '');
let ws, myId = store.get('myId', null), reconnectTimer, offlineTimer;
let peerId = null;      // com quem estou em sessão (ou chamando)
let peerName = '';
let role = null;        // 'host' (sendo acessado) | 'controller'
let pc, dc, localStream, pendingIce = [], hasRemote = false;
let callTimer, videoTimer, dropTimer;
let perms = { control: false, files: false };
let incoming = null;    // { from, name } enquanto o diálogo está aberto
let rx = null;          // arquivo sendo recebido

const fmtId = (id) => (id || '---').replace(/(\d{3})(?=\d)/g, '$1 ');
const digits = (s) => String(s).replace(/\D/g, '');
const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const who = () => peerName || 'A outra pessoa';

function toast(msg, ms = 4500) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
}
function homeMsg(text, ok = false) { const m = $('#homeMsg'); m.textContent = text; m.className = 'msg' + (ok ? ' ok' : ''); }
function log(text, cls = '') {
  const d = document.createElement('div');
  d.className = cls; d.textContent = text;
  $('#log').append(d); $('#log').scrollTop = 1e9;
}

/* ---------- Conexão com o ponto de encontro (automática) ---------- */
function setStatus(kind) {
  const c = $('#conn');
  if (kind === 'on') { c.textContent = 'Pronto para usar'; c.className = 'pill on'; }
  else if (kind === 'wait') { c.textContent = 'Conectando…'; c.className = 'pill off'; }
  else { c.textContent = 'Sem conexão – tentando de novo'; c.className = 'pill off'; }
}
function showBanner(text) { const b = $('#banner'); b.textContent = text || ''; b.hidden = !text; }

async function connectWS() {
  clearTimeout(reconnectTimer);
  setStatus('wait');
  let url = cfg.server, mode = 'internet';
  if (!url) {
    try { const r = await window.rea.getServer(); url = r.url; mode = r.mode; } catch { return scheduleReconnect(); }
  }
  $('#netNote').hidden = mode === 'internet';
  let sock;
  try { sock = new WebSocket(url); } catch { return scheduleReconnect(); }
  ws = sock;
  sock.onopen = () => {
    if (sock !== ws) return;
    clearTimeout(offlineTimer); showBanner('');
    setStatus('on');
    send({ t: 'register', id: myId });
  };
  sock.onclose = () => {
    if (sock !== ws) return;
    setStatus('off');
    offlineTimer ||= setTimeout(() => showBanner('Não conseguimos conectar. Verifique se este computador está ligado à internet ou ao Wi-Fi. Vamos continuar tentando sozinhos.'), 8000);
    if (peerId) { toast('A conexão com o outro computador foi interrompida.'); reset(); }
    scheduleReconnect();
  };
  sock.onerror = () => {};
  sock.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onSignal(m); };
}
function scheduleReconnect() { reconnectTimer = setTimeout(connectWS, 3000); }
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

function onSignal(m) {
  switch (m.t) {
    case 'registered':
      myId = m.id; store.set('myId', myId); $('#myId').textContent = fmtId(myId); break;
    case 'error':
      clearTimeout(callTimer);
      peerId = role = null; $('#btnConnect').disabled = false; setHistBusy(false);
      homeMsg('Não encontramos esse código. Confira se digitou certo e se o programa está aberto no outro computador.');
      break;
    case 'incoming':
      if (peerId || incoming) return send({ t: 'answer', to: m.from, accept: false, name: myName });
      incoming = { from: m.from, name: m.name || '' };
      $('#inFrom').textContent = `${incoming.name || 'Alguém'} (código ${fmtId(m.from)})`;
      $('#permCtl').checked = true; $('#permFiles').checked = true;
      $('#incoming').hidden = false;
      window.rea.attention();
      break;
    case 'answered':
      if (m.from !== peerId || role !== 'controller') return;
      clearTimeout(callTimer);
      if (!m.accept) {
        homeMsg(`${m.name || 'A pessoa'} não permitiu o acesso. Combine com ela e tente de novo.`);
        $('#btnConnect').disabled = false;
        return reset();
      }
      peerName = m.name || peerName;
      rememberDevice(peerId, peerName);
      fitPending = store.get('autoFit', '1') !== '0';          // ajusta a janela quando a primeira imagem chegar
      homeMsg('');
      preparePC();
      showSession(true);
      videoTimer = setTimeout(() => {
        toast('Não foi possível completar a conexão. Peça para a outra pessoa tentar de novo ou verifique a internet dos dois computadores.', 8000);
        endSession(true);
      }, 25000);
      break;
    case 'sig':
      if (m.from === peerId) onRtc(m.data); break;
    case 'bye':
      if (m.from === peerId || (incoming && incoming.from === m.from)) {
        toast(`${incoming ? 'O pedido foi cancelado.' : 'O acesso foi encerrado pela outra pessoa.'}`);
        if (incoming && incoming.from === m.from) { incoming = null; $('#incoming').hidden = true; }
        endSession(false);
      }
      break;
  }
}

/* ---------- WebRTC ---------- */
function preparePC() {
  const stun = cfg.stun || defaultStun;
  pc = new RTCPeerConnection({ iceServers: stun ? [{ urls: stun }] : [] });
  pendingIce = []; hasRemote = false;
  pc.onicecandidate = (e) => e.candidate && send({ t: 'sig', to: peerId, data: { ice: e.candidate } });
  pc.onconnectionstatechange = () => {
    const s = pc?.connectionState;
    if (s === 'connected') clearTimeout(dropTimer);
    else if (s === 'disconnected') {
      clearTimeout(dropTimer);
      dropTimer = setTimeout(() => { toast('A conexão caiu. Tente conectar novamente.'); endSession(true); }, 6000);
    } else if (s === 'failed' || s === 'closed') {
      if (peerId) { toast('A conexão caiu. Tente conectar novamente.'); endSession(true); }
    }
  };
  if (role === 'controller') {
    pc.ondatachannel = (e) => { dc = e.channel; setupDC(); };
    pc.ontrack = (e) => {
      // Cada faixa chega com o id do seu stream; o host diz (mensagem "views") qual stream é de qual janela.
      if (!e.streams[0]) return;
      streamById.set(e.streams[0].id, e.streams[0]);
      assignStreams();
    };
  }
}

async function startHost() {
  preparePC();
  showSession(false);
  try { monState = await window.rea.monitors.get(true); } catch {}      // cada sessão começa no monitor principal
  try {
    localStream = await captureMonitor(monState.selected);
  } catch {
    toast('Não foi possível compartilhar a tela deste computador. Feche o programa, abra de novo e tente outra vez.', 8000);
    return endSession(true);
  }
  primaryStreamId = localStream.id;           // é por este id que o controlador reconhece a janela principal (não muda com replaceTrack)
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
  dc = pc.createDataChannel('ctl'); setupDC();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send({ t: 'sig', to: peerId, data: { sdp: pc.localDescription } });
}

async function onRtc(d) {
  if (!pc || !d) return;
  try {
    if (d.sdp) {
      await pc.setRemoteDescription(d.sdp); hasRemote = true;
      for (const c of pendingIce) await pc.addIceCandidate(c);
      pendingIce = [];
      if (d.sdp.type === 'offer') {
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        send({ t: 'sig', to: peerId, data: { sdp: pc.localDescription } });
      } else if (role === 'host' && pendingReneg && pc.signalingState === 'stable') {
        pendingReneg = false; renegotiate();           // havia uma mudança de faixas esperando a resposta anterior
      }
    } else if (d.ice) {
      hasRemote ? await pc.addIceCandidate(d.ice) : pendingIce.push(d.ice);
    }
  } catch (err) { console.error('rtc', err); }
}

/* ---------- Canal de dados (controle, conversa, texto, arquivos) ---------- */
function setupDC() {
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = 1 << 20;
  dc.onopen = () => { log('Conexão segura estabelecida.', 'sys'); if (role === 'host') hostSendMonitors(); };
  dc.onmessage = (e) => {
    if (typeof e.data !== 'string') return onFileChunk(e.data);
    let m; try { m = JSON.parse(e.data); } catch { return; }
    onDC(m);
  };
}
const dsend = (o) => dc && dc.readyState === 'open' && dc.send(JSON.stringify(o));

async function onDC(m) {
  switch (m.k) {
    case 'mouse': case 'key':
      if (role === 'host' && perms.control) window.rea.input(m); break;
    case 'release': // o controlador perdeu o foco: solta teclas/botões que ficaram pressionados
      if (role === 'host') window.rea.releaseInput(); break;
    case 'refresh': // o controlador pediu uma imagem nova (a anterior parou)
      if (role === 'host') refreshHostVideo(); break;
    case 'monitor': // o controlador escolheu outro monitor para ver (só o host reage; clientes antigos nem enviam isto)
      if (role === 'host') hostSwitchMonitor(String(m.id));
      break;
    case 'view': // o controlador abriu/trocou/fechou a janela extra (outro monitor); hosts antigos ignoram esta mensagem
      if (role === 'host') hostViewOp(m);
      break;
    case 'monitors': // o host informa a lista de monitores e qual está sendo transmitido (hosts antigos nunca enviam)
      if (role === 'controller') onMonitors(m);
      break;
    case 'cursor': // o controlador pediu para mostrar/esconder o ponteiro do mouse deste computador
      if (role === 'host' && perms.control) setHostCursor(!!m.show);
      break;
    case 'cursorstate': // o computador controlado informa se o ponteiro está visível
      if (role === 'controller') $('#curToggle').checked = !!m.show;
      break;
    case 'chat':
      log(`${who()}: ${String(m.text).slice(0, 2000)}`);
      if (chatHidden) {                                   // conversa escondida: conta as não lidas e avisa só na primeira
        chatUnread++; applyChat();
        if (chatUnread === 1) toast(`Nova mensagem de ${who()}. Clique em "Mostrar conversa" para ler.`, 5000);
      }
      break;
    case 'clip':
      if (role === 'host') {
        if (!perms.files) return;
        await window.rea.writeClipboard(m.text); toast('Texto recebido. Agora é só colar (Ctrl+V).');
      } else {
        await window.rea.writeClipboard(m.text); toast('Texto trazido. Agora é só colar (Ctrl+V).');
      }
      break;
    case 'clipreq':
      if (role === 'host' && perms.files) dsend({ k: 'clip', text: await window.rea.readClipboard() });
      break;
    case 'file':
      if (role === 'host' && !perms.files) return;
      if (!Number.isFinite(m.size) || m.size < 0 || m.size > MAX_FILE) return;
      if (confirm(`${who()} quer enviar o arquivo "${String(m.name).slice(0, 120)}" (${fmtSize(m.size)}).\n\nDeseja receber?`)) {
        rx = { name: String(m.name), size: m.size, got: 0, parts: [] };
      } else { rx = null; }
      break;
    case 'fileend':
      if (rx) {
        const total = rx.parts.reduce((n, p) => n + p.byteLength, 0);
        const buf = new Uint8Array(total); let o = 0;
        for (const p of rx.parts) { buf.set(new Uint8Array(p), o); o += p.byteLength; }
        await window.rea.saveFile(rx.name, buf);
        log(`Arquivo recebido: ${rx.name}`, 'sys');
        toast('Arquivo salvo na pasta Downloads, dentro de "REA-Desk-Recebidos".');
        rx = null;
      }
      break;
  }
}
function onFileChunk(buf) {
  if (!rx) return;
  rx.got += buf.byteLength;
  if (rx.got > rx.size) { rx = null; return; }
  rx.parts.push(buf);
}

async function sendFile(file) {
  if (!dc || dc.readyState !== 'open') return toast('Ainda não há conexão com o outro computador.');
  if (role === 'host' && !perms.files) return;
  if (file.size > MAX_FILE) return toast('Este arquivo é muito grande (o limite é 200 MB).');
  dsend({ k: 'file', name: file.name, size: file.size });
  log(`Enviando "${file.name}"…`, 'sys');
  for (let off = 0; off < file.size; off += CHUNK) {
    if (!dc || dc.readyState !== 'open') return toast('O envio foi interrompido porque a conexão caiu.');
    if (dc.bufferedAmount > (4 << 20)) {
      await new Promise((r) => { dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; r(); }; });
    }
    dc.send(await file.slice(off, off + CHUNK).arrayBuffer());
  }
  dsend({ k: 'fileend' });
  log(`Arquivo enviado: "${file.name}"`, 'sys');
}

/* ---------- Sessão ---------- */
function showSession(waiting) {
  $('#home').hidden = true; $('#session').hidden = false;
  const host = role === 'host';
  $('#sessInfo').textContent = host ? `${who()} está acessando este computador` : `Você está acessando ${who()}`;
  $('#hostNote').hidden = !host;
  $('#hostPeer').textContent = `${who()} (código ${fmtId(peerId)})`;
  $('#waiting').hidden = host || !waiting;
  $('#ctlWrap').hidden = host; $('#btnClipGet').hidden = host; $('#btnClipSend').hidden = host; $('#btnRefresh').hidden = host; $('#curWrap').hidden = host;
  $('#btnFull').hidden = host; $('#btnView').hidden = host; $('#btnFit').hidden = host;
  $('#btnFile').hidden = host && !perms.files;
  $('#btnEnd').hidden = false;
  $('#remote').hidden = host;
  window.rea.sessionState(true);
}

function endSession(notify) {
  if (notify && peerId) send({ t: 'bye', to: peerId });
  reset();
}
function reset() {
  clearTimeout(callTimer); clearTimeout(videoTimer); clearTimeout(dropTimer);
  if (role === 'host') { try { window.rea.input({ k: 'cursor', show: true }); } catch {} } // nunca deixar o mouse escondido
  $('#cursorNote').hidden = true; $('#curToggle').checked = true;
  try { window.rea.releaseInput(); } catch {}
  try { dc?.close(); } catch {}
  try { pc?.close(); } catch {}
  localStream?.getTracks().forEach((t) => t.stop());
  extraView?.stream.getTracks().forEach((t) => t.stop());
  closeViewWindow();
  $('#remote').srcObject = null;
  pc = dc = localStream = null; peerId = role = null; peerName = ''; rx = null;
  extraView = null; primaryStreamId = null; pendingReneg = false; viewsInfo = null; streamById.clear();
  monState = { list: [], selected: null, rev: 0 }; viewMon = null; pendingSelect = null;
  $('#btnPopout').hidden = true;
  $('#monPick').hidden = true; $('#monPick').textContent = ''; $('#monNote').hidden = true;
  perms = { control: false, files: false };
  pendingIce = []; hasRemote = false;
  $('#session').hidden = true; $('#home').hidden = false; $('#log').textContent = '';
  chatUnread = 0; applyChat();
  $('#btnConnect').disabled = false; setHistBusy(false);
  window.rea.sessionState(false);
  if (document.fullscreenElement) document.exitFullscreen();
}

/* ---------- Entrada do controlador (mouse/teclado) ---------- */
const video = $('#remote');
function norm(e, v = video) {
  const r = v.getBoundingClientRect();
  const vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh) return null;
  const s = Math.min(r.width / vw, r.height / vh);
  const w = vw * s, h = vh * s;
  const x = (e.clientX - r.left - (r.width - w) / 2) / w;
  const y = (e.clientY - r.top - (r.height - h) / 2) / h;
  return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
}
const controlling = () => role === 'controller' && $('#ctlToggle').checked;
// Liga mouse e teclado a uma imagem (a janela principal e a segunda janela usam a mesma função).
// `getMon` devolve o monitor que ESSA imagem mostra; vai em cada mensagem de mouse (`mon`).
function attachInput(v, getMon) {
  let lastMv = 0;
  v.addEventListener('mousemove', (e) => {
    if (!controlling()) return;
    const now = performance.now(); if (now - lastMv < 16) return; lastMv = now;
    const p = norm(e, v); if (p) dsend({ k: 'mouse', type: 'move', mon: getMon(), ...p });
  });
  for (const type of ['down', 'up']) {
    v.addEventListener('mouse' + type, (e) => {
      if (!controlling()) return;
      v.focus(); e.preventDefault();
      const p = norm(e, v); if (p) dsend({ k: 'mouse', type, button: e.button, mon: getMon(), ...p });
    });
  }
  v.addEventListener('wheel', (e) => {
    if (!controlling()) return; e.preventDefault();
    const p = norm(e, v); if (p) dsend({ k: 'mouse', type: 'wheel', mon: getMon(), dy: e.deltaMode === 0 ? e.deltaY : e.deltaY * 40, ...p });
  }, { passive: false });
  v.addEventListener('contextmenu', (e) => e.preventDefault());
  for (const down of [true, false]) {
    v.addEventListener(down ? 'keydown' : 'keyup', (e) => {
      if (!controlling()) return;
      e.preventDefault();
      dsend({ k: 'key', down, code: e.code });
    });
  }
}
attachInput(video, () => viewMon);

/* ---------- Modo de exibição: esticada / reduzida ---------- */
// Esticada: a imagem preenche a janela e é ampliada se a janela for maior que a tela remota.
// Reduzida (padrão): só diminui quando é maior que a janela, sem ampliar (tamanho real, centralizada, sem borrar).
// Vale para a janela principal e para a segunda janela; a escolha é lembrada (localStorage "viewMode").
const VM = window.REA_VIEWMODE;
let viewMode = VM.normalize(store.get('viewMode', VM.DEFAULT));
function layoutVideo(t) {
  const f = VM.fit(t.video.videoWidth, t.video.videoHeight, t.area.clientWidth, t.area.clientHeight, t.win.devicePixelRatio || 1, viewMode);
  t.area.classList.toggle('shrink', viewMode === 'shrink');
  t.video.style.width = f ? f.width + 'px' : '';
  t.video.style.height = f ? f.height + 'px' : '';
}
function registerVideo(video, area, win) {                   // area = contêiner da imagem; recalcula quando o tamanho muda
  const t = { video, area, win, ro: null };
  const relayout = () => layoutVideo(t);
  t.ro = new win.ResizeObserver(relayout); t.ro.observe(area);
  video.addEventListener('loadedmetadata', relayout);
  video.addEventListener('resize', relayout);                 // o outro computador mudou de resolução / de monitor
  win.addEventListener('resize', relayout);
  layoutVideo(t);
  return t;
}
function unregisterVideo(t) { try { t.ro.disconnect(); } catch {} }
const mainVideoView = registerVideo(video, $('#viewWrap'), window);
function updateViewButtons() {
  const text = VM.label(viewMode);
  $('#btnView').textContent = text; $('#btnView').title = VM.HELP;
  $('#btnView').setAttribute('aria-pressed', String(viewMode === 'shrink'));
  if (view2 && view2.win && !view2.win.closed) { const b = view2.win.document.getElementById('viewBtn2'); if (b) { b.textContent = text; b.title = VM.HELP; } }
}
function setViewMode(m) {
  viewMode = VM.normalize(m);
  store.set('viewMode', viewMode);
  layoutVideo(mainVideoView);
  if (view2 && view2.vt) layoutVideo(view2.vt);
  updateViewButtons();
}
$('#btnView').onclick = () => { setViewMode(VM.next(viewMode)); if (role === 'controller' && controlling()) video.focus(); };

// Ajustar a janela à tela remota (como o AnyDesk): o tamanho desejado da área da imagem é o tamanho REAL da tela remota
// (1 pixel remoto = 1 pixel do seu monitor) mais uma margem; o processo principal limita à área útil do monitor.
// A barra de botões muda de altura conforme a largura, por isso medimos o "resto da janela" e repetimos uma vez.
let fitPending = false;
const FIT_MARGIN = 24;
async function fitWindowToRemote() {
  if (role !== 'controller' || !video.videoWidth) return;
  const area = $('#viewWrap'), dpr = window.devicePixelRatio || 1;
  const chromeW = window.innerWidth - area.clientWidth, chromeH = window.innerHeight - area.clientHeight;
  const w = Math.ceil(video.videoWidth / dpr) + 2 * FIT_MARGIN + chromeW;
  const h = Math.ceil(video.videoHeight / dpr) + 2 * FIT_MARGIN + chromeH;
  try { await window.rea.fitWindow(w, h); } catch {}
}
async function fitWindowTwice() { await fitWindowToRemote(); await new Promise((r) => setTimeout(r, 450)); await fitWindowToRemote(); }
video.addEventListener('loadedmetadata', () => { if (fitPending) { fitPending = false; setTimeout(fitWindowTwice, 250); } });
$('#btnFit').onclick = () => { fitWindowTwice(); if (controlling()) video.focus(); };
// Ao minimizar / trocar de janela, nada deve ficar pressionado no computador remoto.
const releaseRemote = () => { if (role === 'controller') dsend({ k: 'release' }); };
window.addEventListener('blur', releaseRemote);
video.addEventListener('blur', releaseRemote);

/* ---------- Vários monitores ---------- */
// Protocolo (estende o canal de dados existente; mensagens desconhecidas são ignoradas, então versões antigas seguem funcionando):
//   host -> controlador  { k:'monitors', list:[{id,index,x,y,w,h,scale,rotation,primary}], selected, rev, reason? }
//   controlador -> host  { k:'monitor', id }
//   controlador -> host  mensagens de mouse ganham `mon` = monitor que o controlador estava vendo
let monState = { list: [], selected: null, rev: 0 };   // host: vem do processo principal; controlador: vem do host
let viewMon = null;                                     // controlador: monitor que está na tela
let switching = null, pendingSelect = null;             // host: troca em andamento / pedido que chegou durante a troca

// Segunda janela (outro monitor da MESMA sessão). Em vez de abrir uma segunda conexão (o computador controlado só aceita uma
// sessão), o host manda uma SEGUNDA faixa de vídeo pela conexão existente e o controlador a mostra numa janela extra.
//   controlador -> host  { k:'view', op:'open'|'set'|'close', id }      (op 'open'/'set' = mostrar o monitor `id` na janela extra)
//   host -> controlador  { k:'monitors', ..., views:[{slot:1,monitor,streamId},{slot:2,monitor,streamId}], viewLost? }
//   o controlador liga cada faixa recebida à janela certa pelo id do stream (streamId).
let extraView = null;            // host: { monitor, stream, sender, streamId } (monitor mostrado na janela extra)
let primaryStreamId = null;      // host: id do stream da janela principal (é o id que o controlador enxerga; replaceTrack não o muda)
let pendingReneg = false;        // host: mudança de faixas esperando a resposta da negociação anterior
let captureChain = Promise.resolve();   // host: capturas uma de cada vez (a escolha do monitor vai por um "pedido" ao processo principal)
let viewOps = Promise.resolve();        // host: pedidos da janela extra uma de cada vez
let viewsInfo = null;            // controlador: o que o host disse sobre as janelas; null = host antigo (só uma janela)
const streamById = new Map();    // controlador: streams recebidos, por id
let view2 = null;                // controlador: { win, video, monitor, pending, closing }

function captureMonitor(id) {
  const run = async () => {
    await window.rea.monitors.captureHint(id);
    return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
  };
  const p = captureChain.then(run, run);
  captureChain = p.catch(() => {});
  return p;
}
async function renegotiate() {
  if (!pc || role !== 'host') return;
  if (pc.signalingState !== 'stable') { pendingReneg = true; return; }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send({ t: 'sig', to: peerId, data: { sdp: pc.localDescription } });
}
async function hostOpenView(id) {
  const stream = await captureMonitor(id);
  const sender = pc.addTrack(stream.getVideoTracks()[0], stream);
  extraView = { monitor: id, stream, sender, streamId: stream.id };
  await renegotiate();
}
async function hostSetView(id) {
  const next = await captureMonitor(id);
  await extraView.sender.replaceTrack(next.getVideoTracks()[0]);
  extraView.stream.getTracks().forEach((t) => t.stop());
  extraView.stream = next; extraView.monitor = id;             // streamId (o id que o controlador conhece) continua o mesmo
}
async function hostCloseView() {
  if (!extraView) return;
  const e = extraView; extraView = null;
  try { pc.removeTrack(e.sender); } catch {}
  e.stream.getTracks().forEach((t) => t.stop());
  await renegotiate();
}
function hostViewOp(m) {
  if (role !== 'host') return;
  viewOps = viewOps.then(async () => {
    const id = String(m.id == null ? '' : m.id);
    try {
      if (m.op === 'close') await hostCloseView();
      else if (m.op === 'open' || m.op === 'set') {
        const valid = monState.list.some((x) => x.id === id) && id !== monState.selected;   // não pode repetir o monitor da janela principal
        if (valid && !extraView) await hostOpenView(id);
        else if (valid && extraView.monitor !== id) await hostSetView(id);
      }
    } catch (err) { console.error('janela extra', err); toast('Não foi possível mostrar o segundo monitor agora.'); }
    hostSendMonitors();
  });
}

// Host: captura de novo o monitor selecionado e troca a faixa de vídeo SEM renegociar (replaceTrack).
async function applyCapture() {
  const next = await captureMonitor(monState.selected);
  const snd = pc && pc.getSenders().find((s) => s.track && s.track.kind === 'video');
  if (!snd) { next.getTracks().forEach((t) => t.stop()); throw new Error('sem faixa de vídeo para trocar'); }
  const old = localStream;
  await snd.replaceTrack(next.getVideoTracks()[0]);
  localStream = next;
  old?.getTracks().forEach((t) => t.stop());
}
function hostSendMonitors(more = {}) {
  if (role !== 'host') return;
  const views = [{ slot: 1, monitor: monState.selected, streamId: primaryStreamId }];
  if (extraView) views.push({ slot: 2, monitor: extraView.monitor, streamId: extraView.streamId });
  dsend({ k: 'monitors', list: monState.list, selected: monState.selected, rev: monState.rev, views, ...more });
  const idx = (id) => (monState.list.find((m) => m.id === id) || {}).index;
  const shown = [idx(monState.selected), extraView && idx(extraView.monitor)].filter(Boolean).sort();
  $('#monNote').hidden = !(monState.list.length > 1 && shown.length);
  $('#monNum').textContent = shown.join(' e ');
}
async function hostSwitchMonitor(id) {
  if (role !== 'host') return;
  if (extraView && extraView.monitor === id) return hostSendMonitors();   // esse monitor já está na janela extra
  if (switching) { pendingSelect = id; return; }                      // já trocando: guarda o último pedido
  switching = (async () => {
    let target = id;
    for (;;) {
      const r = await window.rea.monitors.select(target);
      monState = { list: r.list, selected: r.selected, rev: r.rev };
      if (r.changed) {
        try { await applyCapture(); }
        catch (err) { console.error('troca de monitor', err); toast('Não foi possível trocar o monitor agora. Tente de novo.'); }
      }
      hostSendMonitors();
      if (pendingSelect == null) break;
      target = pendingSelect; pendingSelect = null;
    }
  })().finally(() => { switching = null; });
  return switching;
}
// Host: monitor conectado/desconectado ou mudança de resolução/orientação/escala durante a sessão.
window.rea.monitors.onChanged(async (s) => {
  monState = { list: s.list, selected: s.selected, rev: s.rev };
  if (role !== 'host' || !pc) return;
  if (switching) await switching.catch(() => {});
  if (s.recapture) {                                                  // o monitor transmitido mudou ou sumiu
    try { await applyCapture(); } catch (err) { console.error('recaptura', err); toast('A tela mudou e não foi possível atualizar a imagem. Use "Atualizar imagem".'); }
  }
  // janela extra: se o monitor dela sumiu (ou passou a ser o da janela principal), fecha; se mudou de resolução/orientação, captura de novo
  let viewLost = false;
  if (extraView) {
    const gone = !s.list.some((m) => m.id === extraView.monitor) || extraView.monitor === s.selected;
    if (gone) { viewLost = true; try { await hostCloseView(); } catch (err) { console.error('fechar janela extra', err); } }
    else if ((s.changed || []).includes(extraView.monitor)) { try { await hostSetView(extraView.monitor); } catch (err) { console.error('recaptura da janela extra', err); } }
  }
  hostSendMonitors({ reason: s.selectionLost ? 'lost' : 'changed', viewLost });
});

// Controlador: recebe a lista e mostra os botões de monitor (só aparecem se houver mais de um).
function onMonitors(m) {
  if (!Array.isArray(m.list)) return;
  monState = { list: m.list, selected: m.selected == null ? null : String(m.selected), rev: m.rev || 0 };
  viewMon = monState.selected;
  if (Array.isArray(m.views)) {                       // host que sabe mandar uma segunda janela
    viewsInfo = m.views;
    const v2 = m.views.find((v) => v.slot === 2);
    if (view2 && v2) { view2.monitor = String(v2.monitor); view2.pending = false; }
    else if (view2 && !view2.pending) { closeViewWindow(); toast(m.viewLost ? 'O monitor da segunda janela foi desconectado. A janela foi fechada.' : 'A segunda janela foi encerrada.', 6000); }
    assignStreams();
  }
  renderMonitors();
  if (m.reason === 'lost') toast('O monitor que você estava vendo foi desconectado. Agora você vê o monitor principal.', 6000);
  else if (m.reason === 'changed' && !m.viewLost) toast('A configuração dos monitores do outro computador mudou.', 4000);
}
// Liga cada stream recebido à janela certa (principal ou extra).
function assignStreams() {
  const info = viewsInfo || [{ slot: 1, streamId: [...streamById.keys()][0] }];   // host antigo: o único stream é a janela principal
  for (const v of info) {
    const st = streamById.get(v.streamId);
    if (!st) continue;
    if (v.slot === 1 && $('#remote').srcObject !== st) {
      clearTimeout(videoTimer);
      $('#remote').srcObject = st; $('#waiting').hidden = true; $('#remote').focus();
    }
    if (v.slot === 2 && view2 && view2.video.srcObject !== st) { view2.video.srcObject = st; view2.video.play().catch(() => {}); }
  }
}
function renderMonitors() {
  const box = $('#monPick'), list = monState.list;
  box.hidden = list.length < 2;
  $('#btnPopout').hidden = !(role === 'controller' && list.length > 1 && viewsInfo);
  if (box.hidden) { box.textContent = ''; renderViewBar(); return; }
  box.textContent = '';
  const lab = document.createElement('span'); lab.className = 'monlabel'; lab.textContent = 'Monitor:'; box.append(lab);
  for (const m of list) {
    const inOther = !!view2 && m.id === view2.monitor;       // esse monitor está na outra janela
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ghost' + (m.id === monState.selected ? ' on' : '');
    b.textContent = String(m.index); b.disabled = inOther;
    b.title = inOther ? `Monitor ${m.index}: já está aberto na outra janela` : `Monitor ${m.index}: ${m.w}×${m.h}${m.primary ? ' (principal)' : ''}`;
    b.setAttribute('aria-pressed', m.id === monState.selected ? 'true' : 'false');
    b.onclick = () => { if (m.id !== monState.selected) dsend({ k: 'monitor', id: m.id }); };
    box.append(b);
  }
  renderViewBar();
}

// Controlador: segunda janela (about:blank aberto pelo processo principal, montado aqui). Roda no mesmo código desta janela,
// então reaproveita a conexão, o mouse e o teclado (attachInput) sem nada novo para sincronizar.
function openViewWindow() {
  if (view2 && view2.win && !view2.win.closed) { view2.win.focus(); return; }
  const target = monState.list.find((m) => m.id !== monState.selected);          // primeiro monitor que a janela principal não mostra
  if (!target) return;
  let w = null;
  try { w = window.open('about:blank', 'rea-view-2'); } catch {}
  if (!w) return toast('Não foi possível abrir a segunda janela.');
  const d = w.document;
  d.title = 'REA Desk – segundo monitor';
  const css = d.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('style.css', location.href).href; d.head.append(css);
  d.body.className = 'viewwin';
  const bar = d.createElement('div'); bar.className = 'bar';
  const info = d.createElement('span'); info.id = 'info';
  const sp = d.createElement('span'); sp.className = 'spacer';
  const pick = d.createElement('span'); pick.className = 'monpick'; pick.id = 'monPick2';
  const full = d.createElement('button'); full.className = 'ghost'; full.textContent = 'Tela cheia';
  const close = d.createElement('button'); close.className = 'danger'; close.textContent = 'Fechar esta janela';
  const vmode = d.createElement('button'); vmode.className = 'ghost'; vmode.id = 'viewBtn2';
  bar.append(info, sp, pick, vmode, full, close);
  const v = d.createElement('video'); v.autoplay = true; v.muted = true; v.playsInline = true; v.tabIndex = 0;
  const area = d.createElement('div'); area.className = 'viewarea'; area.append(v);
  d.body.append(bar, area);
  full.onclick = () => (d.fullscreenElement ? d.exitFullscreen() : area.requestFullscreen());
  close.onclick = () => w.close();
  vmode.onclick = () => setViewMode(VM.next(viewMode));
  view2 = { win: w, video: v, monitor: target.id, pending: true, closing: false, vt: registerVideo(v, area, w) };
  updateViewButtons();
  attachInput(v, () => view2 && view2.monitor);
  w.addEventListener('blur', releaseRemote);
  v.addEventListener('pause', () => { if (view2 && view2.video === v && v.srcObject) v.play().catch(() => {}); });
  w.addEventListener('pagehide', () => {                                           // o usuário fechou a janela
    if (!view2 || view2.win !== w) return;
    const mine = view2; view2 = null;
    unregisterVideo(mine.vt);
    if (!mine.closing) dsend({ k: 'view', op: 'close' });
    renderMonitors();
  });
  dsend({ k: 'view', op: 'open', id: target.id });
  setTimeout(() => { if (view2 && view2.win === w && view2.pending) { closeViewWindow(); toast('O outro computador não conseguiu abrir o segundo monitor.', 6000); } }, 10000);
  renderMonitors();
}
function closeViewWindow() {
  if (!view2) return;
  const w = view2.win; view2.closing = true; unregisterVideo(view2.vt); view2 = null;
  try { w.close(); } catch {}
  if (role === 'controller') renderMonitors();
}
function renderViewBar() {
  if (!view2 || !view2.win || view2.win.closed) return;
  const d = view2.win.document, box = d.getElementById('monPick2'), list = monState.list;
  const mon = list.find((m) => m.id === view2.monitor);
  d.getElementById('info').textContent = mon ? `Monitor ${mon.index} de ${who()}` : `Segundo monitor de ${who()}`;
  box.textContent = '';
  for (const m of list) {
    const b = d.createElement('button'); b.type = 'button';
    const mine = m.id === view2.monitor, inMain = m.id === monState.selected;
    b.className = 'ghost' + (mine ? ' on' : ''); b.textContent = String(m.index); b.disabled = inMain;
    b.title = inMain ? `Monitor ${m.index}: já está aberto na janela principal` : `Monitor ${m.index}: ${m.w}×${m.h}${m.primary ? ' (principal)' : ''}`;
    b.onclick = () => { if (!mine) dsend({ k: 'view', op: 'set', id: m.id }); };
    box.append(b);
  }
}
$('#btnPopout').onclick = openViewWindow;

/* ---------- Mostrar / esconder o mouse do computador controlado ---------- */
// O ponteiro vai embutido na imagem e não dá para tirá-lo só do vídeo; então ele é escondido no próprio computador
// controlado (ponteiros do Windows ficam transparentes) e restaurado ao encerrar o acesso.
function setHostCursor(show) {
  window.rea.input({ k: 'cursor', show });
  $('#cursorNote').hidden = show;
  dsend({ k: 'cursorstate', show });
}
$('#curToggle').onchange = (e) => dsend({ k: 'cursor', show: e.target.checked });
$('#btnCursorShow').onclick = () => setHostCursor(true);
window.rea.onCursorRestored(() => { $('#cursorNote').hidden = true; dsend({ k: 'cursorstate', show: true }); });

/* ---------- Recuperação da imagem (anti-congelamento) ---------- */
// Host: força o codificador a gerar um quadro completo novo (desliga e liga o envio do vídeo).
let refreshing = false;
async function refreshHostVideo() {
  if (refreshing || !pc || role !== 'host') return;
  refreshing = true;
  try {
    for (const s of pc.getSenders()) {
      if (s.track?.kind !== 'video') continue;
      const p = s.getParameters();
      if (!p.encodings?.length) continue;
      p.encodings[0].active = false; await s.setParameters(p);
      await new Promise((r) => setTimeout(r, 150));
      const q = s.getParameters();
      q.encodings[0].active = true; await s.setParameters(q);
    }
  } catch (err) { console.error('refresh', err); }
  refreshing = false;
}
// ATENÇÃO (piscar): recolocar o vídeo na tela (srcObject = null; srcObject = stream) faz o navegador esvaziar e recarregar a imagem,
// e isso aparece como um piscar. Por isso há duas ações separadas, e a segunda é rara:
//   requestKeyframe(): só PEDE um quadro novo ao outro computador (não mexe no vídeo da tela; não pisca)
//   reattachVideo():   recoloca o vídeo na tela (pode piscar). Só no botão "Atualizar imagem", ao voltar de uma janela minimizada
//                      e quando o pedido de quadro novo não resolveu uma imagem realmente congelada.
let lastKeyframe = 0;
function requestKeyframe(force = false) {
  if (role !== 'controller' || !video.srcObject) return;
  const now = Date.now();
  if (!force && now - lastKeyframe < 8000) return;
  lastKeyframe = now;
  dsend({ k: 'refresh' });
}
function reattachVideo() {
  if (role !== 'controller' || !video.srcObject) return;
  const s = video.srcObject;
  video.srcObject = null; video.srcObject = s;
  video.play().catch(() => {});
}
function requestRefresh() { reattachVideo(); requestKeyframe(true); }          // botão "Atualizar imagem"

// Vigia de imagem congelada. Só vale quando o usuário está CONTROLANDO com o ponteiro remoto VISÍVEL: aí cada movimento do mouse
// faz o ponteiro remoto mexer e gera quadros novos; se mesmo assim a imagem não muda por 4 s, ela travou de verdade.
// (Sem controle, ou com o ponteiro remoto escondido, uma tela parada é normal e NÃO é sinal de travamento.)
let wdFrames = -1, wdChangedAt = Date.now(), lastPointer = 0, wdStrikes = 0;
video.addEventListener('mousemove', () => { if (controlling() && $('#curToggle').checked) lastPointer = Date.now(); });
setInterval(async () => {
  if (role !== 'controller' || !pc || pc.connectionState !== 'connected' || !video.srcObject) { wdFrames = -1; wdStrikes = 0; return; }
  let n = 0;
  try { (await pc.getStats()).forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'video') n = r.framesDecoded; }); } catch { return; }
  const now = Date.now();
  if (n !== wdFrames) { wdFrames = n; wdChangedAt = now; wdStrikes = 0; return; }
  if (now - wdChangedAt > 4000 && now - lastPointer < 3000) {
    wdChangedAt = now; wdStrikes++;
    requestKeyframe();                                      // 1ª vez: só pede quadro novo (não pisca)
    if (wdStrikes >= 2) { wdStrikes = 0; reattachVideo(); } // não resolveu: recoloca o vídeo (último recurso)
  }
}, 1500);

// Voltar para a janela: o vídeo continua rodando e o teclado volta ao controle. Só reencaixa o vídeo depois de uma janela
// REALMENTE minimizada/escondida; foco e redimensionamento comuns não recarregam nada.
function wake(reattach = false) {
  if (role !== 'controller' || !video.srcObject) return;
  video.play().catch(() => {});
  if ($('#ctlToggle').checked) video.focus();
  if (reattach) { reattachVideo(); requestKeyframe(); }
}
window.rea.onLostFocus(releaseRemote);
window.rea.onWindowBack(() => setTimeout(() => wake(true), 100));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(true); });
window.addEventListener('focus', () => wake(false));
video.addEventListener('pause', () => { if (role === 'controller' && video.srcObject) video.play().catch(() => {}); });

/* ---------- Ocultar / mostrar a conversa ---------- */
// A escolha é lembrada entre sessões (localStorage "chatHidden"). Com a conversa escondida, a imagem do outro computador ocupa a
// janela toda; mensagens novas viram um contador no botão (e um aviso na primeira), e nada se perde: ao mostrar, estão lá.
let chatHidden = store.get('chatHidden', '0') === '1';
let chatUnread = 0;
function applyChat() {
  document.querySelector('.stage').classList.toggle('nochat', chatHidden);
  $('#chatBtnText').textContent = chatHidden ? 'Mostrar conversa' : 'Ocultar conversa';
  $('#btnChat').setAttribute('aria-pressed', String(!chatHidden));
  const b = $('#chatBadge');
  b.hidden = !(chatHidden && chatUnread > 0);
  b.textContent = chatUnread > 99 ? '99+' : String(chatUnread);
  if (!b.hidden) b.setAttribute('aria-label', `${chatUnread} mensagens novas`);
}
function setChatHidden(hide) {
  chatHidden = hide;
  if (!hide) chatUnread = 0;
  store.set('chatHidden', hide ? '1' : '0');
  applyChat();
  if (!hide) { $('#log').scrollTop = 1e9; setTimeout(() => $('#chatText').focus(), 0); }
  else if (role === 'controller' && controlling()) video.focus();      // o teclado volta para o outro computador
}
$('#btnChat').onclick = () => setChatHidden(!chatHidden);
applyChat();
updateViewButtons();      // (depois da declaração de view2)

/* ---------- Botões ---------- */
function startCall(id) {
  if (id.length !== 9) return homeMsg('Digite os 9 números do código que a outra pessoa informou.');
  if (id === myId) return homeMsg('Esse é o código deste computador. Digite o código da outra pessoa.');
  if (!ws || ws.readyState !== 1) return homeMsg('Ainda estamos conectando. Aguarde alguns segundos e tente de novo.');
  if (peerId) return;
  peerId = id; role = 'controller'; peerName = '';
  $('#btnConnect').disabled = true; setHistBusy(true);
  homeMsg('Pedido enviado. Aguardando a outra pessoa permitir o acesso…', true);
  send({ t: 'call', to: id, name: myName });
  callTimer = setTimeout(() => {
    if (peerId === id && role === 'controller' && $('#session').hidden) {
      send({ t: 'bye', to: id });
      homeMsg('A pessoa não respondeu. Peça para ela olhar a tela do computador e tente de novo.');
      reset();
    }
  }, 60000);
}
$('#btnConnect').onclick = () => startCall(digits($('#remoteId').value));

/* ---------- Histórico de computadores acessados ---------- */
// Cada acesso aceito é lembrado (código, nome, data), para conectar de novo com um clique, sem digitar o código.
// Fica em localStorage ("history"), em AppData, e sobrevive às atualizações. Lógica em history.js (testada em npm test).
const HIST = window.REA_HISTORY;
let devHist = HIST.parse(store.get('history', '[]'));
let editingId = null;
const saveHistory = () => store.set('history', JSON.stringify(devHist));
function setHistBusy(b) { document.querySelector('.hist').classList.toggle('busy', !!b); }
function rememberDevice(id, name) { devHist = HIST.record(devHist, id, name); saveHistory(); renderHistory(); }
function connectFromHistory(id) { $('#remoteId').value = fmtId(id); homeMsg(''); startCall(id); }

function histButton(cls, text, title, onclick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.textContent = text; b.title = title; b.setAttribute('aria-label', title); b.onclick = onclick;
  return b;
}
function renderHistory() {
  const list = $('#histList'); list.textContent = '';
  $('#histEmpty').hidden = devHist.length > 0;
  $('#histClear').hidden = devHist.length === 0;
  for (const e of devHist) {
    const li = document.createElement('li'); li.dataset.id = e.id;
    const name = HIST.displayName(e);
    if (editingId === e.id) {
      const inp = document.createElement('input');
      inp.className = 'hist-edit'; inp.value = e.name; inp.maxLength = 40; inp.placeholder = 'Nome deste computador'; inp.setAttribute('aria-label', 'Nome do computador');
      let done = false;
      const finish = (save) => { if (done) return; done = true; editingId = null; if (save) { devHist = HIST.rename(devHist, e.id, inp.value); saveHistory(); } renderHistory(); };
      inp.onkeydown = (ev) => { if (ev.key === 'Enter') finish(true); else if (ev.key === 'Escape') finish(false); };
      inp.onblur = () => finish(true);
      li.append(inp);
      list.append(li);
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
      continue;
    }
    const main = document.createElement('button');
    main.type = 'button'; main.className = 'hist-main'; main.title = `Conectar a ${name}`;
    const n = document.createElement('span'); n.className = 'hist-name'; n.textContent = name;
    const sub = document.createElement('span'); sub.className = 'hist-sub'; sub.textContent = `${HIST.fmtCode(e.id)} · ${HIST.timeAgo(e.lastAt)}`;
    main.append(n, sub);
    main.onclick = () => connectFromHistory(e.id);
    li.append(main,
      histButton('hist-act' + (e.fav ? ' fav' : ''), e.fav ? '★' : '☆', e.fav ? 'Tirar dos favoritos' : 'Marcar como favorito', () => { devHist = HIST.toggleFavorite(devHist, e.id); saveHistory(); renderHistory(); }),
      histButton('hist-act', '✎', 'Renomear', () => { editingId = e.id; renderHistory(); }),
      histButton('hist-act', '✕', 'Remover do histórico', () => { devHist = HIST.remove(devHist, e.id); saveHistory(); renderHistory(); }));
    list.append(li);
  }
}
$('#histClear').onclick = () => {
  if (!confirm('Apagar o histórico de computadores acessados?\n\nOs favoritos (★) serão mantidos.')) return;
  devHist = HIST.clearKeepingFavorites(devHist); saveHistory(); renderHistory();
};
setInterval(() => { if (editingId === null && !$('#home').hidden) renderHistory(); }, 60000);   // atualiza o "há X min"
renderHistory();

$('#remoteId').addEventListener('keydown', (e) => e.key === 'Enter' && $('#btnConnect').click());
$('#remoteId').addEventListener('input', (e) => (e.target.value = fmtId(digits(e.target.value))));
$('#copyId').onclick = async () => { await window.rea.writeClipboard(fmtId(myId || '')); toast('Código copiado. Agora é só colar na mensagem para a pessoa.'); };

$('#inAccept').onclick = () => {
  const { from, name } = incoming; incoming = null; $('#incoming').hidden = true;
  perms = { control: $('#permCtl').checked, files: $('#permFiles').checked };
  peerId = from; peerName = name; role = 'host';
  send({ t: 'answer', to: from, accept: true, name: myName });
  startHost();
};
$('#inDeny').onclick = () => {
  send({ t: 'answer', to: incoming.from, accept: false, name: myName });
  incoming = null; $('#incoming').hidden = true;
};

$('#btnEnd').onclick = () => endSession(true);
$('#btnEndHost').onclick = () => endSession(true);
window.rea.onEndRequest(() => endSession(true));
$('#btnFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : $('#viewWrap').requestFullscreen());
$('#btnFile').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) sendFile(f); };
$('#btnClipSend').onclick = async () => { dsend({ k: 'clip', text: await window.rea.readClipboard() }); toast('Texto enviado. Cole no outro computador com Ctrl+V.'); };
$('#btnClipGet').onclick = () => dsend({ k: 'clipreq' });
$('#btnRefresh').onclick = () => { requestRefresh(); toast('Atualizando a imagem…', 2000); };
$('#chatForm').onsubmit = (e) => {
  e.preventDefault();
  const t = $('#chatText').value.trim(); if (!t) return;
  dsend({ k: 'chat', text: t }); log('Você: ' + t, 'me'); $('#chatText').value = '';
};

/* ---------- Atualizações ---------- */
let upd = null, dismissedFor = null;
function renderUpdate(s) {
  upd = s;
  // aviso de que uma atualização falhou e voltamos para a versão anterior
  const rb = s.rolledBack;
  $('#rollbackBar').hidden = !rb;
  if (rb) $('#rollbackText').textContent = `A atualização para a versão ${rb.to} não funcionou, então voltamos para a versão ${rb.from}. Você não perdeu nada. Tentaremos de novo quando houver uma versão corrigida.`;

  const bar = $('#updateBar'), txt = $('#updateText'), prog = $('#updateProgress');
  const now = $('#btnUpdateNow'), later = $('#btnUpdateLater');
  let show = true; prog.hidden = true; now.hidden = true; later.hidden = true;
  if (s.status === 'downloading') {
    txt.textContent = `Baixando a nova versão ${s.version}…`; prog.hidden = false; prog.value = s.percent || 0;
  } else if (s.status === 'preparing') {
    txt.textContent = 'Preparando a atualização…';
  } else if (s.status === 'installing') {
    txt.textContent = 'Instalando a atualização. O programa vai fechar e abrir sozinho em instantes.';
  } else if (s.status === 'ready') {
    if (s.silent) {
      show = s.busy;   // se está em acesso remoto, avisa que vai instalar depois; senão instala sozinho
      txt.textContent = `A versão ${s.version} será instalada automaticamente quando o acesso remoto terminar.`;
    } else if (s.busy) {
      txt.textContent = `A nova versão ${s.version} está pronta e será instalada quando o acesso remoto terminar.`;
    } else if (dismissedFor === s.version) {
      show = false;
    } else {
      txt.textContent = `Nova versão ${s.version} disponível. Atualizar agora ou depois?`;
      now.hidden = false; later.hidden = false;
    }
  } else { show = false; }
  bar.hidden = !show;
  // tela de configurações
  $('#verText').textContent = `REA Desk versão ${s.currentVersion}`;
  if (s.settings) $('#cfgSilent').checked = !!s.settings.silentPatch;
  $('#updMsg').textContent = s.message || (s.status === 'checking' ? 'Procurando atualizações…' : s.lastChecked ? 'Verificado há pouco.' : '');
  $('#btnCheckUpdate').disabled = !s.enabled || ['checking', 'downloading', 'preparing', 'installing'].includes(s.status);
  if (!s.enabled) $('#updMsg').textContent = 'As atualizações automáticas estão desativadas neste modo.';
}
$('#btnUpdateNow').onclick = () => window.rea.update.install();
$('#btnUpdateLater').onclick = () => { dismissedFor = upd && upd.version; $('#updateBar').hidden = true; };
$('#btnRollbackOk').onclick = () => window.rea.update.dismissRollback();
$('#btnCheckUpdate').onclick = () => { dismissedFor = null; $('#updMsg').textContent = 'Procurando atualizações…'; window.rea.update.check(); };
$('#cfgSilent').onchange = (e) => window.rea.update.setSilent(e.target.checked);
window.rea.update.onState((s) => renderUpdate({ ...(upd || {}), ...s }));
window.rea.update.get().then(renderUpdate).catch(() => {});

/* ---------- Configurações e primeiro uso ---------- */
$('#btnSettings').onclick = async () => {
  const info = await window.rea.info();
  $('#cfgName').value = myName; $('#cfgAuto').checked = info.autostart;
  $('#cfgAutoFit').checked = store.get('autoFit', '1') !== '0';
  $('#cfgServer').value = cfg.server; $('#cfgStun').value = cfg.stun;
  $('#ver').textContent = '';
  window.rea.update.get().then(renderUpdate).catch(() => {});
  $('#settings').hidden = false;
};
$('#cfgCancel').onclick = () => ($('#settings').hidden = true);
$('#cfgSave').onclick = async () => {
  const s = $('#cfgServer').value.trim();
  if (s && !/^wss?:\/\//.test(s)) return toast('O endereço do servidor deve começar com ws:// ou wss://. Se não tiver certeza, deixe em branco.');
  myName = $('#cfgName').value.trim() || myName;
  store.set('name', myName);
  const changed = s !== cfg.server;
  cfg.server = s; cfg.stun = $('#cfgStun').value.trim();
  store.set('server', cfg.server); store.set('stun', cfg.stun);
  await window.rea.setAutostart($('#cfgAuto').checked);
  store.set('autoFit', $('#cfgAutoFit').checked ? '1' : '0');
  $('#settings').hidden = true;
  toast('Configurações salvas.');
  if (changed) { if (ws) { ws.onclose = null; ws.close(); } connectWS(); }
};

$('#welOk').onclick = () => {
  myName = $('#welName').value.trim() || myName;
  store.set('name', myName); store.set('welcomed', '1');
  $('#welcome').hidden = true;
};

(async () => {
  $('#myId').textContent = fmtId(myId);
  const info = await window.rea.info();
  defaultStun = info.defaults.stun;
  if (!myName) { myName = info.hostname; store.set('name', myName); }
  if (!store.get('welcomed', '')) { $('#welName').value = myName; $('#welcome').hidden = false; }
  connectWS();
})();
