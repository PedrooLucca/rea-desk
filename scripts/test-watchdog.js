'use strict';
// Testa o vigia de atualização (src/watchdog.ps1) com pastas de mentira:
//  1) nova versão saudável     -> nada é restaurado e o backup é apagado
//  2) nova versão que não abre -> os arquivos da versão anterior são restaurados, rollback.json é gravado e o app reabre
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.platform !== 'win32') { console.log('(teste do vigia ignorado: só roda no Windows)'); process.exit(0); }
const watchdog = path.join(__dirname, '..', 'src', 'watchdog.ps1');
const write = (f, c) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); };

function runWatchdog(cfg, dir) {
  const cfgFile = path.join(dir, 'watchdog.json');
  write(cfgFile, JSON.stringify(cfg));
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', watchdog, '-ConfigFile', cfgFile], { windowsHide: true, encoding: 'utf8' });
}
const base = (dir, over = {}) => ({
  token: 't', oldPid: 999999, installDir: path.join(dir, 'install'), backupDir: path.join(dir, 'backup'),
  exePath: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe'),   // programa inofensivo que só imprime e sai
  healthFile: path.join(dir, 'healthy.json'), rollbackFile: path.join(dir, 'rollback.json'), logFile: path.join(dir, 'updater.log'),
  fromVersion: '1.0.0', toVersion: '1.0.1', timeoutSec: 6, ...over,
});
const setup = (dir) => {
  write(path.join(dir, 'install', 'VERSAO.txt'), 'NOVA 1.0.1');
  write(path.join(dir, 'install', 'arquivo-novo.txt'), 'só existe na versão nova');
  write(path.join(dir, 'backup', 'VERSAO.txt'), 'ANTIGA 1.0.0');
  write(path.join(dir, 'backup', 'resources', 'app.asar'), 'conteúdo .asar de mentira');
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rea-wd-'));
try {
  // 1) saudável
  let dir = path.join(root, 'saudavel'); setup(dir);
  write(path.join(dir, 'healthy.json'), JSON.stringify({ version: '1.0.1' }));
  runWatchdog(base(dir), dir);
  assert.equal(fs.readFileSync(path.join(dir, 'install', 'VERSAO.txt'), 'utf8'), 'NOVA 1.0.1', 'versão saudável não pode ser restaurada');
  assert.ok(!fs.existsSync(path.join(dir, 'rollback.json')));
  assert.match(fs.readFileSync(path.join(dir, 'updater.log'), 'utf8'), /saudável; nada a fazer/);
  assert.ok(!fs.existsSync(path.join(dir, 'backup')), 'o backup deve ser apagado quando a versão nova está saudável');
  console.log('OK: versão nova saudável -> nada restaurado e backup apagado');

  // 2) não abre -> rollback
  dir = path.join(root, 'quebrada'); setup(dir);
  runWatchdog(base(dir), dir);
  assert.equal(fs.readFileSync(path.join(dir, 'install', 'VERSAO.txt'), 'utf8'), 'ANTIGA 1.0.0', 'os arquivos da versão anterior devem voltar');
  assert.ok(!fs.existsSync(path.join(dir, 'install', 'arquivo-novo.txt')), 'arquivos só da versão nova devem sair');
  assert.ok(fs.existsSync(path.join(dir, 'install', 'resources', 'app.asar')), 'o app.asar deve ser restaurado');
  const rb = JSON.parse(fs.readFileSync(path.join(dir, 'rollback.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(rb.fromVersion, '1.0.0'); assert.equal(rb.toVersion, '1.0.1');
  assert.match(fs.readFileSync(path.join(dir, 'updater.log'), 'utf8'), /rollback concluído/);
  console.log('OK: nova versão sem ficar saudável -> rollback restaurou a versão anterior');
} finally { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} }
console.log('OK: vigia de atualização passou em todos os testes');
