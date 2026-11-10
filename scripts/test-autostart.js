'use strict';
// "Abrir junto com o Windows": a leitura precisa enxergar o item gravado com --hidden (src/autostart.js).
const assert = require('node:assert');
const autostart = require('../src/autostart');

// Simula o Electron no Windows: `openAtLogin` só é verdadeiro se os argumentos pedidos forem IGUAIS aos gravados;
// `executableWillLaunchAtLogin` ignora argumentos e é falso se a pessoa desativou o item no Gerenciador de Tarefas.
function fakeApp() {
  const st = { reg: null, approved: true };
  return {
    st,
    setLoginItemSettings({ openAtLogin, args = [], enabled = true }) {
      if (!openAtLogin) { st.reg = null; return; }
      st.reg = { args: [...args] };
      if (enabled) st.approved = true;
    },
    getLoginItemSettings(opt = {}) {
      const want = (opt.args || []).join(' ');
      const has = !!st.reg;
      return { openAtLogin: has && st.reg.args.join(' ') === want, executableWillLaunchAtLogin: has && st.approved };
    },
  };
}

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ', name); };

ok('o defeito antigo: ler sem argumentos dá "desligado" mesmo com o item gravado com --hidden', () => {
  const app = fakeApp(); app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
  assert.strictEqual(app.getLoginItemSettings().openAtLogin, false);
});
ok('ligar: grava com --hidden e a leitura diz "ligado"', () => {
  const app = fakeApp();
  assert.strictEqual(autostart.isOn(app), false);
  assert.strictEqual(autostart.set(app, true), true);
  assert.deepStrictEqual(app.st.reg.args, ['--hidden']);
  assert.strictEqual(autostart.isOn(app), true);
});
ok('desligar: remove o item', () => {
  const app = fakeApp(); autostart.set(app, true);
  assert.strictEqual(autostart.set(app, false), false);
  assert.strictEqual(app.st.reg, null);
});
ok('abrir as Configurações e Salvar sem mexer na caixa NÃO desliga mais (ler -> gravar o mesmo valor)', () => {
  const app = fakeApp(); autostart.set(app, true);
  const checkbox = autostart.isOn(app);          // o que a tela mostra ao abrir
  autostart.set(app, checkbox);                  // o que Salvar grava
  assert.strictEqual(autostart.isOn(app), true);
  assert.ok(app.st.reg);
});
ok('item de uma versão antiga (gravado com outros argumentos) também conta como ligado', () => {
  const app = fakeApp(); app.setLoginItemSettings({ openAtLogin: true, args: [] });
  assert.strictEqual(autostart.isOn(app), true);
});
ok('desativado em Gerenciador de Tarefas > Inicializar: aparece "desligado", e ligar de novo reativa', () => {
  const app = fakeApp(); autostart.set(app, true); app.st.approved = false;
  assert.strictEqual(autostart.isOn(app), false);
  assert.strictEqual(autostart.set(app, true), true);
});
ok('sem o campo executableWillLaunchAtLogin (outro sistema), usa openAtLogin', () => {
  const app = { getLoginItemSettings: () => ({ openAtLogin: true }), setLoginItemSettings() {} };
  assert.strictEqual(autostart.isOn(app), true);
});

console.log(`\n${n} verificações de abrir junto com o Windows: OK`);
