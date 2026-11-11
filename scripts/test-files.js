'use strict';
// Gerenciador de arquivos: acesso ao disco (src/files.js, em pastas temporárias) e lógica pura (src/renderer/fmcore.js).
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const files = require('../src/files');
const core = require('../src/renderer/fmcore');

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok  ', name); };
const rejects = async (p, code) => { try { await p; } catch (e) { assert.strictEqual(files.codeOf(e), code, `esperava ${code}, veio ${files.codeOf(e)}`); return; } assert.fail('deveria ter falhado com ' + code); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rea-files-'));
const mk = (...p) => { const f = path.join(tmp, ...p); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; };

(async () => {
  /* ---------- lógica pura ---------- */
  await t('pedaço binário: 4 bytes de id + dados, e volta igual', () => {
    const data = new Uint8Array([1, 2, 3, 250]);
    const buf = core.frame(0xdeadbeef, data);
    assert.strictEqual(buf.byteLength, 8);
    const u = core.unframe(buf);
    assert.strictEqual(u.id, 0xdeadbeef); assert.deepStrictEqual(Array.from(u.data), [1, 2, 3, 250]);
    assert.strictEqual(core.unframe(new ArrayBuffer(2)), null); assert.strictEqual(core.unframe(null), null);
    const empty = core.unframe(core.frame(7, new Uint8Array(0))); assert.strictEqual(empty.id, 7); assert.strictEqual(empty.data.byteLength, 0);
  });
  await t('juntar caminhos (Windows) e caminho de um item do Início', () => {
    assert.strictEqual(core.joinPath('C:\\', 'a.txt'), 'C:\\a.txt');
    assert.strictEqual(core.joinPath('C:\\x', 'a.txt'), 'C:\\x\\a.txt');
    assert.strictEqual(core.childPath({ path: 'C:\\x' }, { n: 'a' }), 'C:\\x\\a');
    assert.strictEqual(core.childPath({ path: '' }, { n: 'Downloads', p: 'C:\\Users\\a\\Downloads' }), 'C:\\Users\\a\\Downloads');
  });
  await t('lista grande é cortada para caber numa mensagem e avisa', () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ n: 'arquivo-com-nome-comprido-' + i + '.txt', d: false, s: i, t: 1700000000000 + i }));
    const c = core.capEntries(many, 20000);
    assert.ok(c.truncated && c.entries.length > 100 && c.entries.length < 5000);
    assert.ok(JSON.stringify(c.entries).length <= 20000);
    assert.deepStrictEqual(core.capEntries(many.slice(0, 3)), { entries: many.slice(0, 3), truncated: false });
  });
  await t('tamanhos, datas e mensagens de erro em português', () => {
    assert.strictEqual(core.fmtSize(0), '0 B'); assert.strictEqual(core.fmtSize(2048), '2 KB'); assert.strictEqual(core.fmtSize(1572864), '1,5 MB'); assert.strictEqual(core.fmtSize(3 * 1024 ** 3), '3,00 GB');
    assert.strictEqual(core.fmtDate(0), ''); assert.match(core.fmtDate(Date.now()), /^\d\d\/\d\d\/\d{4} \d\d:\d\d$/);
    assert.match(core.errText('sem-acesso'), /permiss/); assert.match(core.errText('inexistente-xyz'), /Algo deu errado/);
  });

  /* ---------- disco ---------- */
  await t('nomes seguros: sem pastas, sem caracteres proibidos, sem nomes reservados do Windows', () => {
    assert.strictEqual(files.safeName('..\\..\\Windows\\x.txt'), 'x.txt');
    assert.strictEqual(files.safeName('../a/b.txt'), 'b.txt');
    assert.strictEqual(files.safeName('a<b>:c?.txt'), 'a_b__c_.txt');
    assert.strictEqual(files.safeName('CON'), '_CON'); assert.strictEqual(files.safeName('nul.txt'), '_nul.txt');
    assert.strictEqual(files.safeName('fim. . '), 'fim'); assert.strictEqual(files.safeName(''), 'arquivo'); assert.strictEqual(files.safeName(null), 'arquivo');
    assert.ok(files.safeName('x'.repeat(500)).length <= 200);
  });
  await t('Início: lista pastas conhecidas e discos (C: existe)', async () => {
    const r = await files.list('');
    assert.strictEqual(r.path, ''); assert.strictEqual(r.parent, null);
    assert.ok(r.entries.every((e) => e.d && e.p && e.n));
    assert.ok(r.entries.some((e) => /^[A-Z]:\\$/.test(e.p)), 'nenhum disco encontrado');
  });
  await t('pasta: pastas primeiro, depois por nome; tamanho e data; "pai" certo; raiz do disco volta ao Início', async () => {
    mk('b.txt'); fs.writeFileSync(mk('b.txt'), 'bbb'); fs.writeFileSync(mk('A.txt'), 'a'); fs.mkdirSync(mk('zeta', 'x'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'alfa'));
    fs.writeFileSync(mk('10.txt'), ''); fs.writeFileSync(mk('9.txt'), '');
    const r = await files.list(tmp);
    assert.strictEqual(r.path, path.resolve(tmp)); assert.strictEqual(r.parent, path.dirname(tmp)); assert.strictEqual(r.truncated, false);
    assert.deepStrictEqual(r.entries.map((e) => e.n), ['alfa', 'zeta', '9.txt', '10.txt', 'A.txt', 'b.txt']);
    const b = r.entries.find((e) => e.n === 'b.txt'); assert.strictEqual(b.s, 3); assert.ok(b.t > 0 && !b.d);
    const root = path.parse(tmp).root; assert.strictEqual((await files.list(root)).parent, '');
    assert.strictEqual((await files.list(root.slice(0, 2))).path, root);      // "C:" vira "C:\"
  });
  await t('pasta inexistente, arquivo no lugar de pasta e caminho inválido dão códigos claros', async () => {
    await rejects(files.list(path.join(tmp, 'nao-existe')), 'nao-existe');
    await rejects(files.list(path.join(tmp, 'A.txt')), 'pasta-invalida');
    await rejects(files.list(12), 'nao-existe');
    await rejects(files.readOpen(tmp), 'nao-e-arquivo');
  });
  await t('muitos itens: corta em MAX_ENTRIES e avisa', async () => {
    const big = path.join(tmp, 'big'); fs.mkdirSync(big);
    for (let i = 0; i < files.MAX_ENTRIES + 20; i++) fs.writeFileSync(path.join(big, 'f' + i), '');
    const r = await files.list(big);
    assert.strictEqual(r.entries.length, files.MAX_ENTRIES); assert.strictEqual(r.truncated, true);
  });
  await t('enviar: ler em blocos devolve o arquivo inteiro e depois null (arquivo de 700 KB)', async () => {
    const src = path.join(tmp, 'grande.bin'); const data = Buffer.alloc(700 * 1024 + 123); for (let i = 0; i < data.length; i++) data[i] = (i * 7) & 255; fs.writeFileSync(src, data);
    const o = await files.readOpen(src); assert.strictEqual(o.size, data.length); assert.strictEqual(o.name, 'grande.bin');
    const parts = []; for (;;) { const b = await files.read(o.rid); if (!b) break; assert.ok(b.length <= files.BLOCK); parts.push(b); }
    assert.ok(parts.length >= 3); assert.ok(Buffer.concat(parts).equals(data));
    assert.strictEqual(parts[parts.length - 1].buffer.byteLength, parts[parts.length - 1].length, 'último bloco precisa ser uma cópia do tamanho certo');
    await files.readClose(o.rid); await rejects(files.read(o.rid), 'invalido');
  });
  await t('receber: grava em .rea-part e só no fim aparece com o nome final; tamanho conferido', async () => {
    const dir = path.join(tmp, 'dest'); fs.mkdirSync(dir);
    const w = await files.writeOpen(dir, 'novo.txt', 10);
    assert.strictEqual(w.name, 'novo.txt'); assert.ok(fs.existsSync(path.join(dir, 'novo.txt' + files.PART))); assert.ok(!fs.existsSync(path.join(dir, 'novo.txt')));
    await files.write(w.wid, new Uint8Array(Buffer.from('12345'))); await files.write(w.wid, Buffer.from('67890'));
    const r = await files.writeClose(w.wid, true);
    assert.strictEqual(r.name, 'novo.txt'); assert.strictEqual(r.size, 10); assert.strictEqual(fs.readFileSync(path.join(dir, 'novo.txt'), 'utf8'), '1234567890');
    assert.ok(!fs.existsSync(path.join(dir, 'novo.txt' + files.PART)));
  });
  await t('receber: nunca sobrescreve (novo (1).txt, novo (2).txt) nem mesmo durante a transferência', async () => {
    const dir = path.join(tmp, 'dest');
    const a = await files.writeOpen(dir, 'novo.txt', 1), b = await files.writeOpen(dir, 'novo.txt', 1);   // os dois ao mesmo tempo
    assert.strictEqual(a.name, 'novo (1).txt'); assert.strictEqual(b.name, 'novo (2).txt');
    await files.write(a.wid, Buffer.from('a')); await files.write(b.wid, Buffer.from('b'));
    await files.writeClose(a.wid, true); await files.writeClose(b.wid, true);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'novo (1).txt'), 'utf8'), 'a'); assert.strictEqual(fs.readFileSync(path.join(dir, 'novo.txt'), 'utf8'), '1234567890');
  });
  await t('receber: nome com caminho não escapa da pasta escolhida', async () => {
    const dir = path.join(tmp, 'dest'); const w = await files.writeOpen(dir, '..\\..\\fora.txt', 0);
    assert.strictEqual(path.dirname(w.path), path.resolve(dir)); await files.writeClose(w.wid, true);
    assert.ok(fs.existsSync(path.join(dir, 'fora.txt'))); assert.ok(!fs.existsSync(path.join(tmp, 'fora.txt')));
  });
  await t('receber: mais bytes do que o combinado, menos bytes, cancelar e tamanho inválido', async () => {
    const dir = path.join(tmp, 'dest');
    let w = await files.writeOpen(dir, 'excesso.txt', 3); await rejects(files.write(w.wid, Buffer.from('1234')), 'tamanho'); await files.writeClose(w.wid, false);
    assert.ok(!fs.existsSync(path.join(dir, 'excesso.txt' + files.PART)), 'temporário precisa sumir');
    w = await files.writeOpen(dir, 'curto.txt', 5); await files.write(w.wid, Buffer.from('12')); await rejects(files.writeClose(w.wid, true), 'incompleto');
    assert.ok(!fs.existsSync(path.join(dir, 'curto.txt')) && !fs.existsSync(path.join(dir, 'curto.txt' + files.PART)));
    w = await files.writeOpen(dir, 'cancelado.txt', 5); await files.write(w.wid, Buffer.from('12')); await files.writeClose(w.wid, false);
    assert.ok(!fs.existsSync(path.join(dir, 'cancelado.txt')) && !fs.existsSync(path.join(dir, 'cancelado.txt' + files.PART)));
    await rejects(files.writeOpen(dir, 'x', -1), 'tamanho'); await rejects(files.writeOpen(dir, 'x', 1.5), 'tamanho'); await rejects(files.writeOpen(dir, 'x', files.MAX_BYTES + 1), 'tamanho');
    await rejects(files.writeOpen(path.join(dir, 'nao-existe'), 'x', 1), 'nao-existe'); await rejects(files.writeOpen(path.join(dir, 'novo.txt'), 'x', 1), 'pasta-invalida');
  });
  await t('fechar tudo (fim da sessão): apaga o que ficou pela metade e libera os arquivos', async () => {
    const dir = path.join(tmp, 'dest');
    const w = await files.writeOpen(dir, 'metade.txt', 100); await files.write(w.wid, Buffer.from('abc'));
    const r = await files.readOpen(path.join(tmp, 'A.txt'));
    await files.closeAll();
    assert.ok(!fs.existsSync(path.join(dir, 'metade.txt' + files.PART)));
    await rejects(files.write(w.wid, Buffer.from('x')), 'invalido'); await rejects(files.read(r.rid), 'invalido');
    fs.unlinkSync(path.join(tmp, 'A.txt'));                                                   // no Windows, só apaga se o arquivo foi fechado
  });
  await t('códigos de erro do sistema viram códigos curtos', () => {
    for (const [sys, want] of [['ENOENT', 'nao-existe'], ['EACCES', 'sem-acesso'], ['EPERM', 'sem-acesso'], ['EBUSY', 'ocupado'], ['ENOSPC', 'sem-espaco'], ['EISDIR', 'nao-e-arquivo'], ['XYZ', 'erro']]) assert.strictEqual(files.codeOf({ code: sys }), want);
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${n} verificações do gerenciador de arquivos: OK`);
})().catch((e) => { console.error('FALHA', e); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} process.exit(1); });
