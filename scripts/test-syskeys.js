'use strict';
// Regras da captura de teclas do Windows (src/syskeys.js) e do mapa de teclas (src/keys.js). Sem Windows nem Electron.
const assert = require('node:assert');
const { createEngine, VK } = require('../src/syskeys');
const { codeFromVk, KEYS } = require('../src/keys');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('OK   ' + name); };
const on = () => { const e = createEngine(codeFromVk); e.setCapture(true); return e; };
const down = (e, vk, o = {}) => e.key({ vk, ext: false, up: false, ours: false, fg: true, ...o });
const up = (e, vk, o = {}) => e.key({ vk, ext: false, up: true, ours: false, fg: true, ...o });
const S = (r, code, d) => { assert.strictEqual(r.swallow, true); assert.deepStrictEqual(r.forward, { code, down: d }); };
const P = (r) => { assert.strictEqual(r.swallow, false); assert.strictEqual(r.forward, null); };

t('mapa de teclas: caminho inverso (vk -> code)', () => {
  assert.strictEqual(codeFromVk(0x5b, true), 'MetaLeft'); assert.strictEqual(codeFromVk(0x5c, true), 'MetaRight');
  assert.strictEqual(codeFromVk(0x09, false), 'Tab'); assert.strictEqual(codeFromVk(0x1b, false), 'Escape');
  assert.strictEqual(codeFromVk(0x0d, false), 'Enter'); assert.strictEqual(codeFromVk(0x0d, true), 'NumpadEnter');
  assert.strictEqual(codeFromVk(0x44, false), 'KeyD'); assert.strictEqual(codeFromVk(0x73, false), 'F4');
  assert.strictEqual(codeFromVk(0xe9, false), null);
  for (const [code, [vk, ext]] of Object.entries(KEYS)) assert.strictEqual(codeFromVk(vk, !!ext), code, code);
});
t('desligado: nada é capturado (nem a tecla Windows)', () => {
  const e = createEngine(codeFromVk);
  P(down(e, VK.LWIN, { ext: true })); P(up(e, VK.LWIN, { ext: true }));
  P(down(e, VK.LALT)); P(down(e, VK.TAB)); P(up(e, VK.TAB)); P(up(e, VK.LALT));
});
t('tecla Windows (esquerda e direita): captura e envia apertar e soltar', () => {
  const e = on();
  S(down(e, VK.LWIN, { ext: true }), 'MetaLeft', true); S(up(e, VK.LWIN, { ext: true }), 'MetaLeft', false);
  S(down(e, VK.RWIN, { ext: true }), 'MetaRight', true); S(up(e, VK.RWIN, { ext: true }), 'MetaRight', false);
});
t('Windows + letra (Win+D, Win+E, Win+R...): tudo vai ao outro computador', () => {
  const e = on();
  S(down(e, VK.LWIN, { ext: true }), 'MetaLeft', true);
  S(down(e, 0x44), 'KeyD', true); S(up(e, 0x44), 'KeyD', false);
  S(down(e, 0x45), 'KeyE', true); S(up(e, 0x45), 'KeyE', false);
  S(up(e, VK.LWIN, { ext: true }), 'MetaLeft', false);
  P(down(e, 0x44)); P(up(e, 0x44));                      // sem Windows apertada, D volta a ser normal
});
t('Windows + Shift + S: o Shift também vai (o Windows local não vê nada)', () => {
  const e = on();
  S(down(e, VK.LWIN, { ext: true }), 'MetaLeft', true);
  S(down(e, VK.LSHIFT), 'ShiftLeft', true); S(down(e, 0x53), 'KeyS', true); S(up(e, 0x53), 'KeyS', false);
  S(up(e, VK.LSHIFT), 'ShiftLeft', false); S(up(e, VK.LWIN, { ext: true }), 'MetaLeft', false);
});
t('Alt+Tab: o Alt segue o caminho normal, o Tab é capturado', () => {
  const e = on();
  P(down(e, VK.LALT)); S(down(e, VK.TAB), 'Tab', true); S(up(e, VK.TAB), 'Tab', false); P(up(e, VK.LALT));
});
t('Alt+Tab: soltar o Alt ANTES do Tab ainda solta o Tab no outro computador', () => {
  const e = on();
  P(down(e, VK.LALT)); S(down(e, VK.TAB), 'Tab', true); P(up(e, VK.LALT)); S(up(e, VK.TAB), 'Tab', false);
  assert.deepStrictEqual(e.state().taken, []);
});
t('Alt+Esc, Alt+Espaço e Alt+F4', () => {
  const e = on();
  P(down(e, VK.RALT, { ext: true }));
  S(down(e, VK.ESC), 'Escape', true); S(up(e, VK.ESC), 'Escape', false);
  S(down(e, VK.SPACE), 'Space', true); S(up(e, VK.SPACE), 'Space', false);
  S(down(e, VK.F4), 'F4', true); S(up(e, VK.F4), 'F4', false);
});
t('Ctrl+Esc e Ctrl+Shift+Esc (gerenciador de tarefas)', () => {
  const e = on();
  P(down(e, VK.LCTRL)); S(down(e, VK.ESC), 'Escape', true); S(up(e, VK.ESC), 'Escape', false);
  P(down(e, VK.LSHIFT)); S(down(e, VK.ESC), 'Escape', true); S(up(e, VK.ESC), 'Escape', false);
});
t('teclas comuns NÃO são capturadas (Tab, Esc, Alt+X, Ctrl+C, Shift+Tab)', () => {
  const e = on();
  P(down(e, VK.TAB)); P(up(e, VK.TAB)); P(down(e, VK.ESC)); P(up(e, VK.ESC));
  P(down(e, VK.LALT)); P(down(e, 0x58)); P(up(e, 0x58)); P(up(e, VK.LALT));
  P(down(e, VK.LCTRL)); P(down(e, 0x43)); P(up(e, 0x43)); P(up(e, VK.LCTRL));
  P(down(e, VK.LSHIFT)); P(down(e, VK.TAB)); P(up(e, VK.TAB)); P(up(e, VK.LSHIFT));
  P(down(e, VK.LCTRL)); P(down(e, VK.LALT)); P(down(e, VK.TAB));                       // Ctrl+Alt+Tab não é Alt+Tab
});
t('janela em primeiro plano de outro programa: nada é capturado', () => {
  const e = on();
  P(down(e, VK.LWIN, { ext: true, fg: false })); P(up(e, VK.LWIN, { ext: true, fg: false }));
  P(down(e, VK.LALT, { fg: false })); P(down(e, VK.TAB, { fg: false }));
});
t('teclas injetadas pelo próprio programa (marca) nunca são capturadas', () => {
  const e = on();
  P(down(e, VK.LWIN, { ext: true, ours: true })); P(up(e, VK.LWIN, { ext: true, ours: true }));
  assert.deepStrictEqual(e.state().win, []);
});
t('desligar a captura solta o que ficou preso e limpa o estado', () => {
  const e = on();
  S(down(e, VK.LWIN, { ext: true }), 'MetaLeft', true); S(down(e, 0x44), 'KeyD', true);
  const ups = e.setCapture(false);
  assert.deepStrictEqual(ups.map((u) => [u.code, u.down]).sort(), [['KeyD', false], ['MetaLeft', false]]);
  assert.deepStrictEqual(e.state().taken, []); assert.deepStrictEqual(e.state().win, []);
  P(up(e, VK.LWIN, { ext: true }));                                                      // o "soltar" que chega depois passa normal
  assert.deepStrictEqual(e.setCapture(false), []);
});
t('perdeu o primeiro plano com a tecla Windows apertada: o "soltar" ainda é enviado', () => {
  const e = on();
  S(down(e, VK.LWIN, { ext: true }), 'MetaLeft', true);
  S(up(e, VK.LWIN, { ext: true, fg: false }), 'MetaLeft', false);
  assert.deepStrictEqual(e.state().win, []);
});
t('Alt já apertado quando a captura liga (seed)', () => {
  const e = on(); e.seed([VK.LALT]);
  S(down(e, VK.TAB), 'Tab', true);
});
t('tecla sem equivalente no outro computador passa, mesmo com Windows apertada', () => {
  const e = on();
  S(down(e, VK.LWIN, { ext: true }), 'MetaLeft', true);
  P(down(e, 0xe9)); P(up(e, 0xe9));
});
t('auto-repetição (tecla segurada) continua capturada', () => {
  const e = on();
  P(down(e, VK.LALT)); S(down(e, VK.TAB), 'Tab', true); S(down(e, VK.TAB), 'Tab', true); S(down(e, VK.TAB), 'Tab', true); S(up(e, VK.TAB), 'Tab', false);
});

console.log(`OK: regras de teclas do Windows passaram (${n} grupos de testes)`);
