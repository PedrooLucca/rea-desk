'use strict';
const {
  app, BrowserWindow, ipcMain, session, desktopCapturer, clipboard, shell, Tray, Menu, nativeImage, powerSaveBlocker,
  utilityProcess, MessageChannelMain,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const input = require('./input');
const net = require('./net');
const updater = require('./updater');
const defaults = require('../config/defaults.json');

// Janela minimizada/coberta não pode reduzir a prioridade do vídeo nem das conexões:
// sem isto o Chromium/Windows podem "congelar" a sessão quando o programa é minimizado.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let win, tray, quitting = false, hintShown = false;
let sessionActive = false;
let blockerId = null;
const startHidden = process.argv.includes('--hidden');
const iconPath = path.join(__dirname, '..', 'build', 'icon.png');

// Arquivo-marca: existe enquanto o ponteiro do mouse está oculto. Se o programa fechar de forma inesperada,
// o próximo início vê a marca e restaura os ponteiros. (Herdado pelo processo de injeção.)
process.env.REA_CURSOR_FLAG = path.join(app.getPath('userData'), 'cursor-hidden.flag');
const restoreCursorSafely = () => { try { input.restoreCursors(); } catch {} };
process.on('uncaughtException', (err) => { restoreCursorSafely(); console.error(err); });

// Só uma janela do programa por vez; abrir de novo traz a janela existente.
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => showWindow());

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// Injeção de mouse/teclado em processo separado (veja src/injector.js).
let injector = null;
function startInjector() {
  try {
    injector = utilityProcess.fork(path.join(__dirname, 'injector.js'), [], { serviceName: 'REA Desk entrada' });
    const me = injector;
    me.on('exit', () => { restoreCursorSafely(); if (injector === me) { injector = null; if (!quitting) setTimeout(() => { startInjector(); wireInputPort(); }, 500); } });
  } catch (err) { console.error('injector:', err.message); injector = null; }
}
function wireInputPort() {
  if (!injector || !win || win.isDestroyed()) return;
  const { port1, port2 } = new MessageChannelMain();
  injector.postMessage({}, [port1]);
  win.webContents.postMessage('input-port', null, [port2]);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 720, minWidth: 820, minHeight: 560,
    backgroundColor: '#14161a', title: 'REA Desk', show: !startHidden,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      backgroundThrottling: false, // continua transmitindo mesmo minimizado
    },
  });
  win.setMenuBarVisibility(false);
  // Avisos do próprio Windows (mais confiáveis que os eventos da página): minimizou, escondeu ou perdeu o foco.
  for (const ev of ['minimize', 'hide', 'blur']) win.on(ev, () => win.webContents.send('lost-focus'));
  win.on('restore', () => win.webContents.send('window-back'));
  win.on('show', () => win.webContents.send('window-back'));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('did-finish-load', () => { wireInputPort(); updater.markLoaded(); updater.push(); });
  // Fechar a janela só esconde: o programa continua pronto para receber pedidos.
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!hintShown && tray) {
      hintShown = true;
      tray.displayBalloon?.({
        title: 'REA Desk continua ativo',
        content: 'Para receber pedidos de acesso, deixe o programa aberto. Clique no ícone aqui embaixo para abrir.',
      });
    }
  });
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir REA Desk', click: showWindow },
    { label: 'Encerrar acesso remoto agora', enabled: sessionActive, click: () => win?.webContents.send('end-session') },
    { label: 'Mostrar o ponteiro do mouse (se estiver oculto)', click: () => { restoreCursorSafely(); win?.webContents.send('cursor-restored'); } },
    { type: 'separator' },
    { label: 'Sair do programa', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.setToolTip(sessionActive ? 'REA Desk – acesso remoto em andamento' : 'REA Desk');
}

function createTray() {
  let img = nativeImage.createFromPath(iconPath);
  if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.on('click', showWindow);
  updateTray();
}

app.whenReady().then(() => {
  // getDisplayMedia sem seletor: compartilha a tela principal (a pessoa já aceitou o pedido na tela).
  session.defaultSession.setDisplayMediaRequestHandler(
    (_req, cb) => {
      desktopCapturer.getSources({ types: ['screen'] })
        .then((s) => cb(s[0] ? { video: s[0] } : {}))
        .catch(() => cb({}));
    },
    { useSystemPicker: false },
  );
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'display-capture' || perm === 'media'));

  ipcMain.on('input', (_e, ev) => { try { input.handle(ev); } catch (err) { console.error('input:', err.message); } });
  ipcMain.on('input-release', () => { try { input.releaseAll(); } catch {} });
  ipcMain.handle('clip-read', async () => String((await clipboard.readText()) ?? '').slice(0, 1_000_000));
  ipcMain.handle('clip-write', async (_e, text) => { await clipboard.writeText(String(text).slice(0, 1_000_000)); return true; });
  ipcMain.handle('save-file', (_e, name, bytes) => {
    const dir = path.join(app.getPath('downloads'), 'REA-Desk-Recebidos');
    fs.mkdirSync(dir, { recursive: true });
    const safe = path.basename(String(name)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'arquivo';
    const ext = path.extname(safe);
    const base = path.basename(safe, ext);
    let dest = path.join(dir, safe);
    for (let i = 1; fs.existsSync(dest); i++) dest = path.join(dir, `${base} (${i})${ext}`);
    fs.writeFileSync(dest, Buffer.from(bytes));
    return dest;
  });
  ipcMain.handle('reveal', (_e, p) => { shell.showItemInFolder(String(p)); });

  ipcMain.handle('info', () => ({
    hostname: os.hostname(), version: app.getVersion(), defaults: { stun: defaults.stun },
    autostart: app.getLoginItemSettings().openAtLogin,
  }));
  ipcMain.handle('get-server', () => net.resolveServer(defaults));
  ipcMain.handle('set-autostart', (_e, on) => {
    app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.on('attention', () => {
    showWindow();
    win?.flashFrame(true);
  });
  ipcMain.on('session-state', (_e, active) => {
    sessionActive = !!active;
    updateTray();
    updater.notifyBusyChanged();
    // Durante o acesso remoto o Windows não pode suspender o programa nem o computador.
    if (sessionActive && blockerId === null) blockerId = powerSaveBlocker.start('prevent-app-suspension');
    if (!sessionActive && blockerId !== null) { powerSaveBlocker.stop(blockerId); blockerId = null; }
  });

  if (fs.existsSync(process.env.REA_CURSOR_FLAG)) restoreCursorSafely(); // o programa anterior fechou com o mouse oculto
  startInjector();
  createWindow();
  createTray();
  updater.init({ window: () => win, busy: () => sessionActive, quit: () => { quitting = true; } });
  app.on('activate', () => showWindow());
});

app.on('before-quit', (e) => {
  // Se há atualização pronta, "Sair" instala a atualização (com backup e vigia) em vez de só fechar.
  if (updater.handleQuit()) { e.preventDefault(); return; }
  quitting = true;
  try { injector?.postMessage({ k: 'release' }); } catch {}
  try { input.releaseAll(); } catch {}
  restoreCursorSafely();
  net.stop();
  setTimeout(() => { try { injector?.kill(); } catch {} }, 300);
});
app.on('window-all-closed', () => { if (quitting) app.quit(); });
