'use strict';
// Texto da Release (scripts/release-notes.js): pega a seção da versão em docs/mudancas.md.
const assert = require('node:assert');
const { section, notes } = require('./release-notes');

const md = '# Histórico\n\nintro\n\n## 0.8.0\n\n- novo A\n- novo B\n\n## 0.7.1 (inclui a 0.7.0)\n\n- antigo\n\n## 0.5.0\n\n- mais antigo\n';
assert.strictEqual(section(md, '0.8.0'), '- novo A\n- novo B');
assert.strictEqual(section(md.replace(/\n/g, '\r\n'), '0.8.0'), '- novo A\n- novo B');            // CRLF (Windows do pipeline)
assert.strictEqual(section(md, '0.7.1'), '- antigo');                                             // título com texto depois do número
assert.strictEqual(section(md, '0.5.0'), '- mais antigo');                                        // última seção
assert.strictEqual(section(md, '0.7'), null); assert.strictEqual(section(md, '9.9.9'), null);
assert.ok(notes('0.8.0', md).startsWith('## O que mudou na 0.8.0\n\n- novo A'));
assert.ok(notes('9.9.9', md).startsWith('REA Desk 9.9.9.'));
for (const v of ['0.8.0', '9.9.9']) assert.ok(!/\[(silencioso|perguntar)\]/i.test(notes(v, md)), 'não pode forçar o modo de atualização');
console.log('OK: texto da Release passou em todos os testes');
