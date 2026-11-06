'use strict';
// Testes da lógica de múltiplos monitores (src/monitors.js) com topologias sintéticas.
const assert = require('node:assert/strict');
const M = require('../src/monitors.js');

const d = (id, x, y, width, height, extra = {}) => ({ id, x, y, width, height, scaleFactor: 1, rotation: 0, primary: false, label: '', ...extra });
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `esperado ~${b}, obtido ${a}`);

// --- construção e numeração ---
let list = M.buildMonitors([d(1, 0, 0, 1920, 1080, { primary: true }), d(2, 1920, 0, 1920, 1080)]);
assert.deepEqual(list.map((m) => m.index), [1, 2]);
assert.equal(list[0].primary, true);
assert.equal(M.buildMonitors([d(9, 0, 0, 0, 0)]).length, 0, 'monitor com tamanho zero é ignorado');
assert.equal(M.primaryOf(list).id, '1');
assert.equal(M.primaryOf(M.buildMonitors([d(5, 0, 0, 800, 600), d(6, 800, 0, 800, 600)])).id, '5', 'sem principal marcado usa o primeiro');

// --- área de trabalho virtual (inclui origem negativa) ---
const left = M.buildMonitors([d(1, 0, 0, 1920, 1080, { primary: true }), d(2, -2560, -200, 2560, 1440)]);
assert.deepEqual(M.virtualBounds(left), { x: -2560, y: -200, w: 4480, h: 1440 });
assert.equal(M.virtualBounds([]), null);

// --- conversão de coordenadas: monitor principal, segundo à direita ---
const two = M.buildMonitors([d(1, 0, 0, 1920, 1080, { primary: true }), d(2, 1920, 0, 1920, 1080)]);
let r = M.mapMouse({ monitors: two, selected: '1' }, { x: 0, y: 0 });
assert.deepEqual(r, { x: 0, y: 0 }, 'canto sup. esquerdo do monitor 1 = origem da área virtual');
r = M.mapMouse({ monitors: two, selected: '1' }, { x: 1, y: 1 });
near(r.x, Math.round((1919 * 65535) / 3839)); near(r.y, 65535);
r = M.mapMouse({ monitors: two, selected: '1' }, { x: 0.5, y: 0.5, mon: '2' });   // `mon` vence a seleção
near(r.x, Math.round(((1920 + 960) * 65535) / 3839), 1); near(r.y, Math.round((540 * 65535) / 1079), 1);   // pixel (2880, 540)
r = M.mapMouse({ monitors: two, selected: '2' }, { x: 0, y: 0 });                  // sem `mon` (cliente antigo): usa o selecionado
near(r.x, Math.round((1920 * 65535) / 3839), 1); assert.equal(r.y, 0);

// --- monitor à esquerda e acima (coordenadas negativas) e resoluções diferentes ---
const t = { monitors: left, selected: '2' };
r = M.mapMouse(t, { x: 0, y: 0 });                    // canto sup. esq. do monitor 2 = origem da área virtual
assert.deepEqual(r, { x: 0, y: 0 });
r = M.mapMouse(t, { x: 1, y: 1, mon: '2' });          // canto inf. dir. do monitor 2 = (-1, 1239) px
near(r.x, Math.round(((-1 + 2560) * 65535) / 4479), 1); near(r.y, Math.round(((1239 + 200) * 65535) / 1439), 1);
r = M.mapMouse(t, { x: 0, y: 0, mon: '1' });          // origem do monitor principal fica no meio da área virtual
near(r.x, Math.round((2560 * 65535) / 4479), 1); near(r.y, Math.round((200 * 65535) / 1439), 1);

// --- ponto físico exato dentro do monitor (independe de resolução / DPI) ---
const mixed = M.buildMonitors([d(1, 0, 0, 3840, 2160, { primary: true, scaleFactor: 2 }), d(2, 3840, 360, 1920, 1080, { scaleFactor: 1 })]);
assert.deepEqual(M.monitorPoint(mixed[0], 0.5, 0.5), { x: 1920, y: 1080 }, 'monitor 4K (escala 200%)');
assert.deepEqual(M.monitorPoint(mixed[1], 0, 0), { x: 3840, y: 360 }, 'segundo monitor com deslocamento vertical');
assert.deepEqual(M.monitorPoint(mixed[1], 1, 1), { x: 3840 + 1919, y: 360 + 1079 });
assert.deepEqual(M.monitorPoint(mixed[0], -5, 9), { x: 0, y: 2159 }, 'valores fora de 0..1 são limitados');
assert.deepEqual(M.monitorPoint(mixed[0], NaN, undefined), { x: 0, y: 0 });

// --- monitor citado não existe mais: descarta (null), nunca clica em outro lugar ---
assert.equal(M.mapMouse({ monitors: two, selected: '1' }, { x: 0.5, y: 0.5, mon: '99' }), null);
assert.equal(M.mapMouse(null, { x: 0, y: 0 }), null);
assert.equal(M.mapMouse({ monitors: [], selected: '1' }, { x: 0, y: 0 }), null);

// --- um único monitor (comportamento atual não pode quebrar) ---
const one = M.buildMonitors([d(1, 0, 0, 1920, 1080, { primary: true })]);
assert.deepEqual(M.mapMouse({ monitors: one, selected: '1' }, { x: 0, y: 0 }), { x: 0, y: 0 });
assert.deepEqual(M.mapMouse({ monitors: one, selected: '1' }, { x: 1, y: 1 }), { x: 65535, y: 65535 });
near(M.mapMouse({ monitors: one, selected: '1' }, { x: 0.25, y: 0.75 }).x, Math.round((480 * 65535) / 1919), 1);   // pixel 480 de 1920

// --- seleção e hot-plug ---
assert.equal(M.resolveSelection(two, '2'), '2');
assert.equal(M.resolveSelection(two, '7'), '1', 'monitor inexistente: volta ao principal');
assert.equal(M.resolveSelection([], '1'), null);

let p = M.planUpdate(two, '2', two);
assert.equal(p.topologyChanged, false); assert.equal(p.recapture, false); assert.equal(p.selected, '2');

// monitor selecionado foi desconectado
const only1 = M.buildMonitors([d(1, 0, 0, 1920, 1080, { primary: true })]);
p = M.planUpdate(two, '2', only1);
assert.equal(p.selected, '1'); assert.equal(p.selectionLost, true); assert.equal(p.recapture, true); assert.deepEqual(p.diff.removed, ['2']);

// monitor que NÃO estava selecionado foi desconectado: só a lista muda
p = M.planUpdate(two, '1', only1);
assert.equal(p.selectionLost, false); assert.equal(p.recapture, false); assert.equal(p.topologyChanged, true);

// monitor conectado
p = M.planUpdate(only1, '1', two);
assert.deepEqual(p.diff.added, ['2']); assert.equal(p.recapture, false); assert.equal(p.topologyChanged, true);

// mudança de resolução do monitor selecionado -> reinicia a captura
const hires = M.buildMonitors([d(1, 0, 0, 2560, 1440, { primary: true }), d(2, 2560, 0, 1920, 1080)]);
p = M.planUpdate(two, '1', hires);
assert.deepEqual(p.diff.changed.sort(), ['1', '2']); assert.equal(p.recapture, true);

// mudança de orientação (rotação) e de escala de um monitor NÃO selecionado: lista muda, captura não reinicia
const rot = M.buildMonitors([d(1, 0, 0, 1920, 1080, { primary: true }), d(2, 1920, 0, 1080, 1920, { rotation: 90 })]);
p = M.planUpdate(two, '1', rot);
assert.deepEqual(p.diff.changed, ['2']); assert.equal(p.recapture, false); assert.equal(p.topologyChanged, true);
p = M.planUpdate(two, '2', rot);
assert.equal(p.recapture, true, 'orientação do monitor selecionado mudou');

// troca do monitor principal
const swapped = M.buildMonitors([d(1, 0, 0, 1920, 1080), d(2, 1920, 0, 1920, 1080, { primary: true })]);
assert.equal(M.diffTopology(two, swapped).same, false);

// seleção inicial (nada selecionado ainda): escolhe o principal
p = M.planUpdate([], null, two);
assert.equal(p.selected, '1'); assert.equal(p.selectionLost, false);

// --- lista pública (vai pela rede para o controlador) ---
const pub = M.publicList(two);
assert.deepEqual(Object.keys(pub[0]).sort(), ['h', 'id', 'index', 'primary', 'rotation', 'scale', 'w', 'x', 'y']);

console.log('OK: lógica de múltiplos monitores passou em todos os testes');
