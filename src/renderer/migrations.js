'use strict';
// Migração dos dados do usuário (localStorage, que fica em AppData e nunca é apagado nas atualizações).
// Regras: cada passo é idempotente e só ADICIONA/AJUSTA chaves; nunca apaga dados do usuário.
// Se os dados forem de uma versão MAIS NOVA (ex.: depois de um rollback), nada é alterado: versões antigas ignoram chaves novas.
(function (root) {
  const CURRENT = 1;
  const steps = {
    // 0 -> 1: versões anteriores não tinham "dataVersion". Quem já usava o programa não deve ver a boas-vindas de novo.
    1(s) {
      const jaUsava = s.getItem('myId') || s.getItem('name') || s.getItem('server') !== null || s.getItem('stun') !== null;
      if (jaUsava && !s.getItem('welcomed')) s.setItem('welcomed', '1');
    },
    // Exemplo para o futuro:
    // 2(s) { /* renomear/converter uma chave aqui */ },
  };
  function run(storage) {
    let v = parseInt(storage.getItem('dataVersion') || '0', 10) || 0;
    if (v > CURRENT) return v;                      // dados mais novos que este programa: não mexer
    for (let n = v + 1; n <= CURRENT; n++) { steps[n](storage); storage.setItem('dataVersion', String(n)); }
    return CURRENT;
  }
  const api = { CURRENT, run, steps };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.REA_MIGRATIONS = api;
})(typeof window !== 'undefined' ? window : globalThis);
