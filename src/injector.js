'use strict';
// Processo separado que injeta mouse/teclado (Electron utilityProcess).
// Importante: se a injeção ficasse no processo principal, um clique remoto nos botões da barra de título da janela
// do próprio programa (minimizar/maximizar/fechar) travaria tudo: o Windows espera o botão ser solto, mas quem
// soltaria o botão é o mesmo processo que está esperando. Aqui o processo é independente e não trava junto.
//
// Também hospeda o gancho de teclado de quem CONTROLA (src/keyhook.js): captura a tecla Windows, Alt+Tab etc. e as devolve à
// janela pela mesma porta, para irem ao outro computador.
const input = require('./input');
const keyhook = require('./keyhook');

function onEvent(ev) {
  try {
    if (ev.k === 'owner') return keyhook.setOwnerPid(ev.pid);                 // pid do processo principal (dono das janelas)
    if (ev.k === 'syskeys') {                                                  // ligar/desligar a captura de teclas do Windows
      if (ev.on) { if (keyhook.isOn()) keyhook.heartbeat(); else keyhook.setCapture(true); }
      else keyhook.setCapture(false);
      return;
    }
    input.handle(ev);
  } catch (err) { console.error('injector:', err && err.message); }
}

let rendererPort = null;
keyhook.setEmitter((m) => { try { if (rendererPort) rendererPort.postMessage(m); } catch {} });

process.parentPort.on('message', (e) => {
  if (e.data && e.data.k) onEvent(e.data);       // mensagens diretas do processo principal (ex.: soltar tudo ao sair)
  const port = e.ports && e.ports[0];
  if (!port) return;
  if (rendererPort) { try { keyhook.setCapture(false); } catch {} }           // janela recarregada: a captura anterior não vale mais
  rendererPort = port;
  port.on('message', (m) => onEvent(m.data));    // mensagens direto da janela (sem passar pelo processo principal)
  port.on('close', () => { if (rendererPort === port) { rendererPort = null; try { keyhook.setCapture(false); } catch {} } });
  port.start();
});
