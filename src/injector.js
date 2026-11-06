'use strict';
// Processo separado que injeta mouse/teclado (Electron utilityProcess).
// Importante: se a injeção ficasse no processo principal, um clique remoto nos botões da barra de título da janela
// do próprio programa (minimizar/maximizar/fechar) travaria tudo: o Windows espera o botão ser solto, mas quem
// soltaria o botão é o mesmo processo que está esperando. Aqui o processo é independente e não trava junto.
const input = require('./input');

function onEvent(ev) {
  try { input.handle(ev); } catch (err) { console.error('injector:', err && err.message); }
}

process.parentPort.on('message', (e) => {
  if (e.data && e.data.k) onEvent(e.data);       // mensagens diretas do processo principal (ex.: soltar tudo ao sair)
  const port = e.ports && e.ports[0];
  if (!port) return;
  port.on('message', (m) => onEvent(m.data));    // mensagens direto da janela (sem passar pelo processo principal)
  port.start();
});
