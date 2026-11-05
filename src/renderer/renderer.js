'use strict';
const $ = (s) => document.querySelector(s);
const CHUNK = 16 * 1024;
const MAX_FILE = 200 * 1024 * 1024;

const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
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
      peerId = role = null; $('#btnConnect').disabled = false;
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
      clearTimeout(videoTimer);
      $('#remote').srcObject = e.streams[0];
      $('#waiting').hidden = true;
      $('#remote').focus();
    };
  }
}

async function startHost() {
  preparePC();
  showSession(false);
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
  } catch {
    toast('Não foi possível compartilhar a tela deste computador. Feche o programa, abra de novo e tente outra vez.', 8000);
    return endSession(true);
  }
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
  dc.onopen = () => log('Conexão segura estabelecida.', 'sys');
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
    case 'cursor': // o controlador pediu para mostrar/esconder o ponteiro do mouse deste computador
      if (role === 'host' && perms.control) setHostCursor(!!m.show);
      break;
    case 'cursorstate': // o computador controlado informa se o ponteiro está visível
      if (role === 'controller') $('#curToggle').checked = !!m.show;
      break;
    case 'chat':
      log(`${who()}: ${String(m.text).slice(0, 2000)}`); break;
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
  $('#btnFull').hidden = host;
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
  $('#remote').srcObject = null;
  pc = dc = localStream = null; peerId = role = null; peerName = ''; rx = null;
  perms = { control: false, files: false };
  pendingIce = []; hasRemote = false;
  $('#session').hidden = true; $('#home').hidden = false; $('#log').textContent = '';
  $('#btnConnect').disabled = false;
  window.rea.sessionState(false);
  if (document.fullscreenElement) document.exitFullscreen();
}

/* ---------- Entrada do controlador (mouse/teclado) ---------- */
const video = $('#remote');
function norm(e) {
  const r = video.getBoundingClientRect();
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const s = Math.min(r.width / vw, r.height / vh);
  const w = vw * s, h = vh * s;
  const x = (e.clientX - r.left - (r.width - w) / 2) / w;
  const y = (e.clientY - r.top - (r.height - h) / 2) / h;
  return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
}
const controlling = () => role === 'controller' && $('#ctlToggle').checked;
let lastMove = 0;
video.addEventListener('mousemove', (e) => {
  if (!controlling()) return;
  const now = performance.now(); if (now - lastMove < 16) return; lastMove = now;
  const p = norm(e); if (p) dsend({ k: 'mouse', type: 'move', ...p });
});
for (const type of ['down', 'up']) {
  video.addEventListener('mouse' + type, (e) => {
    if (!controlling()) return;
    video.focus(); e.preventDefault();
    const p = norm(e); if (p) dsend({ k: 'mouse', type, button: e.button, ...p });
  });
}
video.addEventListener('wheel', (e) => {
  if (!controlling()) return; e.preventDefault();
  const p = norm(e); if (p) dsend({ k: 'mouse', type: 'wheel', dy: e.deltaMode === 0 ? e.deltaY : e.deltaY * 40, ...p });
}, { passive: false });
video.addEventListener('contextmenu', (e) => e.preventDefault());
for (const down of [true, false]) {
  video.addEventListener(down ? 'keydown' : 'keyup', (e) => {
    if (!controlling()) return;
    e.preventDefault();
    dsend({ k: 'key', down, code: e.code });
  });
}
// Ao minimizar / trocar de janela, nada deve ficar pressionado no computador remoto.
const releaseRemote = () => { if (role === 'controller') dsend({ k: 'release' }); };
window.addEventListener('blur', releaseRemote);
video.addEventListener('blur', releaseRemote);

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
// Controlador: pede imagem nova ao outro computador e recoloca o vídeo na tela.
let lastRefresh = 0;
function requestRefresh(force = false) {
  if (role !== 'controller' || !video.srcObject) return;
  const now = Date.now();
  if (!force && now - lastRefresh < 8000) return;
  lastRefresh = now;
  const s = video.srcObject;
  video.srcObject = null; video.srcObject = s;
  video.play().catch(() => {});
  dsend({ k: 'refresh' });
}
// Vigia: se o usuário está mexendo o mouse sobre a imagem e ela não muda há 4 s, pede imagem nova.
let wdFrames = -1, wdChangedAt = Date.now(), lastPointer = 0;
video.addEventListener('mousemove', () => { lastPointer = Date.now(); });
setInterval(async () => {
  if (role !== 'controller' || !pc || pc.connectionState !== 'connected' || !video.srcObject) { wdFrames = -1; return; }
  let n = 0;
  try { (await pc.getStats()).forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'video') n = r.framesDecoded; }); } catch { return; }
  const now = Date.now();
  if (n !== wdFrames) { wdFrames = n; wdChangedAt = now; return; }
  if (now - wdChangedAt > 4000 && now - lastPointer < 3000) { wdChangedAt = now; requestRefresh(); }
}, 1500);

// Ao voltar para a janela (restaurar/minimizar), garante que o vídeo continue rodando e o teclado volte ao controle.
function wake() {
  if (role !== 'controller' || !video.srcObject) return;
  video.play().catch(() => {});
  if ($('#ctlToggle').checked) video.focus();
  requestRefresh();
}
window.rea.onLostFocus(releaseRemote);
window.rea.onWindowBack(() => setTimeout(wake, 100));
document.addEventListener('visibilitychange', wake);
window.addEventListener('focus', wake);
window.addEventListener('resize', wake);
video.addEventListener('pause', () => { if (role === 'controller' && video.srcObject) video.play().catch(() => {}); });

/* ---------- Botões ---------- */
$('#btnConnect').onclick = () => {
  const id = digits($('#remoteId').value);
  if (id.length !== 9) return homeMsg('Digite os 9 números do código que a outra pessoa informou.');
  if (id === myId) return homeMsg('Esse é o código deste computador. Digite o código da outra pessoa.');
  if (!ws || ws.readyState !== 1) return homeMsg('Ainda estamos conectando. Aguarde alguns segundos e tente de novo.');
  if (peerId) return;
  peerId = id; role = 'controller'; peerName = '';
  $('#btnConnect').disabled = true;
  homeMsg('Pedido enviado. Aguardando a outra pessoa permitir o acesso…', true);
  send({ t: 'call', to: id, name: myName });
  callTimer = setTimeout(() => {
    if (peerId === id && role === 'controller' && $('#session').hidden) {
      send({ t: 'bye', to: id });
      homeMsg('A pessoa não respondeu. Peça para ela olhar a tela do computador e tente de novo.');
      reset();
    }
  }, 60000);
};
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
$('#btnRefresh').onclick = () => { requestRefresh(true); toast('Atualizando a imagem…', 2000); };
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
