'use strict';
// Gancho de teclado do Windows (WH_KEYBOARD_LL) para o computador de QUEM CONTROLA: captura a tecla Windows, Alt+Tab, Ctrl+Esc etc.
// e as manda ao computador controlado, em vez de deixar o Windows local agir. Roda no processo de entrada (src/injector.js).
//
// Segurança:
//  - O gancho só existe enquanto a captura está ligada (o renderer liga só com o foco na imagem do outro computador, "Controlar" ligado).
//  - Só engole teclas se a janela em primeiro plano for deste programa (confere o processo dono da janela).
//  - O renderer precisa renovar o pedido a cada ~1 s; sem isso (janela travou ou fechou) a captura desliga sozinha em 3 s.
//  - Teclas injetadas por este programa (dwExtraInfo) nunca são capturadas de volta.
//  - Qualquer erro dentro do gancho deixa a tecla passar normalmente.
const koffi = require('koffi');
const { createEngine } = require('./syskeys');
const { codeFromVk } = require('./keys');

const INJECT_MARK = 0x52454144;       // igual ao de src/input.js
const WH_KEYBOARD_LL = 13, HC_ACTION = 0;
const WM_KEYDOWN = 0x100, WM_KEYUP = 0x101, WM_SYSKEYDOWN = 0x104, WM_SYSKEYUP = 0x105;
const LLKHF_EXTENDED = 0x01;

const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');
const KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', { vkCode: 'uint32', scanCode: 'uint32', flags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr' });
const POINT = koffi.struct('POINT', { x: 'int32', y: 'int32' });
const MSG = koffi.struct('MSG', { hwnd: 'void *', message: 'uint32', wParam: 'uintptr', lParam: 'intptr', time: 'uint32', pt: POINT });
const HookProc = koffi.proto('intptr __stdcall HookProc(int nCode, uintptr wParam, void *lParam)');
const SetWindowsHookExW = user32.func('void * __stdcall SetWindowsHookExW(int idHook, HookProc *lpfn, void *hmod, uint32 dwThreadId)');
const UnhookWindowsHookEx = user32.func('bool __stdcall UnhookWindowsHookEx(void *hhk)');
const CallNextHookEx = user32.func('intptr __stdcall CallNextHookEx(void *hhk, int nCode, uintptr wParam, void *lParam)');
const PeekMessageW = user32.func('bool __stdcall PeekMessageW(_Out_ MSG *lpMsg, void *hWnd, uint32 wMsgFilterMin, uint32 wMsgFilterMax, uint32 wRemoveMsg)');
const GetForegroundWindow = user32.func('void * __stdcall GetForegroundWindow()');
const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hWnd, _Out_ uint32 *lpdwProcessId)');
const GetAsyncKeyState = user32.func('int16 __stdcall GetAsyncKeyState(int vKey)');
const GetModuleHandleW = kernel32.func('void * __stdcall GetModuleHandleW(const char16_t *name)');

const engine = createEngine(codeFromVk);
let hook = null, cb = null, pumpTimer = null, ownerPid = 0, lastBeat = 0;
let emit = () => {};

function foregroundIsOurs() {
  if (!ownerPid) return false;
  const out = [0];
  GetWindowThreadProcessId(GetForegroundWindow(), out);
  return out[0] === ownerPid;
}

function proc(nCode, wParam, lParam) {
  try {
    if (nCode === HC_ACTION) {
      const up = wParam === WM_KEYUP || wParam === WM_SYSKEYUP;
      const down = wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN;
      if (up || down) {
        const info = koffi.decode(lParam, KBDLLHOOKSTRUCT);
        const r = engine.key({ vk: info.vkCode, ext: !!(info.flags & LLKHF_EXTENDED), up, ours: Number(info.dwExtraInfo) === INJECT_MARK, fg: foregroundIsOurs() });
        if (r.forward) emit({ k: 'syskey', code: r.forward.code, down: r.forward.down });
        if (r.swallow) return 1;                           // o Windows local não recebe esta tecla
      }
    }
  } catch { /* qualquer erro: a tecla passa */ }
  return CallNextHookEx(hook, nCode, wParam, lParam);
}

function pump() {                                           // o gancho só é chamado enquanto o processo recebe mensagens
  const msg = {};
  for (let i = 0; i < 64 && PeekMessageW(msg, null, 0, 0, 1); i++) { /* só processa */ }
  if (hook && Date.now() - lastBeat > 3000) setCapture(false);   // o renderer parou de renovar: solta tudo
}

function install() {
  if (hook) return;
  if (!cb) cb = koffi.register(proc, koffi.pointer(HookProc));
  hook = SetWindowsHookExW(WH_KEYBOARD_LL, cb, GetModuleHandleW(null), 0);
  if (!hook) return;
  // modificadores já apertados agora (ex.: Alt segurado quando o foco chegou na imagem)
  engine.seed([0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5].filter((v) => GetAsyncKeyState(v) & 0x8000));
  pumpTimer = setInterval(pump, 4);
}
function uninstall() {
  if (pumpTimer) { clearInterval(pumpTimer); pumpTimer = null; }
  if (hook) { try { UnhookWindowsHookEx(hook); } catch {} hook = null; }
}

function setCapture(on) {
  if (on) { lastBeat = Date.now(); engine.setCapture(true); install(); return !!hook; }
  for (const u of engine.setCapture(false)) emit({ k: 'syskey', code: u.code, down: false });
  uninstall();
  return false;
}

module.exports = {
  setCapture,
  heartbeat() { lastBeat = Date.now(); },
  setOwnerPid(pid) { ownerPid = Number(pid) || 0; },
  setEmitter(fn) { emit = typeof fn === 'function' ? fn : () => {}; },
  isOn: () => !!hook,
  stop: () => setCapture(false),
};
