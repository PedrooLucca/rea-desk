'use strict';
// Lança uma nova versão com UM comando:
//   npm run release -- patch        (0.3.0 -> 0.3.1)   correções
//   npm run release -- minor        (0.3.0 -> 0.4.0)   novidades
//   npm run release -- major        (0.3.0 -> 1.0.0)   mudanças grandes
//   npm run release -- 1.0.1        (versão exata)
//   acrescente --dry-run para só mostrar o que seria feito
// O script atualiza a versão, roda os testes, cria o commit e a etiqueta (v1.0.1) e envia ao GitHub.
// O GitHub Actions (.github/workflows/release.yml) compila, assina, gera o pacote e publica a versão.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const semver = require('semver');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const what = args.find((a) => !a.startsWith('--'));
const die = (m) => { console.error('\nERRO: ' + m); process.exit(1); };
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

if (!what) die('diga o tipo de versão: patch, minor, major ou um número (ex.: 1.0.1).\n  Exemplo: npm run release -- patch');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const current = pkg.version;
const next = semver.valid(what) ? semver.valid(what) : ['patch', 'minor', 'major'].includes(what) ? semver.inc(current, what) : null;
if (!next) die(`"${what}" não é uma versão válida. Use patch, minor, major ou algo como 1.0.1.`);
if (!semver.gt(next, current)) die(`a nova versão (${next}) precisa ser maior que a atual (${current}).`);
if (/SEU-USUARIO/.test(JSON.stringify(pkg.build.publish))) die('configure o seu usuário/repositório do GitHub em package.json > build > publish > owner/repo antes de lançar versões.');

console.log(`Versão atual: ${current}\nNova versão:  ${next}${dry ? '   (simulação: nada será alterado)' : ''}\n`);

let inRepo = true;
try { git('rev-parse', '--is-inside-work-tree'); } catch { inRepo = false; }
if (!inRepo) die('esta pasta ainda não é um repositório git ligado ao GitHub. Rode: git init, git add -A, git commit, git remote add origin <url-do-repositorio> e git push -u origin main.');
if (git('status', '--porcelain')) die('há alterações não salvas (commit). Salve ou descarte-as antes de lançar.');
if (!git('remote')) die('o repositório não tem um destino no GitHub (remote). Rode: git remote add origin <url-do-repositorio> e git push -u origin main.');
const tag = `v${next}`;
if (git('tag', '--list', tag)) die(`a etiqueta ${tag} já existe.`);

console.log('1/4 Rodando os testes…');
if (!dry) { const t = spawnSync('npm', ['test'], { cwd: root, stdio: 'inherit', shell: true }); if (t.status !== 0) die('os testes falharam; nada foi publicado.'); }

console.log(`2/4 Atualizando a versão para ${next}…`);
if (!dry) { pkg.version = next; fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n'); }

console.log('3/4 Criando o commit e a etiqueta ' + tag + '…');
if (!dry) { git('add', '-A'); git('commit', '-m', `Versão ${next}`); git('tag', '-a', tag, '-m', `Versão ${next}`); }

console.log('4/4 Enviando para o GitHub (isto dispara a publicação automática)…');
if (!dry) git('push', '--follow-tags');

console.log(dry ? '\nSimulação concluída.' : `\nPronto! Acompanhe a publicação em: GitHub > aba Actions. Em alguns minutos a versão ${next} chega aos usuários.`);
