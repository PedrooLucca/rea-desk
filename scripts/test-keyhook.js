'use strict';
// Gancho de teclado real (Windows): instala, remove e desliga sozinho sem renovação. Não injeta nenhuma tecla.
if (process.platform !== 'win32') { console.log('OK: (pulado: só existe no Windows)'); process.exit(0); }
const assert = require('node:assert');
const kh = require('../src/keyhook');

(async () => {
  assert.strictEqual(kh.isOn(), false);
  kh.setOwnerPid(process.pid);
  if (!kh.setCapture(true)) {                                // ambiente sem área de trabalho interativa (ex.: alguns servidores de integração)
    console.log('OK: (pulado: este ambiente não permite instalar o gancho de teclado)'); process.exit(0);
  }
  assert.strictEqual(kh.isOn(), true);
  console.log('OK   instala o gancho de teclado');
  kh.setCapture(false);
  assert.strictEqual(kh.isOn(), false);
  console.log('OK   remove o gancho');
  kh.setCapture(true); kh.setCapture(true);               // ligar duas vezes não instala duas vezes
  kh.setCapture(false);
  assert.strictEqual(kh.isOn(), false);
  console.log('OK   ligar duas vezes e desligar uma vez deixa tudo desligado');
  kh.setCapture(true);
  await new Promise((r) => setTimeout(r, 1500)); kh.heartbeat();
  await new Promise((r) => setTimeout(r, 1800));
  assert.strictEqual(kh.isOn(), true, 'com renovação deveria continuar ligado');
  console.log('OK   renovando o pedido, continua ligado');
  await new Promise((r) => setTimeout(r, 3500));            // sem renovação por mais de 3 s
  assert.strictEqual(kh.isOn(), false, 'sem renovação deveria desligar sozinho');
  console.log('OK   sem renovação (janela travada ou fechada) desliga sozinho em 3 s');
  console.log('OK: gancho de teclado passou em todos os testes');
  process.exit(0);
})().catch((e) => { kh.stop(); console.error('FALHA', e.message); process.exit(1); });
