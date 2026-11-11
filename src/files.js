'use strict';
// Acesso a arquivos para o gerenciador de arquivos (janela "Transferir arquivos"). Roda no processo principal: a janela (sandbox)
// só fala com este módulo por IPC. Os DOIS computadores usam o mesmo código: o que controla lê e grava no próprio disco, e o
// controlado faz o mesmo quando o outro pede pelo canal de dados (e SÓ se o dono permitiu "Arquivos e textos"; essa conferência
// fica em src/renderer/filemgr.js).
//
// Erros: sempre um código curto em `error.code` (ex.: 'sem-acesso'); a interface os traduz (src/renderer/fmcore.js, errText).
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');

const MAX_ENTRIES = 1500;                 // itens por pasta
const MAX_BYTES = 4 * 1024 ** 3;          // maior arquivo transferido (4 GB)
const BLOCK = 256 * 1024;                 // tamanho de cada leitura do disco
const PART = '.rea-part';                 // sufixo do arquivo temporário enquanto chega

const fail = (code) => Object.assign(new Error(code), { code });
const KNOWN = new Set(['nao-existe', 'sem-acesso', 'ocupado', 'sem-espaco', 'pasta-invalida', 'nao-e-arquivo', 'tamanho', 'incompleto', 'invalido', 'nome-invalido']);
function codeOf(e) {
  const c = e && e.code;
  if (KNOWN.has(c)) return c;
  if (c === 'ENOENT' || c === 'ENOTDIR') return 'nao-existe';
  if (c === 'EACCES' || c === 'EPERM') return 'sem-acesso';
  if (c === 'EBUSY' || c === 'ETXTBSY' || c === 'EMFILE') return 'ocupado';
  if (c === 'ENOSPC' || c === 'EDQUOT') return 'sem-espaco';
  if (c === 'EISDIR') return 'nao-e-arquivo';
  return 'erro';
}

// Pastas conhecidas (o processo principal passa as do usuário; sem elas, usa as pastas padrão do perfil).
let known = null;
function configure(p) { known = p || null; }
function knownFolders() {
  const home = os.homedir();
  const k = known || {};
  return [
    ['Área de Trabalho', k.desktop || path.join(home, 'Desktop')],
    ['Documentos', k.documents || path.join(home, 'Documents')],
    ['Downloads', k.downloads || path.join(home, 'Downloads')],
    ['Imagens', k.pictures || path.join(home, 'Pictures')],
    ['Pasta do usuário', home],
  ];
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(false), ms))]);

// "Início": pastas conhecidas e discos.
async function places() {
  const out = [];
  await Promise.all(knownFolders().map(async ([n, p], i) => {
    try { if ((await fsp.stat(p)).isDirectory()) out[i] = { n, p, d: true }; } catch {}
  }));
  const folders = out.filter(Boolean);
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZAB'.split('');           // C: primeiro; A: e B: por último (disquete)
  const drives = await Promise.all(letters.map(async (L) => {
    const root = L + ':\\';
    const ok = await withTimeout(fsp.access(root).then(() => true, () => false), 800);   // unidade de rede parada não trava a lista
    return ok ? { n: `Disco ${L}:`, p: root, d: true } : null;
  }));
  return [...folders, ...drives.filter(Boolean)];
}

const resolvePath = (p) => {
  if (typeof p !== 'string' || !p || p.includes('\0')) throw fail('nao-existe');
  const s = /^[A-Za-z]:$/.test(p) ? p + '\\' : p;                    // "C:" sozinho significaria a pasta atual do disco C
  return path.resolve(s);
};

// Conteúdo de uma pasta. '' = Início. Pastas primeiro, depois por nome. `t` = última alteração (ms), `s` = tamanho.
async function list(p) {
  if (p === '' || p == null) return { path: '', parent: null, entries: await places(), truncated: false };
  const abs = resolvePath(p);
  const st = await fsp.stat(abs);
  if (!st.isDirectory()) throw fail('pasta-invalida');
  const dirents = await fsp.readdir(abs, { withFileTypes: true });
  const entries = [];
  for (let i = 0; i < dirents.length; i += 48) {
    const part = await Promise.all(dirents.slice(i, i + 48).map(async (d) => {
      const item = { n: d.name, d: d.isDirectory(), s: 0, t: 0 };
      try {
        const s = await fsp.stat(path.join(abs, d.name));         // segue atalhos (links) para saber se é pasta
        item.d = s.isDirectory(); item.s = item.d ? 0 : s.size; item.t = Math.round(s.mtimeMs);
      } catch {}
      return item;
    }));
    entries.push(...part);
  }
  entries.sort((a, b) => (a.d === b.d ? a.n.localeCompare(b.n, 'pt-BR', { sensitivity: 'base', numeric: true }) : a.d ? -1 : 1));
  const parent = path.dirname(abs) === abs ? '' : path.dirname(abs);   // raiz de um disco: o "pai" é o Início
  return { path: abs, parent, entries: entries.slice(0, MAX_ENTRIES), truncated: entries.length > MAX_ENTRIES };
}

/* ---------- Leitura (enviar um arquivo) ---------- */
const reads = new Map(); const writes = new Map(); let nextId = 1;

async function readOpen(p) {
  const abs = resolvePath(p);
  const fh = await fsp.open(abs, 'r');
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw fail('nao-e-arquivo');
    if (st.size > MAX_BYTES) throw fail('tamanho');
    const rid = nextId++;
    reads.set(rid, { fh, pos: 0, size: st.size });
    return { rid, size: st.size, name: path.basename(abs) };
  } catch (e) { await fh.close().catch(() => {}); throw e; }
}
// Próximo bloco (até 256 KB); null quando acabou.
async function read(rid) {
  const r = reads.get(rid); if (!r) throw fail('invalido');
  const buf = Buffer.allocUnsafe(BLOCK);
  const { bytesRead } = await r.fh.read(buf, 0, BLOCK, r.pos);
  r.pos += bytesRead;
  if (!bytesRead) return null;
  return bytesRead === BLOCK ? buf : Buffer.from(buf.subarray(0, bytesRead));   // cópia: o IPC envia o buffer inteiro, não só a fatia
}
async function readClose(rid) { const r = reads.get(rid); reads.delete(rid); if (r) await r.fh.close().catch(() => {}); return {}; }

/* ---------- Gravação (receber um arquivo) ---------- */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
function safeName(name) {
  let n = path.basename(String(name == null ? '' : name).replace(/\\/g, '/')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 200);
  if (!n) n = 'arquivo';
  if (RESERVED.test(n)) n = '_' + n;
  return n;
}
const exists = (p) => fsp.access(p).then(() => true, () => false);
async function uniqueName(dir, name) {                                  // nunca sobrescreve: "foto.jpg" -> "foto (1).jpg"
  const ext = path.extname(name), base = path.basename(name, ext);
  let n = name;
  for (let i = 1; (await exists(path.join(dir, n))) || (await exists(path.join(dir, n + PART))); i++) n = `${base} (${i})${ext}`;
  return n;
}

async function writeOpen(dir, name, size) {
  if (!Number.isSafeInteger(size) || size < 0) throw fail('tamanho');
  if (size > MAX_BYTES) throw fail('tamanho');
  const abs = resolvePath(dir);
  if (!(await fsp.stat(abs)).isDirectory()) throw fail('pasta-invalida');
  const final = await uniqueName(abs, safeName(name));
  const tmp = path.join(abs, final + PART);
  const fh = await fsp.open(tmp, 'wx');                                 // 'wx': falha se já existir (nunca sobrescreve)
  const wid = nextId++;
  writes.set(wid, { fh, tmp, dir: abs, name: final, size, got: 0 });
  return { wid, name: final, path: path.join(abs, final) };
}
async function write(wid, bytes) {
  const w = writes.get(wid); if (!w) throw fail('invalido');
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (w.got + b.length > w.size) throw fail('tamanho');                 // mais do que o combinado
  await w.fh.write(b, 0, b.length);
  w.got += b.length;
}
// commit = true: confere o tamanho e dá o nome final; false: apaga o que chegou até agora.
async function writeClose(wid, commit) {
  const w = writes.get(wid); if (!w) throw fail('invalido');
  writes.delete(wid);
  await w.fh.close().catch(() => {});
  if (!commit) { await fsp.unlink(w.tmp).catch(() => {}); return {}; }
  if (w.got !== w.size) { await fsp.unlink(w.tmp).catch(() => {}); throw fail('incompleto'); }
  let final = w.name;
  if (await exists(path.join(w.dir, final))) final = await uniqueName(w.dir, final);   // alguém criou o mesmo nome enquanto chegava
  await fsp.rename(w.tmp, path.join(w.dir, final));
  return { name: final, size: w.size, path: path.join(w.dir, final) };
}

// Fim da sessão ou do programa: fecha tudo e apaga o que ficou pela metade.
async function closeAll() {
  for (const [id, r] of reads) { reads.delete(id); await r.fh.close().catch(() => {}); }
  for (const [id, w] of writes) { writes.delete(id); await w.fh.close().catch(() => {}); await fsp.unlink(w.tmp).catch(() => {}); }
  return {};
}

module.exports = { configure, places, list, readOpen, read, readClose, writeOpen, write, writeClose, closeAll, safeName, codeOf, MAX_ENTRIES, MAX_BYTES, BLOCK, PART };
