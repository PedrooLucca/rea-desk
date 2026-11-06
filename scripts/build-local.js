'use strict';
// Gera uma versão de TESTE do instalador para experimentar o fluxo de atualização sem publicar nada.
//   node scripts/build-local.js 0.3.1            -> versão 0.3.1 normal
//   node scripts/build-local.js 0.3.2 --broken   -> versão 0.3.2 propositalmente quebrada (para testar o rollback)
// A versão de teste usa outra identidade ("REA Desk Teste") e outra pasta de dados: NÃO mexe na sua instalação real.
// Os arquivos vão para dist-local/, servida por `npm run update:serve-local`.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
const broken = args.includes('--broken');
if (!version) { console.error('uso: node scripts/build-local.js <versão, ex.: 0.3.1> [--broken]'); process.exit(1); }

// A interface depende dos arquivos gerados em src/renderer/assets (CSS, ícones, fonte).
const ui = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-ui.js')], { stdio: 'inherit' });
if (ui.status !== 0) process.exit(ui.status || 1);

const stage = path.join(root, '.local-build');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage);
for (const d of ['src', 'server', 'config', 'build']) fs.cpSync(path.join(root, d), path.join(stage, d), { recursive: true });
fs.rmSync(path.join(stage, 'server', 'test.js'), { force: true });
fs.symlinkSync(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'junction');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
pkg.name = 'rea-desk-teste';
pkg.version = version;
pkg.build.productName = 'REA Desk Teste';
pkg.build.appId = 'br.com.readesk.teste';
pkg.build.artifactName = 'REA-Desk-Teste-Instalar-${version}.${ext}';
pkg.build.nsis.shortcutName = 'REA Desk Teste';
pkg.build.publish = { provider: 'generic', url: 'http://127.0.0.1:8899/' };
pkg.build.directories.output = path.join(root, 'dist-local');
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2));

if (broken) {
  const f = path.join(stage, 'src', 'main.js');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace("'use strict';", "'use strict';\nprocess.exit(1); // VERSÃO DE TESTE QUEBRADA DE PROPÓSITO"));
  console.log('>> versão QUEBRADA de propósito (fecha ao abrir) para testar o rollback');
}

const cli = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
const r = spawnSync(process.execPath, [cli, '--win', 'nsis', '--x64', '--publish', 'never'], { cwd: stage, stdio: 'inherit' });
fs.rmSync(stage, { recursive: true, force: true });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`\nPronto: dist-local\\REA-Desk-Teste-Instalar-${version}.exe (e latest.yml)`);
