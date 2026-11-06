'use strict';
// Injeção de mouse/teclado no Windows via user32!SendInput (koffi).
const koffi = require('koffi');

const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
  dx: 'int32', dy: 'int32', mouseData: 'uint32', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr',
});
const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
  wVk: 'uint16', wScan: 'uint16', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr',
});
const INPUT_U = koffi.union('INPUT_U', { mi: MOUSEINPUT, ki: KEYBDINPUT });
const INPUT = koffi.struct('INPUT', { type: 'uint32', u: INPUT_U });

const user32 = koffi.load('user32.dll');
const SendInput = user32.func('uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int cbSize)');

const M = {
  MOVE: 0x0001, LDOWN: 0x0002, LUP: 0x0004, RDOWN: 0x0008, RUP: 0x0010,
  MDOWN: 0x0020, MUP: 0x0040, WHEEL: 0x0800, ABSOLUTE: 0x8000,
};
const K = { EXTENDED: 0x0001, KEYUP: 0x0002 };
// Marca nas teclas que ESTE programa injeta (dwExtraInfo), para o gancho de teclado (src/keyhook.js) não as capturar de volta.
const INJECT_MARK = 0x52454144;

function sendMouse(flags, x = 0, y = 0, data = 0) {
  SendInput(1, [{ type: 0, u: { mi: { dx: x, dy: y, mouseData: data >>> 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } }], koffi.sizeof(INPUT));
}
function sendKey(vk, up, extended) {
  const dwFlags = (up ? K.KEYUP : 0) | (extended ? K.EXTENDED : 0);
  SendInput(1, [{ type: 1, u: { ki: { wVk: vk, wScan: 0, dwFlags, time: 0, dwExtraInfo: INJECT_MARK } } }], koffi.sizeof(INPUT));
}

const { KEYS } = require('./keys');   // KeyboardEvent.code -> [virtual key, extended]

/* ---------- Ocultar o ponteiro do mouse (também some na captura de tela) ----------
   O cursor vai embutido na imagem capturada e o Chromium não permite desligá-lo, então trocamos os ponteiros do
   sistema por um transparente. Restaurar = recarregar os ponteiros configurados pelo usuário (SPI_SETCURSORS). */
const CreateCursor = user32.func('void * __stdcall CreateCursor(void *hInst, int xHot, int yHot, int w, int h, const void *andPlane, const void *xorPlane)');
const SetSystemCursor = user32.func('bool __stdcall SetSystemCursor(void *hcur, uint32 id)');
const SystemParametersInfoW = user32.func('bool __stdcall SystemParametersInfoW(uint32 action, uint32 param, void *pv, uint32 winIni)');
const CURSOR_IDS = [32512, 32513, 32514, 32515, 32516, 32642, 32643, 32644, 32645, 32646, 32648, 32649, 32650, 32651];
let cursorHidden = false;
const flagFile = () => process.env.REA_CURSOR_FLAG || '';

function restoreCursors() {
  SystemParametersInfoW(0x0057, 0, null, 0); // SPI_SETCURSORS
  cursorHidden = false;
  try { if (flagFile()) require('node:fs').unlinkSync(flagFile()); } catch {}
}
function hideCursor(hide) {
  if (!hide) return restoreCursors();
  if (cursorHidden) return;
  // marca no disco ANTES de ocultar: se o programa fechar de forma inesperada, o próximo início restaura os ponteiros
  try { if (flagFile()) require('node:fs').writeFileSync(flagFile(), '1'); } catch {}
  const andPlane = Buffer.alloc(128, 0xff); // 32x32 monocromático: AND=1, XOR=0 => transparente
  const xorPlane = Buffer.alloc(128, 0x00);
  for (const id of CURSOR_IDS) {
    const h = CreateCursor(null, 0, 0, 32, 32, andPlane, xorPlane);
    if (h) SetSystemCursor(h, id);
  }
  cursorHidden = true;
}

// Topologia dos monitores (enviada pelo processo principal). Sem ela, vale o comportamento antigo (só o monitor principal).
const monitors = require('./monitors');
const VIRTUALDESK = 0x4000;
let topology = null;

const BUTTONS = [[M.LDOWN, M.LUP], [M.MDOWN, M.MUP], [M.RDOWN, M.RUP]]; // button 0,1,2 do DOM
const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));
const pressedKeys = new Set();
const pressedButtons = new Set();

function handle(ev) {
  if (!ev || typeof ev !== 'object') return;
  if (ev.k === 'release') return releaseAll();
  if (ev.k === 'cursor') return hideCursor(!ev.show);
  if (ev.k === 'topology') { topology = Array.isArray(ev.monitors) && ev.monitors.length ? { monitors: ev.monitors, selected: ev.selected } : null; return; }
  if (ev.k === 'mouse') {
    let x, y, pos;
    if (ev.type !== 'wheel') {
      if (topology) {                                   // vários monitores: mapeia para a área de trabalho virtual
        const a = monitors.mapMouse(topology, ev);
        if (!a) return;                                 // o monitor que o controlador via não existe mais: descarta (não clica no lugar errado)
        x = a.x; y = a.y; pos = M.MOVE | M.ABSOLUTE | VIRTUALDESK;
      } else {                                          // sem topologia: comportamento antigo (monitor principal)
        x = Math.round(clamp01(ev.x) * 65535); y = Math.round(clamp01(ev.y) * 65535); pos = M.MOVE | M.ABSOLUTE;
      }
    }
    if (ev.type === 'move') return sendMouse(pos, x, y);
    if (ev.type === 'down' || ev.type === 'up') {
      const pair = BUTTONS[ev.button];
      if (!pair) return;
      sendMouse(pos, x, y);
      if (ev.type === 'down') { pressedButtons.add(ev.button); return sendMouse(pair[0]); }
      pressedButtons.delete(ev.button);
      return sendMouse(pair[1]);
    }
    if (ev.type === 'wheel') {
      const delta = Math.max(-1200, Math.min(1200, Math.round(-(Number(ev.dy) || 0)))); // 120 = um "clique"
      return sendMouse(M.WHEEL, 0, 0, delta);
    }
  } else if (ev.k === 'key') {
    const def = KEYS[ev.code];
    if (!def) return;
    if (ev.down) pressedKeys.add(ev.code); else pressedKeys.delete(ev.code);
    sendKey(def[0], !ev.down, !!def[1]);
  }
}

// Solta teclas/botões presos (ex.: conexão caiu com Ctrl pressionado).
function releaseAll() {
  for (const code of pressedKeys) sendKey(KEYS[code][0], true, !!KEYS[code][1]);
  for (const b of pressedButtons) sendMouse(BUTTONS[b][1]);
  pressedKeys.clear();
  pressedButtons.clear();
}

module.exports = { handle, releaseAll, restoreCursors, INJECT_MARK };
