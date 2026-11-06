'use strict';
// Regras da captura de teclas do Windows (lógica PURA, testada em scripts/test-syskeys.js).
//
// Problema: o Windows trata a tecla Windows, Alt+Tab, Ctrl+Esc etc. ANTES de o programa ver a tecla, então elas agiam no computador
// de quem controla e nunca chegavam ao computador controlado. Com a captura ligada (só quando o foco está na imagem do outro
// computador), o gancho de teclado (src/keyhook.js) pergunta a este motor, tecla por tecla, o que fazer:
//   swallow: o Windows local NÃO recebe a tecla;   forward: { code, down } vai para o outro computador.
// As demais teclas seguem o caminho normal (a janela as recebe e envia).

const VK = {
  TAB: 0x09, ESC: 0x1b, SPACE: 0x20, F4: 0x73, LWIN: 0x5b, RWIN: 0x5c,
  LSHIFT: 0xa0, RSHIFT: 0xa1, LCTRL: 0xa2, RCTRL: 0xa3, LALT: 0xa4, RALT: 0xa5, SHIFT: 0x10, CTRL: 0x11, ALT: 0x12,
};
const isWin = (vk) => vk === VK.LWIN || vk === VK.RWIN;
const isAlt = (vk) => vk === VK.LALT || vk === VK.RALT || vk === VK.ALT;
const isCtrl = (vk) => vk === VK.LCTRL || vk === VK.RCTRL || vk === VK.CTRL;
const isShift = (vk) => vk === VK.LSHIFT || vk === VK.RSHIFT || vk === VK.SHIFT;

function createEngine(codeFromVk) {
  let on = false;
  const held = new Set();          // modificadores pressionados agora (vk)
  const winHeld = new Set();       // teclas Windows que NÓS seguramos (capturadas)
  const taken = new Map();         // vk -> code das teclas cujo "pressionar" foi capturado (o "soltar" também precisa ser)

  const anyHeld = (test) => { for (const v of held) if (test(v)) return true; return false; };

  // Qual combinação é do Windows e precisa ir para o outro computador? (com a tecla Windows apertada, QUALQUER tecla)
  function wanted(vk) {
    if (isWin(vk) || winHeld.size) return true;
    const alt = anyHeld(isAlt), ctrl = anyHeld(isCtrl), shift = anyHeld(isShift);
    if (alt && !ctrl && (vk === VK.TAB || vk === VK.ESC || vk === VK.SPACE || vk === VK.F4)) return true;   // Alt+Tab, Alt+Esc, Alt+Espaço, Alt+F4
    if (ctrl && !alt && vk === VK.ESC) return true;                                                          // Ctrl+Esc e Ctrl+Shift+Esc (gerenciador de tarefas)
    void shift;
    return false;
  }

  return {
    get on() { return on; },
    // Liga ou desliga a captura. Ao desligar devolve as teclas "soltar" que faltam enviar ao outro computador.
    setCapture(value) {
      value = !!value;
      if (value === on) return [];
      on = value;
      if (on) return [];
      const ups = [...taken.values()].map((code) => ({ code, down: false }));
      taken.clear(); winHeld.clear();
      return ups;
    },
    // ev: { vk, ext, up, ours, fg }  (ours = tecla injetada por este programa; fg = a janela em primeiro plano é do programa)
    // devolve { swallow, forward }
    key(ev) {
      const pass = { swallow: false, forward: null };
      if (ev.ours) return pass;                                           // o que injetamos no OUTRO computador não pode voltar
      const { vk, up } = ev;
      // modificadores: acompanha sempre, mesmo desligado, para saber o estado quando a captura ligar
      if (isAlt(vk) || isCtrl(vk) || isShift(vk)) { if (up) held.delete(vk); else held.add(vk); }
      if (!on || !ev.fg) {
        // fora de captura nada é engolido; se sobrou tecla capturada, o "soltar" dela ainda passa pelo caminho normal
        if (up && taken.has(vk)) { const code = taken.get(vk); taken.delete(vk); winHeld.delete(vk); return { swallow: true, forward: { code, down: false } }; }
        return pass;
      }
      if (up) {
        if (!taken.has(vk)) return pass;                                  // não capturamos o "apertar" desta tecla: o "soltar" segue normal
        const code = taken.get(vk); taken.delete(vk); winHeld.delete(vk);
        return { swallow: true, forward: { code, down: false } };
      }
      if (!wanted(vk)) return pass;
      const code = codeFromVk(vk, !!ev.ext);
      if (!code) return pass;                                             // tecla sem equivalente no outro computador: deixa passar
      taken.set(vk, code);
      if (isWin(vk)) winHeld.add(vk);
      return { swallow: true, forward: { code, down: true } };
    },
    // modificadores que já estavam apertados quando a captura ligou (ex.: Alt segurado)
    seed(vks) { for (const v of vks) if (isAlt(v) || isCtrl(v) || isShift(v)) held.add(v); },
    // estado interno (para testes e diagnóstico)
    state() { return { on, held: [...held], win: [...winHeld], taken: [...taken.keys()] }; },
  };
}

module.exports = { createEngine, VK };
