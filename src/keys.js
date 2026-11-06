'use strict';
// Mapa de teclas, sem dependências do Windows (testável em Node). KeyboardEvent.code <-> tecla virtual do Windows.

// KeyboardEvent.code -> [virtual key, extended]
const KEYS = {
  Backspace: [0x08], Tab: [0x09], Enter: [0x0d], NumpadEnter: [0x0d, 1], ShiftLeft: [0xa0], ShiftRight: [0xa1],
  ControlLeft: [0xa2], ControlRight: [0xa3, 1], AltLeft: [0xa4], AltRight: [0xa5, 1], Pause: [0x13],
  CapsLock: [0x14], Escape: [0x1b], Space: [0x20], PageUp: [0x21, 1], PageDown: [0x22, 1], End: [0x23, 1],
  Home: [0x24, 1], ArrowLeft: [0x25, 1], ArrowUp: [0x26, 1], ArrowRight: [0x27, 1], ArrowDown: [0x28, 1],
  PrintScreen: [0x2c, 1], Insert: [0x2d, 1], Delete: [0x2e, 1], MetaLeft: [0x5b, 1], MetaRight: [0x5c, 1],
  ContextMenu: [0x5d, 1], NumLock: [0x90, 1], ScrollLock: [0x91],
  NumpadMultiply: [0x6a], NumpadAdd: [0x6b], NumpadSubtract: [0x6d], NumpadDecimal: [0x6e], NumpadDivide: [0x6f, 1],
  Semicolon: [0xba], Equal: [0xbb], Comma: [0xbc], Minus: [0xbd], Period: [0xbe], Slash: [0xbf],
  Backquote: [0xc0], BracketLeft: [0xdb], Backslash: [0xdc], BracketRight: [0xdd], Quote: [0xde],
  IntlBackslash: [0xe2],
};
for (let i = 0; i < 26; i++) KEYS['Key' + String.fromCharCode(65 + i)] = [0x41 + i];
for (let i = 0; i < 10; i++) { KEYS['Digit' + i] = [0x30 + i]; KEYS['Numpad' + i] = [0x60 + i]; }
for (let i = 1; i <= 12; i++) KEYS['F' + i] = [0x6f + i];

// tecla virtual (+ flag "estendida") -> KeyboardEvent.code, o caminho inverso (usado pelo gancho de teclado)
const CODE_BY_VK = new Map();
for (const [code, [vk, ext]] of Object.entries(KEYS)) CODE_BY_VK.set(vk + (ext ? 256 : 0), code);
function codeFromVk(vk, extended) { return CODE_BY_VK.get(vk + (extended ? 256 : 0)) || CODE_BY_VK.get(vk) || null; }

module.exports = { KEYS, codeFromVk };
