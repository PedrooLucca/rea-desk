'use strict';
// Testes do histórico de computadores acessados (src/renderer/history.js).
const assert = require('node:assert/strict');
const H = require('../src/renderer/history.js');

const T0 = new Date(2026, 10, 5, 12, 0, 0).getTime();       // 05/11/2026 12:00 (horário local)
const min = 60000, hour = 60 * min, day = 24 * hour;

// --- registrar um acesso ---
let l = [];
l = H.record(l, '123456789', 'Maria-PC', T0);
assert.deepEqual(l, [{ id: '123456789', name: 'Maria-PC', lastAt: T0, count: 1, fav: false, custom: false }]);
l = H.record(l, '987654321', 'Sala', T0 + 1000);
assert.deepEqual(l.map((e) => e.id), ['987654321', '123456789'], 'o mais recente vem primeiro');
l = H.record(l, '123456789', 'Maria-PC (novo nome)', T0 + 2000);
assert.equal(l.length, 2, 'o mesmo código não duplica');
assert.equal(l[0].id, '123456789'); assert.equal(l[0].count, 2); assert.equal(l[0].name, 'Maria-PC (novo nome)', 'segue o nome informado pelo outro computador');
assert.equal(H.record(l, '12345', 'x'), l, 'código inválido é ignorado');
assert.equal(H.record(l, 'abcdefghi', 'x'), l);
l = H.record(l, '555555555', '   ', T0 + 3000);
assert.equal(l[0].name, '', 'nome vazio é aceito (mostra "Computador 555 555 555")');
assert.equal(H.displayName(l[0]), 'Computador 555 555 555');
l = H.record(l, '555555555', '', T0 + 4000);
assert.equal(l.find((e) => e.id === '555555555').count, 2);

// --- nome personalizado não é sobrescrito ---
l = H.rename(l, '123456789', '  Notebook da Maria  ');
assert.equal(l.find((e) => e.id === '123456789').name, 'Notebook da Maria');
assert.equal(l.find((e) => e.id === '123456789').custom, true);
l = H.record(l, '123456789', 'DESKTOP-ABC', T0 + 5000);
assert.equal(l.find((e) => e.id === '123456789').name, 'Notebook da Maria', 'renomeado à mão: mantém');
l = H.rename(l, '123456789', '');                           // nome vazio desfaz a personalização
assert.equal(l.find((e) => e.id === '123456789').custom, false);
assert.equal(l.find((e) => e.id === '123456789').name, 'Notebook da Maria', 'mantém o texto até o próximo acesso atualizar');
l = H.record(l, '123456789', 'DESKTOP-ABC', T0 + 6000);
assert.equal(l.find((e) => e.id === '123456789').name, 'DESKTOP-ABC');
assert.equal(H.rename(l, '123456789', 'x'.repeat(100)).find((e) => e.id === '123456789').name.length, 40, 'nome limitado a 40 caracteres');
assert.equal(H.rename(l, '000000000', 'x').length, l.length, 'renomear item inexistente não quebra');

// --- favoritos ficam no topo ---
l = H.toggleFavorite(l, '987654321');
assert.equal(l[0].id, '987654321'); assert.equal(l[0].fav, true);
l = H.record(l, '111111111', 'Novo', T0 + 9000);
assert.equal(l[0].id, '987654321', 'favorito continua primeiro mesmo com acesso mais novo');
l = H.toggleFavorite(l, '987654321');
assert.equal(l[0].id, '111111111');

// --- remover e limpar (favoritos sobrevivem) ---
l = H.toggleFavorite(l, '555555555');
const sem = H.remove(l, '111111111');
assert.equal(sem.some((e) => e.id === '111111111'), false);
assert.deepEqual(H.clearKeepingFavorites(l).map((e) => e.id), ['555555555']);

// --- limite de itens (favoritos nunca são descartados) ---
let big = [];
for (let i = 0; i < 30; i++) big = H.record(big, String(100000000 + i), `PC ${i}`, T0 + i * 1000);
assert.equal(big.length, H.MAX, `no máximo ${H.MAX} itens`);
assert.equal(big[0].name, 'PC 29'); assert.equal(big.some((e) => e.name === 'PC 0'), false, 'os mais antigos saem');
big = H.toggleFavorite(big, String(100000000 + 19));        // favorita um dos mais antigos que restaram
for (let i = 30; i < 60; i++) big = H.record(big, String(100000000 + i), `PC ${i}`, T0 + i * 1000);
assert.equal(big.length, H.MAX);
assert.ok(big.some((e) => e.id === String(100000000 + 19) && e.fav), 'favorito não é descartado pelo limite');

// --- dados do disco corrompidos ou de outra versão ---
assert.deepEqual(H.normalize(null), []);
assert.deepEqual(H.normalize('lixo'), []);
assert.deepEqual(H.parse('{{{ não é json'), []);
assert.deepEqual(H.parse(''), []);
assert.deepEqual(H.parse(null), []);
const sujo = H.normalize([
  { id: '123456789', name: 'A', lastAt: 5 }, { id: '123456789', name: 'duplicado' }, { id: 'xx' }, null, 7,
  { id: '222222222', name: 'B\u0000\u0007', lastAt: 'abc', count: -3, fav: 1, extra: 'ignorado' },
]);
assert.deepEqual(sujo.map((e) => e.id), ['222222222', '123456789'], 'favorito (fav) antes');
assert.equal(sujo[0].name, 'B'); assert.equal(sujo[0].count, 1); assert.equal(sujo[0].lastAt, 0); assert.equal(sujo[0].extra, undefined);
assert.deepEqual(H.parse(JSON.stringify(l)), l, 'ida e volta pelo JSON não muda nada');

// --- "há quanto tempo" ---
assert.equal(H.timeAgo(0, T0), '');
assert.equal(H.timeAgo(T0 - 20 * 1000, T0), 'agora há pouco');
assert.equal(H.timeAgo(T0 - 5 * min, T0), 'há 5 min');
assert.equal(H.timeAgo(T0 - 59 * min, T0), 'há 59 min');
assert.equal(H.timeAgo(T0 - 3 * hour, T0), 'há 3 h');
assert.equal(H.timeAgo(T0 - 1 * day, T0), 'ontem');
assert.equal(H.timeAgo(T0 - 4 * day, T0), 'há 4 dias');
assert.equal(H.timeAgo(new Date(2026, 9, 1, 8, 0, 0).getTime(), T0), '01/10/2026');
assert.equal(H.timeAgo(T0 + 5 * min, T0), 'agora há pouco', 'relógio adiantado não gera tempo negativo');
assert.equal(H.timeAgo(new Date(2026, 10, 4, 23, 50, 0).getTime(), new Date(2026, 10, 5, 0, 10, 0).getTime()), 'há 20 min');

console.log('OK: histórico de dispositivos passou em todos os testes');
