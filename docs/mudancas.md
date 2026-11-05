# Histórico de mudanças

Mais recente primeiro. Os instaladores e as notas de cada versão ficam em [Releases](https://github.com/PedrooLucca/rea-desk/releases).

## Próxima versão (ainda não lançada)

- **Novo visual:** tema escuro (padrão), claro e do sistema, cantos arredondados, acento azul, fonte Inter, ícones Lucide e animações curtas
  (respeitam "reduzir movimento"). Barra de título própria, sem flash branco ao abrir.
- **Sessão remota:** barra de controles flutuante e recolhível, indicador de qualidade e atraso, atalhos `Ctrl+Alt+Shift` + letra e lista de atalhos.
- **Estados de conexão** com retorno visual (conectando, conectado, reconectando, erro) e diálogos novos (foco, `Tab` preso, `Esc`).
- Só a interface mudou; conexão, rede, captura de tela e os canais IPC existentes seguem iguais (há dois canais novos, só do tema).

## 0.5.1

- **Corrige o piscar da imagem.** O vigia de "imagem congelada" recolocava o vídeo na tela quando a tela remota estava parada (e a cada foco ou
  redimensionamento da janela), o que aparecia como um piscar. Agora o vigia só age quando você controla com o ponteiro remoto visível, primeiro
  só pede um quadro novo ao outro computador, e foco e redimensionamento não recarregam mais nada.

## 0.5.0

- **Histórico de computadores acessados** na tela inicial (conectar com um clique, favoritos, renomear, remover, limpar).
- **Duas janelas, um monitor em cada**, na mesma sessão (uma segunda faixa de vídeo pela mesma conexão).
- **Ocultar / mostrar a conversa**, com contador de mensagens não lidas.
- **Exibição reduzida / esticada** (padrão: reduzida, sem ampliar a imagem).
- **Ajuste automático da janela** ao tamanho da tela remota ao conectar, botão **Ajustar janela** e opção nas Configurações.
- Os dados passam para a versão 2 (nova chave `history`), com migração automática.

## 0.4.0

- **Vários monitores:** lista de monitores, troca de monitor sem reconectar, mouse mapeado por monitor (coordenadas negativas, resoluções e DPIs
  diferentes) e tratamento de hot-plug (monitor conectado, desconectado ou com resolução/orientação alterada).

## 0.3.1

- Sem mudanças funcionais; usada para validar a atualização automática.

## 0.3.0

- **Atualização automática** (GitHub Releases + `electron-updater`): verifica ao abrir e a cada 4 horas, download incremental, instala sem
  administrador, atualiza sozinho correções pequenas, faz backup e **rollback automático** se a versão nova não ficar saudável.
- Migração dos dados do usuário e publicação automática por GitHub Actions (`npm run release`).

## Até a 0.2.4

- Instalador de um clique (NSIS, por usuário, sem pedir administrador), com atalho na Área de Trabalho e no Menu Iniciar.
- Servidor de conexão **embutido** com descoberta automática na rede local (`src/net.js`); servidor na internet opcional via `config/defaults.json`.
- Interface em linguagem simples: "Quero receber ajuda" / "Quero ajudar alguém", código em vez de "ID", avisos de golpe, mensagens de erro com o que fazer.
- Tela de boas-vindas no primeiro uso (nome do computador com valor padrão); configurações técnicas em "Avançado".
- Ícone na bandeja (fechar a janela não encerra o programa), instância única, opção de abrir junto com o Windows e aviso ao receber um pedido.
- Nome do computador no pedido de acesso, detecção de conexão que cai e tempo limite para pedido sem resposta.
- Correção do clipboard (API assíncrona do Electron 45).
- Minimizar ou trocar de janela solta as teclas e botões presos no outro computador e impede o Windows/Chromium de reduzir a prioridade da sessão.
- Clique remoto nos botões da janela do próprio programa travava o mouse e o teclado remotos; a injeção de entrada passou a rodar em um processo
  separado (`src/injector.js`).
- Opção **Mostrar o mouse do outro computador**, com restauração do ponteiro ao encerrar, sair, cair ou reabrir o programa.
- Botão **Atualizar imagem** e recuperação automática de imagem congelada.
