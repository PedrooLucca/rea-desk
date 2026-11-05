'use strict';
// Atualização automática (electron-updater + GitHub Releases) com backup e rollback.
//
//  Fluxo: verifica em segundo plano -> baixa (só o que mudou, via blockmap) -> faz backup da versão atual ->
//  pergunta (ou instala sozinho, se for correção pequena) -> instala em modo silencioso e reabre.
//  Um "vigia" (src/watchdog.ps1) roda fora do app: se a versão nova não ficar saudável a tempo, restaura o backup.
const { app, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const HOUR = 3600 * 1000;
const CHECK_EVERY = 4 * HOUR;
const FIRST_CHECK_DELAY = 20 * 1000;
const HEALTHY_AFTER = 8 * 1000;          // a versão nova precisa ficar viva este tempo depois de carregar a tela
// tempo máximo (após o app antigo fechar) para a nova versão ficar saudável; REA_WATCHDOG_TIMEOUT_SEC só serve para testes
const WATCHDOG_TIMEOUT_SEC = Number(process.env.REA_WATCHDOG_TIMEOUT_SEC) || 240;

let autoUpdater = null;
let getWindow = () => null;
let isBusy = () => false;                // há acesso remoto em andamento?
let onNeedQuit = () => {};               // avisa o main que o app vai sair para instalar
let installing = false;
let checkTimer = null;
let manualCheck = false;

const state = {
  enabled: false, status: 'idle', currentVersion: app.getVersion(), version: null,
  percent: 0, silent: false, busy: false, message: '', rolledBack: null, lastChecked: null,
};
const settings = { silentPatch: true };

/* ---------- Arquivos em userData (nunca na pasta de instalação) ---------- */
const dir = () => { const d = path.join(app.getPath('userData'), 'updater'); fs.mkdirSync(d, { recursive: true }); return d; };
const file = (n) => path.join(dir(), n);
const readJson = (n, d) => { try { return JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch { return d; } };
const writeJson = (n, v) => { try { fs.writeFileSync(file(n), JSON.stringify(v, null, 2)); } catch {} };
function log(...a) {
  const line = `${new Date().toISOString()} ${a.map((x) => (x instanceof Error ? x.stack || x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`;
  try { fs.appendFileSync(file('updater.log'), line); } catch {}
}

/* ---------- Versões ---------- */
const semver = () => require('semver');
function isSilentUpdate(info) {
  const notes = Array.isArray(info.releaseNotes) ? info.releaseNotes.map((n) => n.note || '').join('\n') : String(info.releaseNotes || '');
  if (/\[perguntar\]/i.test(notes)) return false;            // o desenvolvedor força o aviso
  if (/\[silencioso\]/i.test(notes)) return true;            // o desenvolvedor força a atualização sem perguntar
  const cur = semver().parse(app.getVersion()), nxt = semver().parse(info.version);
  return !!(settings.silentPatch && cur && nxt && cur.major === nxt.major && cur.minor === nxt.minor && nxt.patch > cur.patch);
}
const blocked = () => readJson('blocked.json', []);

/* ---------- Estado para a interface ---------- */
function push() {
  state.busy = isBusy();
  const w = getWindow();
  if (w && !w.isDestroyed()) w.webContents.send('update-state', state);
}
function set(patch) { Object.assign(state, patch); push(); }
let lastPct = -1;

/* ---------- Backup da versão atual (para rollback) ---------- */
const installDir = () => path.dirname(process.execPath);
const backupPath = () => path.join(process.env.LOCALAPPDATA || app.getPath('appData'), app.getName() + '-rollback', 'backup');   // fora do perfil roaming (é grande)
// Atenção: o Electron trata arquivos ".asar" de forma especial no módulo fs (cópia/remoção quebram),
// por isso copiamos e apagamos com ferramentas nativas do Windows (robocopy / rmdir), fora do fs do Electron.
const run = (cmd, args) => new Promise((resolve) => {
  const p = spawn(cmd, args, { stdio: 'ignore', windowsHide: true });
  p.on('error', () => resolve(-1));
  p.on('exit', (code) => resolve(code ?? -1));
});
const removeDir = (p) => run('cmd.exe', ['/c', 'rmdir', '/s', '/q', p]);
async function backupCurrent() {
  const dest = backupPath();
  try {
    await removeDir(dest);
    const code = await run('robocopy.exe', [installDir(), dest, '/MIR', '/R:2', '/W:1', '/NFL', '/NDL', '/NP', '/NJH', '/NJS']);
    if (code < 0 || code >= 8) throw new Error('robocopy terminou com código ' + code);   // 0-7 = sucesso
    log('backup ok', dest);
    return dest;
  } catch (err) { log('backup FALHOU (a atualização segue sem rollback)', err); return null; }
}

/* ---------- Instalação ---------- */
// Inicia o vigia e ESPERA ele confirmar (no log) que está ativo antes de o app fechar para instalar.
// Detalhe importante: o Node coloca processos filhos num "job object" que os mata quando o app fecha. Para o vigia
// sobreviver, ele é iniciado por um cmd.exe DESACOPLADO (detached), que cria o PowerShell fora desse job.
// Só componentes assinados do Windows são usados (cmd, PowerShell, robocopy): nada de .exe novo que o Windows possa bloquear.
async function startWatchdog(backupDir) {
  if (!backupDir) return false;
  const token = String(Date.now());
  try {
    const script = file('watchdog.ps1');
    fs.copyFileSync(path.join(__dirname, 'watchdog.ps1'), script);   // fora do .asar e da pasta de instalação
    fs.rmSync(file('healthy.json'), { force: true });
    fs.rmSync(file('rollback.json'), { force: true });
    writeJson('pending.json', { fromVersion: app.getVersion(), toVersion: state.version, at: new Date().toISOString() });
    const cfgFile = file('watchdog.json');
    fs.writeFileSync(cfgFile, JSON.stringify({
      token, oldPid: process.pid, installDir: installDir(), backupDir, exePath: process.execPath,
      healthFile: file('healthy.json'), rollbackFile: file('rollback.json'), logFile: file('updater.log'),
      fromVersion: app.getVersion(), toVersion: String(state.version), timeoutSec: WATCHDOG_TIMEOUT_SEC,
    }, null, 2), 'utf8');
    const line = `start "" /MIN powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${script}" -ConfigFile "${cfgFile}"`;
    const child = spawn('cmd.exe', ['/d', '/s', '/c', `"${line}"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
    child.on('error', (err) => log('vigia: erro ao iniciar', err));
    child.unref();
    for (let i = 0; i < 100; i++) {                       // até 10 s
      await new Promise((r) => setTimeout(r, 100));
      try { if (fs.readFileSync(file('updater.log'), 'utf8').includes(`iniciado token=${token}`)) { log('vigia de rollback ativo'); return true; } } catch {}
    }
    log('vigia de rollback NÃO confirmou que está ativo; a atualização segue sem ele');
    return false;
  } catch (err) { log('não foi possível iniciar o vigia de rollback', err); return false; }
}let backupDirReady = null;
function installNow() {
  if (installing || state.status !== 'ready') return false;
  installing = true;
  set({ status: 'installing', message: 'Instalando a atualização…' });
  log('instalando', state.version);
  (async () => {
    await startWatchdog(backupDirReady);
    onNeedQuit();
    try { autoUpdater.quitAndInstall(true, true); } catch (err) { log('quitAndInstall falhou', err); installing = false; set({ status: 'ready' }); }
  })();
  return true;
}
// chamado pelo main em before-quit: se há atualização pronta, instala em vez de apenas sair
function handleQuit() { return state.status === 'ready' && !installing && installNow(); }

function maybeAutoInstall() {
  if (state.status === 'ready' && state.silent && !isBusy()) installNow();
}

/* ---------- Saúde da versão nova (depois de uma atualização) ---------- */
let healthScheduled = false;
function markLoaded() {          // chamado pelo main quando a janela terminou de carregar
  if (healthScheduled) return;
  healthScheduled = true;
  markHealthyLater();
}
function markHealthyLater() {
  const pending = readJson('pending.json', null);
  if (!pending || pending.toVersion !== app.getVersion()) return;
  setTimeout(() => {
    writeJson('healthy.json', { version: app.getVersion(), at: new Date().toISOString() });
    fs.rmSync(file('pending.json'), { force: true });
    log('versão nova saudável', app.getVersion());
  }, HEALTHY_AFTER).unref?.();
}
function readRollbackNotice() {
  const rb = readJson('rollback.json', null);
  if (!rb) return;
  const list = blocked(); if (rb.toVersion && !list.includes(rb.toVersion)) { list.push(rb.toVersion); writeJson('blocked.json', list); }
  state.rolledBack = { from: rb.fromVersion, to: rb.toVersion };
  fs.rmSync(file('rollback.json'), { force: true }); fs.rmSync(file('pending.json'), { force: true });
  log('rollback detectado; versão marcada como ruim:', rb.toVersion);
}

/* ---------- Verificação ---------- */
async function check(manual = false) {
  if (!state.enabled || installing || ['checking', 'downloading', 'installing'].includes(state.status)) return;
  if (state.status === 'ready') return;
  manualCheck = manual;
  set({ status: 'checking', message: '' });
  try { await autoUpdater.checkForUpdates(); }
  catch (err) { log('verificação falhou', err); finishCheck(false); }
}
function finishCheck(ok) {
  state.lastChecked = new Date().toISOString();
  if (!ok) set({ status: 'idle', message: manualCheck ? 'Não foi possível procurar atualizações agora. Verifique a internet e tente de novo mais tarde.' : '' });
  manualCheck = false;
}

function wire() {
  autoUpdater.on('update-available', (info) => {
    if (blocked().includes(info.version)) { log('versão ignorada (falhou antes):', info.version); return set({ status: 'idle', version: null, message: manualCheck ? 'Você já está com a versão mais recente disponível.' : '' }); }
    set({ status: 'downloading', version: info.version, percent: 0, silent: isSilentUpdate(info), message: '' });
    log('atualização disponível', info.version, 'silenciosa:', state.silent);
    autoUpdater.downloadUpdate().catch((err) => { log('download falhou', err); set({ status: 'idle', message: manualCheck ? 'Não foi possível baixar a atualização agora. Tentaremos de novo mais tarde.' : '' }); });
  });
  autoUpdater.on('update-not-available', () => {
    state.lastChecked = new Date().toISOString();
    set({ status: 'idle', version: null, message: manualCheck ? 'Você já está com a versão mais recente.' : '' });
    manualCheck = false;
  });
  autoUpdater.on('download-progress', (p) => {
    const pct = Math.round(p.percent || 0);
    if (pct !== lastPct) { lastPct = pct; set({ percent: pct }); }
  });
  autoUpdater.on('update-downloaded', async (info) => {
    log('download concluído', info.version);
    set({ status: 'preparing', percent: 100 });
    backupDirReady = await backupCurrent();
    set({ status: 'ready', version: info.version });
    maybeAutoInstall();
  });
  autoUpdater.on('error', (err) => {
    log('erro do atualizador', err);
    if (state.status === 'installing') return;
    finishCheck(false);
  });
}

/* ---------- API ---------- */
function init({ window, busy, quit }) {
  getWindow = window; isBusy = busy; onNeedQuit = quit;
  Object.assign(settings, readJson('settings.json', {}));
  readRollbackNotice();

  ipcMain.handle('update-get', () => ({ ...state, busy: isBusy(), settings }));
  ipcMain.handle('update-check', () => { check(true); return true; });
  ipcMain.handle('update-install', () => installNow());
  ipcMain.handle('update-dismiss-rollback', () => { set({ rolledBack: null }); return true; });
  ipcMain.handle('update-set-silent', (_e, on) => { settings.silentPatch = !!on; writeJson('settings.json', settings); maybeAutoInstall(); return settings; });

  const dev = !app.isPackaged && !process.env.REA_UPDATER_DEV;
  if (dev) { log('atualizador desativado (modo desenvolvimento)'); return push(); }
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;   // quem instala somos nós (handleQuit), com backup e vigia
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = { info: (m) => log('[info]', m), warn: (m) => log('[warn]', m), error: (m) => log('[error]', m), debug: () => {} };
    if (process.env.REA_UPDATER_DEV) autoUpdater.forceDevUpdateConfig = true;
    wire();
    state.enabled = true;
    push();
    setTimeout(() => check(false), FIRST_CHECK_DELAY).unref?.();
    checkTimer = setInterval(() => { check(false); maybeAutoInstall(); }, CHECK_EVERY); checkTimer.unref?.();
    // se uma atualização silenciosa estava esperando o fim de um acesso remoto
    setInterval(maybeAutoInstall, 20 * 1000).unref?.();
  } catch (err) { log('atualizador indisponível', err); push(); }
}

module.exports = { init, handleQuit, markLoaded, push, notifyBusyChanged: () => { push(); maybeAutoInstall(); }, state };
