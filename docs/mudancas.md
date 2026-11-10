# Histórico de mudanças

Mais recente primeiro. Os instaladores e as notas de cada versão ficam em [Releases](https://github.com/PedrooLucca/rea-desk/releases).

## 0.8.1

- **Abrir junto com o Windows voltou a funcionar:** a caixa em **Configurações** aparecia sempre desmarcada, mesmo com o programa registrado para abrir com o Windows, e ao
  clicar em **Salvar** (por qualquer motivo) ele era **removido** da inicialização. Agora a caixa mostra o estado real e salvar não desliga mais a opção. Se você a tinha
  ligado antes, abra **Configurações**, confira se a caixa está marcada (ligue de novo se precisar) e clique em **Salvar**. O programa abre escondido na bandeja.
- Se você desativou o REA Desk em **Gerenciador de Tarefas → Inicializar**, a caixa aparece desmarcada; ligá-la de novo reativa o item.
- Os testes automáticos passam a conferir essa leitura e gravação.

## 0.8.0

- **Entrar sem pedir permissão toda vez:** ao permitir um acesso, marque **Lembrar este computador** (vem desmarcado). Nas próximas vezes esse computador entra sozinho, com as
  mesmas permissões, sem você precisar clicar em **Permitir**. A janela sobe e avisa que o acesso foi automático. Vale só para o computador lembrado (não basta saber o código):
  os dois guardam um segredo e a cada pedido o seu computador confere uma prova. Se a conferência falhar, o pedido aparece normalmente, com um aviso. Para remover, vá em
  **Configurações → Computadores de confiança**.
- **Teclas do Windows no computador controlado:** com o foco na imagem do outro computador, a tecla **Windows** (e Win+letra), **Alt+Tab**, **Alt+Esc**, **Alt+Espaço**, **Alt+F4**,
  **Ctrl+Esc** e **Ctrl+Shift+Esc** agem no computador controlado e não no seu. Fora da imagem, o Windows local continua com elas.
- **Atenção:** nesta versão o gancho de teclado do Windows pode fazer algum antivírus desconfiar; ele só fica ligado enquanto o foco está na imagem do outro computador e não guarda o que é digitado.
- Os testes automáticos passam a conferir também as regras das teclas do Windows e os computadores de confiança.

## 0.7.1

- Saem da barra de controles os botões **Ajustar janela** e **Tela cheia** (e o atalho `Ctrl+Alt+Shift+F`), e também o botão **Tela cheia** da janela do
  segundo monitor. O ajuste automático da janela ao conectar continua, com a opção nas Configurações.

## 0.7.0

- **Área de transferência compartilhada:** o que for copiado em um computador pode ser colado no outro, nos dois sentidos e sem botões (texto).
  Respeita a permissão **Arquivos e textos** e não envia o que já estava copiado antes do acesso. Os botões **Copiar texto para lá** e **Trazer texto de lá**
  deixaram de existir (a sincronização é sempre automática, sem botão de pausa).

## 0.6.1 (inclui o conteúdo da 0.6.0, que não chegou a ser publicada)

- **Novo visual:** tema escuro (padrão), claro e do sistema, cantos arredondados, acento azul, fonte Inter, ícones Lucide e animações curtas
  (respeitam "reduzir movimento"). Barra de título própria, sem flash branco ao abrir.
- **Sessão remota:** barra de controles flutuante e recolhível, indicador de qualidade e atraso, atalhos `Ctrl+Alt+Shift` + letra e lista de atalhos.
- **Estados de conexão** com retorno visual (conectando, conectado, reconectando, erro) e diálogos novos (foco, `Tab` preso, `Esc`).
- **Pipeline:** o teste de contraste dependia da quebra de linha do arquivo e falhou no Windows do GitHub (CRLF); por isso a 0.6.0 não foi
  publicada e esta versão a substitui.
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
