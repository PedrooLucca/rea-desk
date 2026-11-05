'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Canal direto com o processo que injeta mouse/teclado (não passa pelo processo principal).
let inputPort = null;
ipcRenderer.on('input-port', (e) => { inputPort = e.ports[0]; });

contextBridge.exposeInMainWorld('rea', {
  input: (ev) => (inputPort ? inputPort.postMessage(ev) : ipcRenderer.send('input', ev)),
  releaseInput: () => (inputPort ? inputPort.postMessage({ k: 'release' }) : ipcRenderer.send('input-release')),
  readClipboard: () => ipcRenderer.invoke('clip-read'),
  writeClipboard: (t) => ipcRenderer.invoke('clip-write', t),
  saveFile: (name, bytes) => ipcRenderer.invoke('save-file', name, bytes),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  info: () => ipcRenderer.invoke('info'),
  getServer: () => ipcRenderer.invoke('get-server'),
  setAutostart: (on) => ipcRenderer.invoke('set-autostart', on),
  attention: () => ipcRenderer.send('attention'),
  sessionState: (active) => ipcRenderer.send('session-state', active),
  onEndRequest: (cb) => ipcRenderer.on('end-session', () => cb()),
  update: {
    get: () => ipcRenderer.invoke('update-get'),
    check: () => ipcRenderer.invoke('update-check'),
    install: () => ipcRenderer.invoke('update-install'),
    dismissRollback: () => ipcRenderer.invoke('update-dismiss-rollback'),
    setSilent: (on) => ipcRenderer.invoke('update-set-silent', !!on),
    onState: (cb) => ipcRenderer.on('update-state', (_e, s) => cb(s)),
  },
  onCursorRestored: (cb) => ipcRenderer.on('cursor-restored', () => cb()),
  onLostFocus: (cb) => ipcRenderer.on('lost-focus', () => cb()),
  onWindowBack: (cb) => ipcRenderer.on('window-back', () => cb()),
});
