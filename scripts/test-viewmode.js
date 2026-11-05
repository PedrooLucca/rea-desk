'use strict';
// Testes do modo de exibição esticada / reduzida (src/renderer/viewmode.js).
const assert = require('node:assert/strict');
const V = require('../src/renderer/viewmode.js');

// --- modos ---
assert.equal(V.normalize('shrink'), 'shrink');
assert.equal(V.normalize('stretch'), 'stretch');
assert.equal(V.DEFAULT, 'shrink', 'o padrão é reduzida');
assert.equal(V.normalize('qualquer coisa'), 'shrink', 'valor inválido volta ao padrão (reduzida)');
assert.equal(V.normalize(undefined), 'shrink');
assert.equal(V.normalize(null), 'shrink');
assert.equal(V.next('stretch'), 'shrink');
assert.equal(V.next('shrink'), 'stretch');
assert.equal(V.next('lixo'), 'stretch', 'valor inválido conta como reduzida; o próximo é esticada');
assert.equal(V.label('stretch'), 'Exibição: esticada');
assert.equal(V.label('shrink'), 'Exibição: reduzida');

// --- esticada: o CSS cuida (null) ---
assert.equal(V.fit(1920, 1080, 1000, 600, 1, 'stretch'), null);
assert.equal(V.fit(960, 540, 1900, 1000, 1, 'stretch'), null, 'esticada amplia: o CSS preenche a janela');

// --- reduzida: imagem MAIOR que a janela -> diminui mantendo a proporção ---
let r = V.fit(1920, 1080, 1000, 600, 1, 'shrink');
assert.deepEqual([r.width, r.height], [1000, 562]);                        // limitado pela largura (16:9 em 1000x600)
r = V.fit(1920, 1080, 1600, 500, 1, 'shrink');
assert.deepEqual([r.width, r.height], [888, 500]);                         // limitado pela altura
assert.ok(Math.abs(r.width / r.height - 1920 / 1080) < 0.01, 'mantém a proporção');

// --- reduzida: imagem MENOR que a janela -> NÃO amplia (tamanho real, centralizada pelo CSS) ---
r = V.fit(960, 540, 1900, 1000, 1, 'shrink');
assert.deepEqual([r.width, r.height], [960, 540], 'não amplia');
assert.equal(r.scale, 1);
r = V.fit(1280, 720, 1280, 720, 1, 'shrink');
assert.deepEqual([r.width, r.height], [1280, 720], 'cabe exatamente');

// --- escala do Windows (DPI): 1 pixel remoto = 1 pixel FÍSICO, então em pixels CSS a imagem é menor ---
r = V.fit(960, 540, 1900, 1000, 1.5, 'shrink');
assert.deepEqual([r.width, r.height], [640, 360], '125%/150%: 960 px físicos = 640 px CSS');
r = V.fit(960, 540, 1900, 1000, 2, 'shrink');
assert.deepEqual([r.width, r.height], [480, 270]);
r = V.fit(1920, 1080, 1000, 600, 1.5, 'shrink');
assert.deepEqual([r.width, r.height], [1000, 562], 'quando a janela limita, a escala do Windows não interfere');

// --- valores inválidos nunca quebram (cai no CSS) ---
assert.equal(V.fit(0, 0, 1000, 600, 1, 'shrink'), null, 'vídeo ainda sem tamanho');
assert.equal(V.fit(1920, 1080, 0, 0, 1, 'shrink'), null, 'janela sem tamanho (escondida)');
assert.equal(V.fit(1920, 1080, -5, 600, 1, 'shrink'), null);
assert.equal(V.fit(NaN, 1080, 1000, 600, 1, 'shrink'), null);
r = V.fit(1920, 1080, 1000, 600, 0, 'shrink');
assert.deepEqual([r.width, r.height], [1000, 562], 'dpr inválido (0) é tratado como 1');
r = V.fit(1920, 1080, 3, 3, 1, 'shrink');
assert.ok(r.width >= 1 && r.height >= 1, 'janela minúscula: nunca devolve 0 px');
r = V.fit(100, 5000, 400, 400, 1, 'shrink');                               // imagem muito alta
assert.ok(r.height <= 400 && r.width >= 1);

console.log('OK: modo de exibição (esticada/reduzida) passou em todos os testes');
