# Arquitetura

Aplicativo Electron (Windows) com uma interface em HTML/CSS/JS e módulos de lógica pura testáveis fora do Electron.

## Processos e arquivos

| Parte | Arquivo(s) | Função |
|---|---|---|
| Processo principal | `src/main.js` | Janela, bandeja, instância única, captura de tela (`desktopCapturer`), monitores (`screen`), ajuste da janela, ponte (IPC) com a interface |
| Interface | `src/renderer/`, `ui/` | Telas, WebRTC (conexão, vídeo, canal de dados), histórico, exibição, conversa. `renderer.js` é o arquivo principal; o visual (CSS, ícones, fonte) vem de `ui/` (veja "Interface (visual)") |
| Injetor de entrada | `src/injector.js`, `src/input.js` | Processo separado (`utilityProcess`) que injeta mouse e teclado com `SendInput` (via `koffi`) e esconde o ponteiro |
| Servidor de conexão | `server/server.js`, `src/net.js` | Apresenta um computador ao outro; embutido no app (rede local) ou hospedado (internet) |
| Atualizador | `src/updater.js`, `src/watchdog.ps1` | `electron-updater` com backup, vigia e rollback |
| Lógica pura | `src/monitors.js`, `src/renderer/{history,viewmode,migrations}.js` | Sem DOM nem Electron; testada em `scripts/test-*.js` |

**Por que a entrada roda em outro processo:** um clique remoto nos botões da barra de título da própria janela (minimizar, maximizar, fechar)
faz o Windows esperar o botão ser solto. Se a injeção ficasse no processo principal, quem solta o botão seria o mesmo processo que está
esperando, e mouse e teclado remotos travariam. A janela fala com o injetor por um `MessagePort` direto, sem passar pelo processo principal.

## Interface (visual)

A interface é HTML e JS puros (sem framework). O visual vem de arquivos gerados por `npm run build:ui` (script `scripts/build-ui.js`) em
`src/renderer/assets/` (ignorada pelo git; `npm start`, `npm run dist` e o pipeline de publicação chamam o build sozinhos).

| Fonte | Gera | Conteúdo |
|---|---|---|
| `ui/app.css` + `ui/*.css` | `assets/app.css` | Tailwind v4 (só o tema e os utilitários, sem o reset), **tokens** e um CSS por área: `shell` (barra de título), `components`, `home`, `states`, `session`, `dialog`, `viewwin` |
| `ui/entry.js` | `assets/ui.js` | Ícones **Lucide** (só os usados) e **Motion** (animações de entrada), expostos como `window.REA_UI` |
| `@fontsource-variable/inter` | `assets/fonts/` | Fonte Inter copiada para o pacote; nada vem de CDN |

- **Tokens:** variáveis CSS com os nomes do shadcn/ui (`--background`, `--surface`, `--border`, `--primary`…), escala de texto, espaçamento
  (base 4 px), raios (8, 10 e 12 px), sombras e tempos de animação. `scripts/test-contrast.js` confere o contraste dos tokens (AA) nos dois temas.
- **Tema:** escuro (padrão), claro ou do sistema. A preferência fica em `%APPDATA%\rea-desk\theme.json`, lida pelo processo principal, que
  ajusta `nativeTheme.themeSource`; o Chromium repassa isso à página como `prefers-color-scheme`, que é o que o CSS usa. Canais IPC
  `theme-get` e `theme-set` (só visuais).
- **Janela:** `titleBarStyle: 'hidden'` com `titleBarOverlay` (botões nativos do Windows com as cores do tema, altura 40 px), cor de fundo
  conforme o tema e exibição em `ready-to-show`, para não piscar em branco ao abrir. O cabeçalho da interface é a barra de título e arrasta
  a janela.
- **CSP:** continua `style-src 'self'; script-src 'self'`; nada é inline.
- **Movimento:** transições de 150 a 250 ms; com `prefers-reduced-motion` as animações ficam instantâneas (o anel de "conectando" gira mais devagar).

## Conexão

1. Cada janela se registra no servidor de conexão (WebSocket) e recebe/guarda um código de 9 dígitos (`myId`).
2. Mensagens com o servidor (JSON): `register` → `registered`; `call` → `incoming` (com o nome do computador); `answer` → `answered`;
   `sig` (dados de WebRTC, encaminhados só entre computadores com chamada em andamento); `bye`; `error`.
3. Quem é acessado aceita e passa a ser o "host": captura a tela e abre a conexão WebRTC (oferta); quem controla responde.
4. Depois disso nada de imagem ou entrada passa pelo servidor.

## Canal de dados (WebRTC), mensagens `{k: ...}`

| `k` | Sentido | Função |
|---|---|---|
| `mouse`, `key` | controlador → host | Entrada. O mouse vai em coordenadas normalizadas (0 a 1) da imagem, com `mon` (monitor visto) |
| `release` | controlador → host | Soltar teclas e botões presos (ex.: janela minimizada) |
| `refresh` | controlador → host | Pedir um quadro novo (o host desliga e liga o envio do vídeo) |
| `cursor` / `cursorstate` | controlador → host / host → controlador | Esconder ou mostrar o ponteiro do host / estado atual |
| `monitors` | host → controlador | Lista de monitores, o selecionado, e as janelas (`views`) |
| `monitor` | controlador → host | Trocar o monitor da janela principal |
| `view` | controlador → host | Janela extra: `op` = `open`, `set` ou `close` |
| `chat` | os dois | Mensagem de conversa |
| `clip`, `clipreq` | os dois | `clip` com `auto: true` é a cópia automática (veja abaixo). Sem `auto` e `clipreq` eram dos botões manuais, que foram removidos; continuam aceitos para versões antigas |
| `clipsync` | host → controlador | `ok`: o computador controlado permitiu arquivos e textos (se não, o controlador nem envia a cópia automática e o gerenciador de arquivos não abre); `fs: true`: este host tem o gerenciador de arquivos (versão nova) |
| `fsls`, `fsget`, `fsput`, `fsend`, `fsdone`, `fscancel` | controlador → host (pedidos), host → controlador (respostas) | Gerenciador de arquivos, com `id` por pedido (veja "Gerenciador de arquivos"). Os pedaços do arquivo vão em mensagens **binárias** `[id 4 bytes][até 64 KB]`, nos dois sentidos |
| `file`, `fileend` | (removidas) | Envio antigo, com uma pergunta por arquivo, que existia nos dois sentidos até a 0.8.x; versões novas as ignoram |

Mensagens desconhecidas são ignoradas, então versões diferentes continuam funcionando (por exemplo, o botão de segunda janela só aparece se o
host mandar `views`; sem `mon`, o mouse vai para o monitor selecionado).

## Área de transferência automática

Cada lado lê a própria área de transferência a cada ~0,6 s (`clipPoll` em `renderer.js`, via o canal `clip-read` que já existia) e, se o texto
mudou, envia `{k:'clip', text, auto:true}`. Quem recebe grava na sua (`clip-write`) e guarda o texto em `clipLast`, que impede o eco de voltar;
um contador (`clipEpoch`) descarta leituras que ficaram velhas durante a gravação. A primeira leitura da sessão só marca o que já estava copiado.
O host só participa com `perms.files` e avisa o controlador por `clipsync`; nenhum canal IPC novo.

## Gerenciador de arquivos

- **Disco** (`src/files.js`, processo principal; IPC `fs-list`, `fs-read-open`/`fs-read`/`fs-read-close`, `fs-write-open`/`fs-write`/`fs-write-close`, `fs-close-all`; todas respondem
  `{ ok:true, ... }` ou `{ ok:false, err:'codigo' }`): lista pastas (`''` = Início: pastas conhecidas e discos; pastas primeiro; no máximo 1500 itens), lê em blocos de 256 KB e grava em
  `nome.rea-part` com `wx` (nunca sobrescreve), renomeando só ao conferir o tamanho combinado. O nome recebido vira só o nome do arquivo (`safeName`: sem pastas, sem caracteres e nomes
  reservados do Windows). Nada é gravado além do tamanho anunciado; limite de 4 GB. `closeAll` (fim da sessão e `before-quit`) apaga o que ficou pela metade.
- **Janela e protocolo** (`src/renderer/filemgr.js`, lógica pura em `fmcore.js`): só **quem controla** tem janela e botões. O computador controlado só responde, e **só se `perms.files`** (a
  conferência está no início de `hostHandle`; sem permissão, todo pedido é recusado com `nao-permitido`, inclusive os forjados). As listas do lado remoto vão em `fsls` (cortadas para caber em
  ~180 KB), `fsget` pede um arquivo (o host responde `{ok,name,size}`, manda os pedaços binários e fecha com `fsend`), `fsput` anuncia um envio (o host abre o destino e responde; o controlador
  manda os pedaços e `fsend`; o host confere, renomeia e responde `fsdone`), `fscancel` desiste. Os pedaços respeitam a contrapressão do canal (`bufferedAmount`). Uma transferência por vez no controlador (no host,
  até 8 abertas). Destino: **Enviar** grava na pasta aberta **na metade direita**; **Receber** grava na pasta aberta **na metade esquerda**.
- Quem controla com um host de versão antiga (sem `fs: true` em `clipsync`) recebe um aviso para atualizar os dois computadores; o envio antigo (`file`/`fileend`) foi removido.

## Computadores de confiança

Código em `renderer.js` (bloco "Computadores de confiança") e lógica pura em `src/renderer/trust.js` (testada em `scripts/test-trust.js`). O servidor de conexão
**não mudou**: as provas vão em mensagens `sig`, que ele já encaminha entre quem tem uma chamada ligada.

1. **Combinar (uma vez):** o computador controlado aceita com **Lembrar** marcado, gera um segredo de 256 bits e o envia pelo canal de dados (`{k:'trust', secret}`,
   criptografado e direto entre os dois). O controlador o guarda e responde `{k:'trustok'}`; só então o computador controlado guarda o controlador como
   confiável. Chaves do `localStorage`: `trustedControllers` (quem pode entrar sem perguntar: segredo, nome, permissões, último uso) e `trustedHosts` (segredo de
   cada computador que lembrou este).
2. **Pedido seguinte:** `incoming` de um código confiável não abre a janela de pedido. O computador controlado manda `sig {trust:'challenge', nonce}` (nonce novo, 128 bits);
   o controlador responde `sig {trust:'proof', mac}` com `HMAC-SHA-256(segredo, "call|nonce|códigoControlado|códigoControlador")`. Prova certa: aceita sozinho
   (`acceptAutomatically`). Prova errada, ausente (5 s) ou de quem não tem segredo: o pedido aparece com aviso.
3. **Prova do canal:** num acesso automático as permissões começam zeradas. Quando o canal de dados abre, o computador controlado manda `{k:'auth', nonce}` e o
   controlador responde `{k:'authok', mac}` com `HMAC(segredo, "chan|nonce|impressãoDigitalDTLSControlado|impressãoDigitalDTLSControlador|códigos")`
   (impressões digitais lidas do SDP). Só com a prova certa as permissões combinadas são liberadas (`grantPerms`); sem ela, em 8 s, o acesso é encerrado. Isso amarra a
   prova à conexão real e impede que um servidor de conexão adulterado repita a prova do pedido numa sessão que ele controla.
4. O segredo nunca passa pelo servidor de conexão depois de combinado, e a comparação das provas é em tempo constante.

## Teclas do Windows (gancho de teclado)

O Windows trata Win, Alt+Tab, Ctrl+Esc etc. antes de o programa vê-las. O processo de entrada de **quem controla** (`src/injector.js`) instala um gancho
`WH_KEYBOARD_LL` (`src/keyhook.js`, via `koffi`) **só enquanto** o renderer pede (`{k:'syskeys', on}`): papel de controlador, **Controlar** ligado e foco do
teclado na imagem (`wantSysKeys` em `renderer.js`, que renova o pedido a cada ~1 s; sem renovação o gancho cai sozinho em 3 s). A decisão tecla a tecla é
pura e testada (`src/syskeys.js`): engole Win (e qualquer tecla com Win apertada), Alt+Tab/Esc/Espaço/F4, Ctrl+Esc e Ctrl+Shift+Esc, e devolve
`{k:'syskey', code, down}` pela mesma porta da janela, que as envia como as demais teclas (`{k:'key'}`). Só age se a janela em primeiro plano for do
processo principal (`{k:'owner', pid}`) e ignora as teclas que o próprio programa injeta (marca em `dwExtraInfo`, `INJECT_MARK` em `input.js`). O mapa
de teclas ficou em `src/keys.js` (nos dois sentidos). Nenhum canal IPC novo no processo principal; no canal de dados nada mudou.

## Vários monitores

- O processo principal lê os monitores, converte para **pixels físicos** da área de trabalho virtual (`screen.dipToScreenRect`) e guarda qual
  está selecionado (cada sessão começa no principal). Eventos de conexão, desconexão e mudança de métricas disparam uma atualização com
  atraso de 300 ms.
- **Captura:** só o monitor escolhido (`desktopCapturer` por `display_id`). Trocar de monitor captura de novo e usa `replaceTrack`, sem
  renegociar o WebRTC.
- **Mouse:** `monitors.mapMouse` converte (monitor, x, y) em coordenada absoluta do `SendInput` com `MOUSEEVENTF_VIRTUALDESK`. Um `mon` que não
  existe mais descarta o evento.
- **Hot-plug:** se o monitor visto some, o host volta ao principal e avisa (`reason: 'lost'`); mudança de resolução, orientação ou escala do
  monitor transmitido reinicia a captura.
- `REA_TEST_MONITORS_FILE` (somente testes): arquivo JSON com a lista de monitores simulada.

### Segunda janela

Continua **uma sessão**. O host captura o segundo monitor e manda uma **segunda faixa de vídeo** na mesma conexão (`addTrack` / `removeTrack` e
renegociação). A janela extra é um `about:blank` aberto pelo processo principal (`setWindowOpenHandler`) e montado pelo mesmo código da
janela principal, que reaproveita a conexão e a entrada (`attachInput`). O controlador liga cada faixa à janela certa pelo id do stream
(`views: [{slot, monitor, streamId}]` na mensagem `monitors`). O host recusa o mesmo monitor nas duas janelas.

## Captura e ponteiro do mouse

O ponteiro vai embutido no vídeo e o Chromium não permite desligá-lo (as restrições `cursor` são ignoradas). Para esconder, `src/input.js`
troca os ponteiros do sistema por um transparente (`SetSystemCursor`) e restaura com `SystemParametersInfo(SPI_SETCURSORS)`. Um arquivo-marca
(`cursor-hidden.flag`, na pasta de dados) é gravado antes de esconder: se o programa for encerrado à força, o próximo início restaura os ponteiros.

## Exibição

`src/renderer/viewmode.js` calcula o tamanho da imagem no modo **reduzida**: `min(largura da área / largura do vídeo, altura da área / altura
do vídeo, 1 / devicePixelRatio)`. Um `ResizeObserver` recalcula quando a área muda. O ajuste da janela (`fit-window` no processo principal)
limita ao `workArea` do monitor onde a janela está.

## Atualização automática

- `electron-updater` com o provedor **GitHub** (`package.json`, `build.publish`). `autoDownload` desligado: o app baixa só depois de checar se a
  versão não está na lista de versões ruins. O download é incremental (`.blockmap`) e conferido pelo `sha512` do `latest.yml`.
- **Quando instala:** correção pequena (só o último número) é instalada sozinha se a opção estiver ligada e não houver acesso remoto; senão,
  pergunta. Notas da Release com `[silencioso]` ou `[perguntar]` forçam um dos dois. Sair do programa com atualização pronta instala.
- **Backup e vigia:** antes de instalar, `robocopy` copia a versão atual para `%LOCALAPPDATA%\rea-desk-rollback\backup` e inicia o vigia
  (`watchdog.ps1`, copiado para fora da pasta de instalação). Ele é iniciado por um `cmd.exe` desacoplado: processos filhos do Node morrem
  junto com o app, e o PowerShell não inicia com `detached`.
- **Saúde:** a versão nova grava `healthy.json` depois de carregar a tela e ficar viva ~8 s. Sem isso em 240 s
  (`REA_WATCHDOG_TIMEOUT_SEC` só para testes), o vigia encerra a versão nova, restaura o backup com `robocopy`, ajusta a versão em "Aplicativos
  instalados" e reabre o programa. A versão ruim vai para `blocked.json` e não é baixada de novo.
- Arquivos do atualizador em `%APPDATA%\rea-desk\updater`: `updater.log`, `blocked.json`, `pending.json`, `healthy.json`, `rollback.json`,
  `settings.json`, `watchdog.json`, `watchdog.ps1`.
- Em desenvolvimento (`npm start`) o atualizador fica desligado; `REA_UPDATER_DEV=1` o liga (com um `dev-app-update.yml`).

## Dados do usuário

Ficam em `%APPDATA%\rea-desk` (o nome vem do campo `name` do `package.json`; **não o altere**, ou os dados deixam de ser encontrados) e nunca na
pasta de instalação, então sobrevivem às atualizações.

| Chave (`localStorage`) | Conteúdo |
|---|---|
| `myId`, `name`, `welcomed` | Código, nome do computador, boas-vindas já vistas |
| `server`, `stun` | Servidor de conexão e STUN personalizados (vazio = automático) |
| `history` | Computadores acessados (JSON, até 20) |
| `viewMode`, `autoFit`, `chatHidden`, `dockCollapsed` | Exibição, ajuste da janela, conversa escondida, barra de controles recolhida |
| `dataVersion` | Versão do formato dos dados |

**Migração:** `src/renderer/migrations.js`. Para mudar o formato de algum dado, aumente `CURRENT` e acrescente um passo. Os passos só ajustam ou
acrescentam chaves e nunca apagam; dados de uma versão mais nova (depois de um rollback) ficam como estão. O Chromium grava o `localStorage`
com atraso, então o app pede a gravação logo após cada mudança (`flush-storage`).

## Observação sobre a origem

O REA (ferramenta de engenharia reversa) foi usado só para uma inspeção estática do AnyDesk instalado (binário empacotado, sem tabela de
imports). A saída ficou local e não faz parte do app nem do repositório.
