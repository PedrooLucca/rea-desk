'use strict';
// "Abrir junto com o Windows". O programa é registrado com o argumento --hidden (abre escondido na bandeja).
//
// Cuidado importante: no Windows, `app.getLoginItemSettings().openAtLogin` compara o comando gravado com o executável SEM argumentos
// (o padrão de `args` é []). Como o registro leva `--hidden`, a leitura sem argumentos dava sempre "desligado": a caixa em
// Configurações aparecia desmarcada e, ao Salvar (por qualquer motivo), o programa era REMOVIDO da inicialização do Windows.
// Por isso a leitura usa os mesmos argumentos da gravação e `executableWillLaunchAtLogin` (que ignora argumentos e também
// diz "desligado" se a pessoa desativou o programa em Gerenciador de Tarefas > Inicializar).
const ARGS = ['--hidden'];

function isOn(app) {
  const s = app.getLoginItemSettings({ args: ARGS }) || {};
  return typeof s.executableWillLaunchAtLogin === 'boolean' ? s.executableWillLaunchAtLogin : !!s.openAtLogin;
}

function set(app, on) {
  // enabled: true também reativa o item se a pessoa o tinha desativado em Gerenciador de Tarefas > Inicializar
  app.setLoginItemSettings({ openAtLogin: !!on, args: ARGS, enabled: true });
  return isOn(app);
}

module.exports = { ARGS, isOn, set };
