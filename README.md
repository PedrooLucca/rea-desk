# REA Desk

Acesso remoto simples para Windows: a pessoa que precisa de ajuda passa um **código**, quem ajuda digita o código,
a pessoa clica em **Permitir** e pronto: tela, mouse, teclado, texto copiado, arquivos e conversa.

## Para o usuário final

1. Baixe `REA-Desk-Instalar-x.y.z.exe` e dê dois cliques. Não precisa instalar mais nada.
2. Se o Windows mostrar "O Windows protegeu seu computador", clique em **Mais informações → Executar assim mesmo**
   (acontece porque o instalador ainda não tem assinatura digital paga; veja "Limitações").
3. Quem quer ajuda: diz o código da tela. Quem ajuda: digita o código e clica em **Conectar**.

## Para você: gerar o instalador

Precisa de Node.js 22+ no computador onde você gera (o usuário final **não** precisa).

```bash
npm install
npm run dist
```

O instalador sai em `dist\REA-Desk-Instalar-<versão>.exe` (~116 MB, já com Electron e bibliotecas dentro).
Para só gerar a pasta sem instalador (testes): `npm run dist:dir` → `dist\win-unpacked\REA Desk.exe`.
Para testar o código sem empacotar: `npm start`. Testes do servidor: `npm test`.

## Atualização automática

A partir da 0.3.0 o programa se atualiza sozinho (GitHub Releases + `electron-updater`): procura ao abrir e a cada 4 horas,
baixa só o que mudou, mostra "Nova versão disponível. Atualizar agora ou depois?" (ou instala sozinho correções pequenas),
instala sem pedir administrador, mantém os dados do usuário, e faz **rollback automático** se a versão nova não abrir.
Como lançar versões e como testar localmente: **[LANCAR-VERSAO.md](LANCAR-VERSAO.md)** (um comando: `npm run release -- patch`).

## Vários monitores

Se o computador controlado tem mais de um monitor, a barra de quem controla mostra **Monitor: 1 2 …**. Clicar em um número troca a
imagem na hora, **sem reconectar**, e o mouse passa a ser mapeado para aquele monitor (deslocamentos, coordenadas negativas,
resoluções e escalas de DPI diferentes). Só o monitor escolhido é capturado (menos banda e CPU). Com um único monitor nada aparece e
tudo funciona como antes. Se um monitor for conectado/desconectado ou mudar de resolução/orientação durante o acesso, a lista é
atualizada, e se o monitor que estava sendo visto sumir o programa volta ao principal e avisa.

Como funciona (código em `src/monitors.js`, `src/main.js`, `src/input.js`, `src/renderer/renderer.js`):
- O processo principal lê os monitores (`screen`), converte para **pixels físicos** da área de trabalho virtual e guarda qual está selecionado
  (cada sessão começa no principal). A captura (`desktopCapturer`) usa só esse monitor; ao trocar, o computador controlado captura de novo e
  usa `replaceTrack` (sem renegociar o WebRTC).
- Protocolo (estende o canal de dados existente; mensagens desconhecidas são ignoradas, então versões antigas seguem funcionando):
  `host → controlador {k:'monitors', list:[{id,index,x,y,w,h,scale,rotation,primary}], selected, rev, reason?}`;
  `controlador → host {k:'monitor', id}`; as mensagens de mouse ganham `mon` (o monitor que o controlador estava vendo).
  Sem `mon` (cliente antigo) vale o monitor selecionado; com `mon` de um monitor que não existe mais, o evento é descartado.
- O injetor converte o ponto do monitor para o `SendInput` com `MOUSEEVENTF_VIRTUALDESK`.
- Testes: `npm test` (lógica de coordenadas, seleção e hot-plug em `scripts/test-monitors.js`). `REA_TEST_MONITORS_FILE` (só testes) permite simular
  a lista de monitores por um arquivo JSON.
- **Ainda não existe** a visão combinada "todos os monitores" (decisão de escopo); o protocolo reserva espaço para ela.

## Como a conexão funciona (sem configurar nada)

- **Mesma rede (Wi-Fi/cabo):** funciona de imediato. O primeiro computador que abre vira o "ponto de encontro" e os
  demais o encontram sozinhos. O Windows pode pedir permissão de rede na primeira vez (clicar em *Permitir acesso*).
- **Pela internet:** é preciso um servidor de conexão hospedado por você (uma vez só):
  1. Hospede o `Dockerfile` deste projeto em um serviço com HTTPS (Render, Fly.io, Railway, VPS etc.).
  2. Coloque o endereço em `config/defaults.json`: `"serverUrl": "wss://seu-servidor.exemplo.com"`.
  3. Rode `npm run dist` de novo. Todos os instaladores gerados já saem configurados.

## O que foi alterado nesta versão

- Instalador de um clique (NSIS, por usuário, sem pedir administrador), com atalho na Área de Trabalho e no Menu Iniciar.
- Servidor de conexão **embutido** e descoberta automática na rede local (`src/net.js`); servidor na internet opcional via `config/defaults.json`.
- Interface em linguagem simples: "Quero receber ajuda" / "Quero ajudar alguém", código em vez de "ID", avisos de golpe, mensagens de erro com o que fazer.
- Tela de boas-vindas no primeiro uso (nome do computador com valor padrão). Configurações técnicas ficam em "Avançado".
- Ícone na bandeja: fechar a janela não encerra o programa; há "Encerrar acesso remoto agora" e botão grande para encerrar na tela de quem é acessado.
- Instância única, opção de abrir junto com o Windows, aviso ao receber pedido (janela sobe e pisca).
- Nome do computador aparece no pedido de acesso; conexão que cai é detectada com mensagem clara; tempo limite para pedido sem resposta.
- Correção: clipboard (API assíncrona do Electron 45).
- Minimizar/trocar de janela: o programa solta teclas e botões presos no outro computador e impede o Windows/Chromium de reduzir a prioridade da sessão ou suspendê-la.
- Clique remoto nos botões da janela do próprio programa (minimizar/fechar) travava o mouse e o teclado remotos: a injeção de entrada agora roda em um processo separado (`src/injector.js`) que não fica preso junto com a janela.
- Opção **"Mostrar o mouse do outro computador"** (barra de cima, quem controla): desmarcada, o ponteiro some da imagem. Como o ponteiro vai embutido no vídeo e o Chromium não permite desligá-lo, ele é escondido no próprio computador controlado (ponteiros do Windows ficam transparentes). Quem está lá vê um aviso e pode clicar em "Mostrar meu mouse". Restaura sozinho ao encerrar o acesso, ao sair do programa, se o processo de entrada cair e, se o programa for morto à força, no próximo início (arquivo-marca `cursor-hidden.flag`). Também há "Mostrar o ponteiro do mouse" no menu do ícone da bandeja.
- Imagem parada: o programa detecta quando a imagem para de se mexer (com o mouse sobre ela) e pede uma imagem nova sozinho; há também o botão **Atualizar imagem**.

## Limitações restantes

- **Windows apenas** (injeção de mouse/teclado via `SendInput`). Um monitor por vez (ainda sem a visão combinada de todos). Sem áudio.
- **Vários monitores:** testado com 2 monitores reais iguais (1920×1080), com topologias simuladas e com hot-plug real (desligar e religar o monitor 2 pelo Windows). **DPIs diferentes e troca de orientação com hardware real ainda não foram testados** (o cálculo está coberto por testes unitários).
- **Assinatura de código:** sem certificado, o SmartScreen avisa na primeira execução. Para remover o aviso é preciso
  comprar um certificado de assinatura e configurá-lo no electron-builder. Em computadores com "Controle de Aplicativo
  inteligente"/políticas de aplicativos ativas, um `.exe` novo e não assinado pode ser **bloqueado** pelo Windows
  (aconteceu num build de teste); a única solução é assinar o executável.
- **Internet:** exige o servidor hospedado (passo acima). Sem servidor TURN, redes muito restritivas (CGNAT/empresas) podem não conectar.
- **Rede local:** se dois computadores abrirem exatamente ao mesmo tempo podem ambos virar servidor; se o computador que é o ponto de encontro for fechado, os outros se reconectam sozinhos em poucos segundos, mas uma sessão em andamento não é afetada (a imagem vai direto entre os dois).
- Esconder o mouse afeta os ponteiros padrão do Windows; programas que desenham o próprio ponteiro (alguns jogos/editores) continuam mostrando o deles. Enquanto oculto, o ponteiro também some para quem está no computador controlado.
- Janelas executadas como administrador (e a tela de permissão do Windows/UAC) não aceitam mouse e teclado vindos do app; para isso seria preciso um serviço do Windows instalado com privilégios.
- Sem senha para acesso sem alguém no computador: toda conexão exige alguém clicar em *Permitir*.
- O servidor de conexão não tem autenticação nem limite de tentativas.
- Atualização automática: a primeira instalação continua manual e a versão instalada já precisa conter o atualizador (0.3.0 ou
  mais nova). Sem assinatura digital, a atualização é verificada só pelo checksum (`sha512`) publicado junto, e o Windows pode bloquear
  o `.exe` novo (Controle de Aplicativo); o rollback automático cobre falhas de abertura, mas não um bloqueio do próprio Windows na
  reabertura. É preciso configurar o seu repositório do GitHub (veja LANCAR-VERSAO.md).
- Testado: servidor, e fluxo completo (pedido, aceite, vídeo, mouse, teclado, texto, arquivo, chat, encerramento) com o `.exe` empacotado em duas instâncias no mesmo PC. **Não** testado: o instalador em si (instalar/desinstalar), dois computadores reais, nem acesso pela internet.
- O REA (ferramenta de engenharia reversa) foi usado só para uma inspeção estática do AnyDesk instalado (binário empacotado, sem tabela de imports); a saída fica local e não faz parte do app nem do repositório.
