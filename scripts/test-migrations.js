'use strict';
const assert = require('node:assert/strict');
const { run, CURRENT } = require('../src/renderer/migrations.js');
const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

// instalação antiga (sem dataVersion) que já tinha dados: preserva tudo e não mostra boas-vindas de novo
let s = mem({ myId: '123456789', name: 'Maria-PC', server: '', stun: '' });
assert.equal(run(s), CURRENT);
assert.equal(s.getItem('welcomed'), '1');
assert.equal(s.getItem('myId'), '123456789');
assert.equal(s.getItem('name'), 'Maria-PC');
assert.equal(s.getItem('dataVersion'), String(CURRENT));

// instalação nova (vazia): mostra a boas-vindas normalmente
s = mem();
run(s);
assert.equal(s.getItem('welcomed'), null);
assert.equal(s.getItem('dataVersion'), String(CURRENT));

// idempotente
s = mem({ myId: '1', welcomed: '1' });
run(s); run(s);
assert.equal(s.getItem('dataVersion'), String(CURRENT));

// dados mais novos (rollback para versão antiga): não altera nada
s = mem({ dataVersion: '99', custom: 'x' });
assert.equal(run(s), 99);
assert.equal(s.getItem('dataVersion'), '99');
assert.equal(s.getItem('custom'), 'x');

console.log('OK: migrações de dados passaram em todos os testes');
