'use strict';
// Gerenciador de arquivos ("Transferir arquivos"). Carregado depois de renderer.js, de quem usa as variáveis globais da sessão
// (dc, dsend, role, perms, peerName, clipPeerAllowed, toast*, log, askConfirm).
//
// QUEM CONTROLA abre uma janela dividida meio a meio: à esquerda as pastas DESTE computador, à direita as do computador controlado.
//   Enviar  (metade esquerda): copia o arquivo escolhido à esquerda para a pasta que está aberta à direita.
//   Receber (metade direita):  copia o arquivo escolhido à direita para a pasta que está aberta à esquerda.
// O computador controlado NÃO tem botões: só responde, e só se o dono permitiu "Arquivos e textos" (perms.files) neste acesso.
//
// Mensagens do canal de dados (todas com `id`; o controlador gera os números):
//   controlador -> host  { k:'fsls', id, path }                    lista uma pasta ('' = Início)
//                        { k:'fsget', id, path }                   quer receber um arquivo do host
//                        { k:'fsput', id, dir, name, size }        quer enviar um arquivo ao host (para a pasta `dir`)
//                        { k:'fsend', id }                         terminou de mandar os pedaços do envio
//                        { k:'fscancel', id }                      desistiu
//   host -> controlador  { k:'fsls'|'fsget'|'fsput', id, ok, ... } resposta (ok:false traz err: código curto)
//                        { k:'fsend', id, err? }                   terminou de mandar o arquivo pedido com fsget (err = falhou/cancelou)
//                        { k:'fsdone', id, ok, name, size, err? }  o envio (fsput) foi gravado (ou falhou)
//   pedaços binários (nos dois sentidos): [id de 4 bytes][até 64 KB do arquivo]   (veja fmcore.js)
(function () {
  const C = window.REA_FM, FS = window.rea.files;
  const FRAME = 64 * 1024, REQ_MS = 12000, DONE_MS = 120000, MAX_HOST_XFERS = 8;
  const bad = (code) => Object.assign(new Error(code), { code });
  let nextId = 1;
  const waiting = new Map();        // controlador: id -> { resolve } à espera da resposta do host
  const hostXfers = new Map();      // host: id -> transferência em andamento ({ kind:'get'|'put', ... })
  let xfer = null;                  // controlador: a transferência em andamento (uma por vez)
  let peerFs = false;               // controlador: o outro computador tem o gerenciador de arquivos (versão nova)
  let opened = false, hostUsed = false;

  const dcOpen = () => !!dc && dc.readyState === 'open';
  const $ = (s) => document.querySelector(s);

  // espera o buffer do canal esvaziar um pouco (não empilha o arquivo inteiro na memória)
  function drain() {
    return new Promise((res) => {
      if (!dcOpen() || dc.bufferedAmount <= (4 << 20)) return res();
      const ch = dc;
      const done = () => { clearInterval(iv); ch.onbufferedamountlow = null; res(); };
      const iv = setInterval(() => { if (!dcOpen() || ch.bufferedAmount <= (1 << 20)) done(); }, 200);
      ch.onbufferedamountlow = done;
    });
  }
  function request(msg, id = nextId++) {
    return new Promise((resolve) => {
      if (!dcOpen()) return resolve({ ok: false, err: 'desconectado' });
      const timer = setTimeout(() => { waiting.delete(id); resolve({ ok: false, err: 'sem-resposta' }); }, REQ_MS);
      waiting.set(id, { resolve: (m) => { clearTimeout(timer); resolve(m); } });
      dsend({ ...msg, id });
    });
  }

  /* =================== Computador controlado (só responde) =================== */
  function noteHostUse() {
    if (hostUsed) return;
    hostUsed = true;
    $('#fsNote').hidden = false;
    log(`${who()} abriu o gerenciador de arquivos.`, 'sys');
    toast(`${who()} está vendo as pastas deste computador (gerenciador de arquivos).`, 7000);
    try { window.rea.attention(); } catch {}
  }
  const reply = (m, extra) => dsend({ k: m.k, id: m.id, ...extra });
  const deny = (m, err) => reply(m, { ok: false, err });

  async function hostHandle(m) {
    const id = m.id;
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const isReq = m.k === 'fsls' || m.k === 'fsget' || m.k === 'fsput';
    if (!perms.files) { if (isReq) deny(m, 'nao-permitido'); return; }          // o dono não permitiu "Arquivos e textos"
    if (isReq && hostXfers.size >= MAX_HOST_XFERS && m.k !== 'fsls') return deny(m, 'ocupado');
    if (m.k === 'fsls') {
      noteHostUse();
      const r = typeof m.path === 'string' ? await FS.list(m.path) : { ok: false, err: 'nao-existe' };
      if (!r.ok) return deny(m, r.err);
      const cap = C.capEntries(r.entries);
      return reply(m, { ok: true, path: r.path, parent: r.parent, entries: cap.entries, truncated: !!(r.truncated || cap.truncated) });
    }
    if (m.k === 'fsget') {
      noteHostUse();
      const o = typeof m.path === 'string' ? await FS.readOpen(m.path) : { ok: false, err: 'nao-existe' };
      if (!o.ok) return deny(m, o.err);
      const st = { kind: 'get', rid: o.rid, cancelled: false };
      hostXfers.set(id, st);
      reply(m, { ok: true, name: o.name, size: o.size });
      log(`${who()} está copiando "${o.name}" (${C.fmtSize(o.size)}) deste computador.`, 'sys');
      streamOut(id, st);
      return;
    }
    if (m.k === 'fsput') {
      noteHostUse();
      if (typeof m.dir !== 'string' || typeof m.name !== 'string' || !Number.isSafeInteger(m.size)) return deny(m, 'nome-invalido');
      const o = await FS.writeOpen(m.dir, m.name, m.size);
      if (!o.ok) return deny(m, o.err);
      hostXfers.set(id, { kind: 'put', wid: o.wid, size: m.size, name: o.name, chain: Promise.resolve(), error: null });
      return reply(m, { ok: true, name: o.name });
    }
    if (m.k === 'fsend') {                                                       // o controlador mandou o último pedaço do envio
      const st = hostXfers.get(id);
      if (!st || st.kind !== 'put') return;
      hostXfers.delete(id);
      await st.chain;
      if (st.error) { await FS.writeClose(st.wid, false); return dsend({ k: 'fsdone', id, ok: false, err: st.error }); }
      const r = await FS.writeClose(st.wid, true);                              // confere o tamanho e dá o nome final
      if (r.ok) log(`${who()} enviou "${r.name}" (${C.fmtSize(r.size)}) para este computador.`, 'sys');
      return dsend(r.ok ? { k: 'fsdone', id, ok: true, name: r.name, size: r.size } : { k: 'fsdone', id, ok: false, err: r.err });
    }
    if (m.k === 'fscancel') {
      const st = hostXfers.get(id);
      if (!st) return;
      if (st.kind === 'get') { st.cancelled = true; return; }                    // streamOut percebe, fecha e avisa
      hostXfers.delete(id);
      await st.chain; await FS.writeClose(st.wid, false);                       // apaga o que chegou
    }
  }
  async function streamOut(id, st) {
    try {
      for (;;) {
        if (st.cancelled || !dcOpen()) break;
        const r = await FS.read(st.rid);
        if (!r.ok) throw bad(r.err);
        if (!r.data) break;
        for (let off = 0; off < r.data.length; off += FRAME) {
          await drain();
          if (st.cancelled || !dcOpen()) break;
          dc.send(C.frame(id, r.data.subarray(off, off + FRAME)));
        }
      }
      if (dcOpen()) dsend(st.cancelled ? { k: 'fsend', id, err: 'cancelado' } : { k: 'fsend', id });
    } catch (e) { dsend({ k: 'fsend', id, err: e.code || 'erro' }); }
    finally { FS.readClose(st.rid); hostXfers.delete(id); }
  }
  function hostBinary(f) {                                                        // pedaço de um envio (fsput)
    const st = hostXfers.get(f.id);
    if (!st || st.kind !== 'put' || !perms.files) return;
    st.chain = st.chain.then(async () => {
      if (st.error) return;
      const r = await FS.write(st.wid, f.data);
      if (!r.ok) st.error = r.err;
    });
  }

  /* =================== Quem controla =================== */
  function ctlHandle(m) {
    const id = m.id;
    const x = xfer && xfer.id === id ? xfer : null;
    if (m.k === 'fsget' && m.ok && x && x.dir === 'down') beginDown(x, m);        // síncrono: abre o destino antes do 1º pedaço chegar
    else if (m.k === 'fsend' && x && x.dir === 'down') { endDown(x, m.err); return; }
    else if (m.k === 'fsdone' && x && x.dir === 'up') { x.resolveDone(m); return; }
    const w = waiting.get(id);
    if (w && (m.k === 'fsls' || m.k === 'fsget' || m.k === 'fsput')) { waiting.delete(id); w.resolve(m); }
  }
  function beginDown(x, m) {
    x.size = Number(m.size) || x.size;
    x.chain = FS.writeOpen(x.destDir, String(m.name || x.name), x.size).then((o) => {
      if (!o.ok) { x.error = o.err; dsend({ k: 'fscancel', id: x.id }); } else { x.wid = o.wid; x.finalName = o.name; }
    });
  }
  function ctlBinary(f) {
    const x = xfer;
    if (!x || x.id !== f.id || x.dir !== 'down' || x.cancelled) return;
    x.moved += f.data.length; paint(x);
    x.chain = x.chain.then(async () => {
      if (x.error || x.cancelled || !x.wid) return;
      const r = await FS.write(x.wid, f.data);
      if (!r.ok) { x.error = r.err; dsend({ k: 'fscancel', id: x.id }); }
    });
  }
  async function endDown(x, err) {
    if (x.ended) return; x.ended = true;
    await x.chain;
    const fail = x.cancelled ? 'cancelado' : (x.error || err || (x.wid ? null : 'erro'));
    if (fail) { if (x.wid) await FS.writeClose(x.wid, false); return x.resolveDone({ ok: false, err: fail }); }
    const r = await FS.writeClose(x.wid, true);
    x.resolveDone(r.ok ? { ok: true, name: r.name, size: r.size } : { ok: false, err: r.err });
  }

  const newXfer = (dir, e, destDir) => {
    const x = { id: nextId++, dir, name: e.n, size: e.s, moved: 0, cancelled: false, destDir, chain: Promise.resolve(), wid: null, rid: null, error: null, ended: false };
    x.done = new Promise((res) => { x.resolveDone = res; });
    return x;
  };

  // Enviar: arquivo escolhido à ESQUERDA -> pasta aberta à DIREITA
  async function doSend() {
    const e = P.L.selected();
    if (xfer || !e || e.d || P.R.path === '' || !dcOpen()) return;
    const x = xfer = newXfer('up', e, P.R.path);
    busy(true); status(`Preparando "${e.n}"…`);
    const o = await FS.readOpen(C.childPath(P.L, e));
    if (!o.ok) return finish(x, false, o.err);
    x.rid = o.rid; x.size = o.size;
    const rep = await request({ k: 'fsput', dir: x.destDir, name: e.n, size: o.size }, x.id);
    if (!rep.ok) return finish(x, false, rep.err);
    x.finalName = rep.name;
    try {
      for (;;) {
        if (x.cancelled) break;
        if (!dcOpen()) throw bad('desconectado');
        const r = await FS.read(x.rid);
        if (!r.ok) throw bad(r.err);
        if (!r.data) break;
        for (let off = 0; off < r.data.length; off += FRAME) {
          await drain();
          if (x.cancelled || !dcOpen()) break;
          const part = r.data.subarray(off, off + FRAME);
          dc.send(C.frame(x.id, part)); x.moved += part.length; paint(x);
        }
      }
      if (x.cancelled) return finish(x, false, 'cancelado');
      dsend({ k: 'fsend', id: x.id });
      const d = await Promise.race([x.done, new Promise((r) => setTimeout(() => r({ ok: false, err: 'sem-resposta' }), DONE_MS))]);
      finish(x, !!d.ok, d.err, d);
    } catch (err) { finish(x, false, err.code || 'erro'); }
  }

  // Receber: arquivo escolhido à DIREITA -> pasta aberta à ESQUERDA
  async function doReceive() {
    const e = P.R.selected();
    if (xfer || !e || e.d || P.L.path === '' || !dcOpen()) return;
    const x = xfer = newXfer('down', e, P.L.path);
    busy(true); status(`Pedindo "${e.n}"…`);
    const rep = await request({ k: 'fsget', path: C.childPath(P.R, e) }, x.id);
    if (!rep.ok) return finish(x, false, rep.err);
    paint(x);
    const d = await Promise.race([x.done, new Promise((r) => setTimeout(() => r({ ok: false, err: 'sem-resposta' }), DONE_MS * 5))]);
    finish(x, !!d.ok, d.err, d);
  }

  function cancel() {
    const x = xfer; if (!x || x.cancelled) return;
    x.cancelled = true; dsend({ k: 'fscancel', id: x.id });
    if (x.dir === 'down') endDown(x, 'cancelado');                                  // não espera o outro lado
    status('Cancelando…');
  }
  async function finish(x, ok, err, info) {
    if (x.rid) FS.readClose(x.rid);
    if (xfer === x) xfer = null;
    if (x.silent) return;                                                            // a sessão já terminou (reset)
    busy(false);
    const side = x.dir === 'up' ? P.R : P.L;                                         // onde o arquivo apareceu
    if (ok) {
      const nm = (info && info.name) || x.finalName || x.name;
      status(`Pronto: "${nm}" (${C.fmtSize((info && info.size) || x.size)}) foi ${x.dir === 'up' ? 'enviado para' : 'salvo em'} ${side.path}`, 'ok');
      toastOk(x.dir === 'up' ? 'Arquivo enviado.' : 'Arquivo recebido.');
      await go(side, side.path, nm);
    } else if (err === 'cancelado') status('Transferência cancelada.');
    else { status(C.errText(err), 'err'); toastErr(C.errText(err), 7000); }
    updateUi();
  }

  /* =================== Janela =================== */
  function mkPane(side) {
    const root = $('#fm' + side);
    const p = {
      side, root, list: root.querySelector('.fm-list'), pathEl: root.querySelector('.fm-path'), selEl: root.querySelector('.fm-sel'), act: root.querySelector('.fm-act'),
      path: '', parent: null, entries: [], sel: -1, token: 0, truncated: false, state: 'idle',
      selected() { return this.sel >= 0 ? this.entries[this.sel] || null : null; },
    };
    p.list.addEventListener('click', (ev) => { const r = ev.target.closest('.fm-row[data-i]'); if (r) select(p, Number(r.dataset.i)); });
    p.list.addEventListener('dblclick', (ev) => { const r = ev.target.closest('.fm-row[data-i]'); if (r) openItem(p, Number(r.dataset.i)); });
    p.list.addEventListener('keydown', (ev) => {
      const n = p.entries.length;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); select(p, Math.min(n - 1, p.sel + 1), true); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); select(p, Math.max(0, p.sel - 1), true); }
      else if (ev.key === 'Home') { ev.preventDefault(); select(p, 0, true); }
      else if (ev.key === 'End') { ev.preventDefault(); select(p, n - 1, true); }
      else if (ev.key === 'Enter') { ev.preventDefault(); if (p.sel >= 0) openItem(p, p.sel); }
      else if (ev.key === 'Backspace') { ev.preventDefault(); go(p, p.parent == null ? '' : p.parent); }
    });
    root.querySelector('[data-act="home"]').onclick = () => go(p, '');
    root.querySelector('[data-act="up"]').onclick = () => { if (p.path !== '') go(p, p.parent == null ? '' : p.parent); };
    root.querySelector('[data-act="refresh"]').onclick = () => go(p, p.path);
    p.pathEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); go(p, p.pathEl.value.trim()); p.list.focus(); } });
    p.pathEl.addEventListener('blur', () => { p.pathEl.value = p.path; });
    return p;
  }
  let P = null;                                     // { L, R } criados na primeira abertura (o HTML já existe)

  async function load(p, path) {
    return p.side === 'L' ? FS.list(path) : request({ k: 'fsls', path });
  }
  async function go(p, path, selectName) {
    const tok = ++p.token;
    p.state = 'loading'; paintList(p);
    const r = await load(p, path);
    if (tok !== p.token) return;                                                     // outra navegação passou na frente
    if (!r.ok) {
      p.state = p.entries.length || p.path ? 'ok' : 'error';
      status(C.errText(r.err), 'err'); p.errText = C.errText(r.err);
      paintList(p); updateUi(); return;
    }
    p.path = r.path || ''; p.parent = r.parent == null ? null : r.parent; p.entries = Array.isArray(r.entries) ? r.entries : [];
    p.truncated = !!r.truncated; p.state = 'ok'; p.errText = '';
    p.sel = selectName ? p.entries.findIndex((e) => e.n === selectName && !e.d) : -1;
    p.pathEl.value = p.path;
    paintList(p);
    if (p.sel >= 0) p.list.querySelector('.fm-row[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    updateUi();
  }
  function openItem(p, i) {
    const e = p.entries[i];
    if (e && e.d) go(p, C.childPath(p, e));
  }
  function select(p, i, scroll) {
    if (i < 0 || i >= p.entries.length) return;
    p.sel = i;
    p.list.querySelectorAll('.fm-row[data-i]').forEach((r) => r.setAttribute('aria-selected', String(Number(r.dataset.i) === i)));
    if (scroll) p.list.querySelector('.fm-row[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    updateUi();
  }
  function paintList(p) {
    const l = p.list; l.textContent = '';
    const head = document.createElement('div'); head.className = 'fm-row fm-head-row'; head.setAttribute('aria-hidden', 'true');
    for (const t of ['', 'Nome', 'Tamanho', 'Modificado']) { const s = document.createElement('span'); s.textContent = t; head.append(s); }
    head.children[2].className = 'sz'; head.children[3].className = 'dt';
    l.append(head);
    const note = (text, cls) => { const n = document.createElement('div'); n.className = 'fm-note ' + (cls || ''); n.textContent = text; l.append(n); };
    if (p.state === 'loading') note(p.entries.length ? 'Atualizando…' : 'Carregando…', 'load');
    if (p.state === 'error') note(p.errText || 'Não foi possível abrir.', 'err');
    if (p.state === 'loading' && !p.entries.length) return;
    p.entries.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'fm-row' + (e.d ? ' dir' : ''); row.dataset.i = String(i);
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(i === p.sel));
      const ic = document.createElement('i'); ic.setAttribute('data-lucide', e.p && /^[A-Za-z]:\\$/.test(e.p) ? 'hard-drive' : e.d ? 'folder' : 'file');
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = e.n; nm.title = e.n;
      const sz = document.createElement('span'); sz.className = 'sz'; sz.textContent = e.d ? '' : C.fmtSize(e.s);
      const dt = document.createElement('span'); dt.className = 'dt'; dt.textContent = C.fmtDate(e.t);
      row.append(ic, nm, sz, dt); l.append(row);
    });
    if (!p.entries.length && p.state === 'ok') note('Esta pasta está vazia.');
    if (p.truncated) note('Mostrando só os primeiros itens desta pasta. Digite o caminho de uma subpasta para ver o resto.');
    try { window.REA_UI.icons(l); } catch {}
  }
  // texto embaixo de cada metade e estado dos botões Enviar / Receber
  function updateUi() {
    if (!P) return;
    const live = dcOpen(), busyNow = !!xfer;
    const one = (p, other, verb, dest) => {
      const e = p.selected();
      p.selEl.textContent = '';
      const t = (txt) => { p.selEl.textContent = txt; };
      let can = false;
      if (!e) t(`Escolha um arquivo para ${verb}.`);
      else if (e.d) t(`"${e.n}" é uma pasta: abra-a (duplo clique) e escolha um arquivo.`);
      else if (other.path === '') t(`Abra uma pasta ${dest} para dizer onde salvar.`);
      else { const b = document.createElement('b'); b.textContent = e.n; p.selEl.append(b, ` · ${C.fmtSize(e.s)}`); can = true; }
      p.act.disabled = !(can && live && !busyNow);
      p.act.title = can ? `${verb[0].toUpperCase() + verb.slice(1)} para: ${other.path}` : '';
    };
    one(P.L, P.R, 'enviar', 'no computador controlado (à direita)');
    one(P.R, P.L, 'receber', 'neste computador (à esquerda)');
  }
  function status(text, kind) { const m = $('#fmMsg'); m.textContent = text || ''; m.className = kind || ''; }
  function busy(on) { $('#fmCancel').hidden = !on; $('#fmProg').hidden = !on; if (on) $('#fmProg').value = 0; updateUi(); }
  function paint(x) {
    const eff = x.dir === 'up' ? Math.max(0, x.moved - (dcOpen() ? dc.bufferedAmount : 0)) : x.moved;
    const pct = x.size > 0 ? Math.min(100, Math.floor((eff / x.size) * 100)) : 0;
    $('#fmProg').value = pct;
    status(`${x.dir === 'up' ? 'Enviando' : 'Recebendo'} "${x.name}": ${pct}% (${C.fmtSize(eff)} de ${C.fmtSize(x.size)})`);
  }

  async function closeWindow() {
    if (xfer) {
      if (!(await askConfirm('Cancelar a transferência?', 'O arquivo ainda está sendo transferido. Se fechar agora, ele é cancelado.', 'Cancelar transferência'))) return;
      cancel();
    }
    $('#fm').hidden = true;
  }

  function open() {
    if (role !== 'controller' || !dcOpen()) return;
    if (!clipPeerAllowed) return toastErr('O outro computador não permitiu arquivos e textos neste acesso.', 6000);
    if (!peerFs) return toastErr('O outro computador está com uma versão antiga do REA Desk e não tem o gerenciador de arquivos. Atualize os dois computadores.', 8000);
    if (!P) { P = { L: mkPane('L'), R: mkPane('R') }; $('#fmSend').onclick = doSend; $('#fmRecv').onclick = doReceive; $('#fmCancel').onclick = cancel; $('#fmClose').onclick = closeWindow; }
    $('#fmR .fm-name').textContent = peerName || 'Computador controlado';
    $('#fm').hidden = false;
    if (!opened) { opened = true; status(''); go(P.L, ''); go(P.R, ''); } else updateUi();
    setTimeout(() => P.L.list.focus(), 0);
  }

  function reset() {                                                                 // fim da sessão
    for (const [, w] of waiting) w.resolve({ ok: false, err: 'desconectado' });
    waiting.clear();
    if (xfer) { const x = xfer; x.silent = true; x.cancelled = true; if (x.dir === 'down') endDown(x, 'cancelado'); x.resolveDone({ ok: false, err: 'desconectado' }); xfer = null; }
    hostXfers.clear();
    try { FS.closeAll(); } catch {}                                                  // apaga o que ficou pela metade
    peerFs = false; opened = false; hostUsed = false;
    $('#fm').hidden = true; $('#fsNote').hidden = true; status(''); $('#fmCancel').hidden = true; $('#fmProg').hidden = true;
    if (P) for (const p of [P.L, P.R]) { p.path = ''; p.parent = null; p.entries = []; p.sel = -1; p.state = 'idle'; p.truncated = false; p.token++; p.list.textContent = ''; p.pathEl.value = ''; }
  }

  window.FM = {
    open,
    reset,
    setPeer: (fs) => { peerFs = !!fs; },
    handle: (m) => { try { const r = role === 'host' ? hostHandle(m) : role === 'controller' ? ctlHandle(m) : null; if (r && r.catch) r.catch((e) => console.error('fs', e)); } catch (e) { console.error('fs', e); } },
    onBinary: (buf) => {
      const f = C.unframe(buf);
      if (!f) return;
      if (role === 'host') hostBinary(f); else if (role === 'controller') ctlBinary(f);
    },
    refresh: updateUi,
  };
  $('#btnFile').onclick = open;
})();
