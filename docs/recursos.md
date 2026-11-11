# Recursos

Descrição de uso de cada recurso. Para o funcionamento interno, veja [arquitetura.md](arquitetura.md).

## Acesso por código

Quem precisa de ajuda informa o **código de 9 dígitos** mostrado em "Quero receber ajuda". Quem ajuda o digita em "Quero ajudar alguém"
e clica em **Conectar**. Quem está sendo acessado vê um aviso e escolhe **Permitir** (ou **Não permitir**), podendo liberar ou não o
controle de mouse e teclado e a transferência de arquivos e textos. Toda conexão exige esse aceite. A qualquer momento, os dois lados podem
**Encerrar acesso**.

Na bandeja do sistema, fechar a janela não encerra o programa (ele continua pronto para receber pedidos); o menu do ícone tem
"Encerrar acesso remoto agora". Só abre uma janela por vez, e há a opção de abrir junto com o Windows (**Configurações → Abrir junto com o Windows**; o programa abre escondido na bandeja). Se você desativar o item em
Gerenciador de Tarefas → Inicializar, a caixa aparece desmarcada e ligá-la de novo reativa.

## Computadores de confiança (entrar sem pedir permissão)

Ao **Permitir** um pedido, quem é acessado pode marcar **Lembrar este computador** (desmarcado por padrão). Nas próximas vezes, esse computador entra
**sem que você precise clicar em Permitir**, com as mesmas escolhas de mouse/teclado e arquivos/textos de quando foi lembrado. A janela sobe e pisca, e a
tela de acesso diz "permitido automaticamente", então um acesso automático nunca é silencioso.

- **Só vale para o computador que foi lembrado.** O código de 9 dígitos sozinho não basta: na primeira vez os dois lados combinam um segredo, e a cada pedido
  o computador controlado confere uma prova que só quem tem o segredo consegue dar. Quem apenas souber ou copiar o código **não** entra sem perguntar.
- **Se a prova falhar** (ou o outro computador perdeu o segredo, ou é outra pessoa usando o mesmo código), o pedido aparece normalmente, com um aviso em
  vermelho de que a identidade não foi confirmada.
- **Remover:** em **Configurações → Computadores de confiança** há a lista (nome, código, o que foi permitido e quando foi usado pela última vez), com um
  botão de lixeira em cada item e **Remover todos**. Depois de remover, o próximo pedido volta a perguntar.
- Quem controla não precisa fazer nada: o segredo é guardado sozinho depois de a pessoa aceitar e marcar **Lembrar**.

## Barra de controles, atalhos e tema

Durante o acesso, os controles ficam numa **barra flutuante** sobre a imagem. Os botões têm só ícone; o nome
aparece ao passar o mouse. O botão **⌃** no canto recolhe a barra (sobra um indicador de qualidade, **Encerrar** e **⌄** para abrir de novo);
a escolha é lembrada.

| Controle | O que faz |
|---|---|
| **Controlar** (interruptor) | Liga ou solta o mouse e o teclado no outro computador |
| Ponteiro (interruptor) | Mostra ou esconde o mouse do outro computador |
| **1 2 …** | Escolhe o monitor (só aparece com mais de um) |
| Janela com seta | Abre outro monitor em uma segunda janela |
| Setas circulares | **Atualizar imagem** |
| Setas para os dois lados | **Transferir arquivos** (gerenciador de arquivos; só aparece para quem controla) |
| Setas | Exibição reduzida ou esticada |
| Balão | Mostrar ou ocultar a conversa (com contador de novas mensagens) |
| Teclado | Lista de atalhos |

**Qualidade da conexão:** quatro barrinhas e o atraso em ms (verde, amarelo ou vermelho); a dica mostra também quadros por segundo,
resolução e taxa de dados.

**Atalhos** (`Ctrl+Alt+Shift` + letra; não são enviados ao outro computador): `C` conversa, `V` exibição, `M` usar ou soltar
mouse e teclado, `B` recolher a barra, `K` lista de atalhos. Com **Controlar** ligado, todas as outras teclas vão
para o outro computador.

**Teclas do Windows no outro computador:** com o foco do teclado na imagem do outro computador e **Controlar** ligado, a tecla **Windows**
(sozinha ou combinada: Win+D, Win+E, Win+R, Win+Shift+S…), **Alt+Tab**, **Alt+Esc**, **Alt+Espaço**, **Alt+F4**, **Ctrl+Esc** e **Ctrl+Shift+Esc**
vão para o outro computador e **não** agem no seu. Se o foco sair da imagem (você clicou na barra ou na conversa), o Windows local volta a
ficar com essas teclas, e para sair da imagem basta clicar fora dela. Alt+F4 fecha a janela do outro computador, não esta.

**Tema:** o botão de lua, sol ou monitor no cabeçalho alterna entre **escuro** (padrão), **claro** e **do sistema**; a escolha vale na próxima
abertura. Quem pediu "reduzir movimento" no Windows não vê animações (o anel de "conectando" continua girando, mais devagar).

**Teclado nas janelas de diálogo:** o foco vai para o campo ou botão certo (no pedido de acesso, **Não permitir**), `Tab` não sai da janela e
`Esc` fecha as configurações, cancela uma confirmação ou recusa um pedido de acesso.

## Texto, arquivos e conversa

- **Área de transferência compartilhada (automática):** durante o acesso, o que você **copiar** (Ctrl+C) em um computador pode ser **colado**
  (Ctrl+V) no outro, nos dois sentidos, sem botões e sem avisos. Só texto; o que já estava copiado antes do acesso não é enviado, só o que mudar
  depois. Quem é acessado só participa se permitiu **Arquivos e textos** no pedido de acesso (sem isso, nada é copiado em nenhum sentido).
- **Transferir arquivos (gerenciador de arquivos):** feito **só por quem controla**, pelo botão **Transferir arquivos** da barra (setas para os dois lados). Abre uma janela
  dividida **meio a meio**: na metade **esquerda** você navega pelas pastas **do seu computador**; na **direita**, pelas **do computador controlado**. Cada metade tem os botões
  Início (pastas conhecidas e discos), Subir uma pasta e Atualizar, e uma barra de caminho onde dá para digitar uma pasta e apertar `Enter`. Duplo clique (ou `Enter`) abre uma pasta;
  as setas do teclado movem a seleção; `Backspace` sobe uma pasta.
  - **Enviar** (botão na metade esquerda): escolha um arquivo à esquerda e abra, à direita, a pasta onde ele deve ficar no computador controlado; clique em **Enviar**.
  - **Receber** (botão na metade direita): escolha um arquivo à direita e abra, à esquerda, a pasta onde ele deve ficar no seu computador; clique em **Receber**.
  - Os botões só ligam com um **arquivo** escolhido e a **pasta de destino aberta** do outro lado; a linha abaixo de cada metade explica o que falta. Há barra de andamento e **Cancelar**
    (o que chegou até então é apagado). Terminando, a lista do destino é atualizada e o arquivo novo fica selecionado.
  - **Nunca sobrescreve:** se já existir um arquivo com o mesmo nome, o novo vira `nome (1).ext`. O arquivo só aparece com o nome final quando chega inteiro (antes é `nome.ext.rea-part`).
  - Limite de **4 GB** por arquivo, **um arquivo por vez**, sem pastas inteiras (veja [limitacoes.md](limitacoes.md)).
  - Só funciona se quem é controlado permitiu **Arquivos e textos** no pedido de acesso (senão o botão avisa e nada é lido nem gravado nele). O computador controlado **não tem
    botões**: quando o gerenciador é usado, a tela dele mostra um aviso e a conversa registra o que foi copiado.
- **Conversa:** painel ao lado da imagem, nos dois computadores.

### Ocultar / mostrar a conversa

O botão de balão da barra (**Ocultar conversa** / **Mostrar conversa**) esconde o painel e a imagem do outro computador passa a ocupar a janela toda; **Mostrar conversa**
o traz de volta. Mensagens que chegam com a conversa escondida não se perdem: aparece um contador no botão (e um aviso discreto na primeira) e,
ao mostrar, elas estão no histórico da conversa. A escolha é lembrada. Em janelas com menos de 760 px de largura a conversa fica escondida.

## Exibição da tela: reduzida ou esticada

O botão de exibição (**reduzida / esticada**; só quem controla) alterna como a tela do outro computador aparece na janela:

- **Reduzida** (padrão): só **diminui**, quando a imagem é maior que a janela, e **nunca amplia**. Se a janela for maior, a imagem fica no
  tamanho real (1 pixel remoto = 1 pixel do seu monitor, já descontada a escala do Windows), centralizada e nítida, com barras pretas em volta.
- **Esticada:** a imagem preenche a janela mantendo a proporção; se a janela for maior que a tela remota, é **ampliada** (pode ficar borrada).

Vale para a janela principal e para a segunda janela (alternar em uma muda as duas), recalcula sozinho ao redimensionar, esconder a conversa,
trocar de monitor ou quando o outro computador muda de resolução. O mouse continua mapeado certo nos dois modos; cliques nas barras pretas são
ignorados.

### Ajuste automático da janela

Como no AnyDesk, **ao conectar** a janela se redimensiona para caber a tela remota (1 pixel remoto = 1 pixel do seu monitor, mais ~24 px de
margem de cada lado), limitada à área útil do monitor onde ela está, e é centralizada. Uma tela remota de 1366×768 aparece em 1366×768; uma de
1920×1080 num monitor 1920×1080 usa toda a área útil e a exibição reduzida a encolhe só o necessário. Janela maximizada nunca é
redimensionada. Em **Configurações** dá para desligar o ajuste automático.

## Histórico de computadores acessados

Cada acesso **aceito** é lembrado na tela inicial, em **Computadores recentes**: nome, código e "há quanto tempo". Um clique no item conecta,
sem digitar o código, mesmo depois de fechar e abrir o programa. Cada item tem:

- **★** favorito (fica sempre no topo e nunca é descartado);
- **✎** renomear (o nome escolhido não é mais trocado pelo nome informado pelo outro computador);
- **✕** remover.

**Limpar** apaga tudo, menos os favoritos. O histórico guarda até 20 computadores. Se o outro computador reinstalar o programa e ganhar um
código novo, remova o item antigo e conecte com o código novo.

## Vários monitores

Se o computador controlado tem mais de um monitor, a barra de quem controla mostra os botões de monitor **1 2 …**. Clicar em um número troca a imagem
na hora, **sem reconectar**, e o mouse passa a ser mapeado para aquele monitor (deslocamentos, coordenadas negativas, resoluções e escalas de
DPI diferentes). Só o monitor escolhido é capturado (menos banda e CPU). Com um único monitor nada aparece e tudo funciona como antes. Se um
monitor for conectado ou desconectado, ou mudar de resolução ou orientação durante o acesso, a lista é atualizada; se o monitor que estava
sendo visto sumir, o programa volta ao principal e avisa. A visão combinada "todos os monitores" ainda não existe.

### Duas janelas (um monitor em cada)

O botão **Outro monitor em nova janela** abre uma segunda janela mostrando outro monitor do computador controlado, enquanto a janela principal
mostra o seu. Cada janela tem seu seletor de monitor (o que já está na outra fica desativado), mouse e teclado funcionam nas duas, e **fechar a
segunda janela** (ou encerrar o acesso) a fecha nos dois lados. É uma única sessão: quem é acessado aceita uma vez só. O computador controlado
codifica duas imagens ao mesmo tempo (mais CPU e banda); o limite é uma janela extra.

## Mostrar ou esconder o mouse do outro computador

O interruptor do ponteiro (**Mostrar o mouse do outro computador**, quem controla): desmarcada, o ponteiro some da imagem. Como o ponteiro vai embutido no vídeo,
ele é escondido no próprio computador controlado (os ponteiros do Windows ficam transparentes), e quem está lá vê um aviso com o botão
**Mostrar meu mouse**. O ponteiro volta ao encerrar o acesso, ao sair do programa, e no próximo início se o programa for encerrado à força;
o menu da bandeja também tem "Mostrar o ponteiro do mouse". Programas que desenham o próprio ponteiro (alguns jogos e editores) continuam
mostrando o deles.

## Imagem parada

Quando você está **controlando com o ponteiro remoto visível** e a imagem não muda por 4 s, o programa pede um quadro novo ao outro computador
(sem tocar no vídeo da tela) e, só se isso não resolver, recoloca o vídeo. Há também o botão **Atualizar imagem**. Sem controle, ou com o
ponteiro remoto escondido, uma tela parada é normal e nada é feito. Recolocar o vídeo na tela faz a imagem **piscar**, por isso só acontece no
botão, ao voltar de uma janela minimizada e como último recurso.

## Atualização automática

O programa procura atualizações ao abrir e a cada 4 horas, baixa só o que mudou, e mostra "Nova versão disponível. Atualizar agora ou depois?";
correções pequenas (só o último número muda) são instaladas sozinhas quando não há acesso remoto em andamento. A instalação não pede
administrador, mantém os dados do usuário e faz **rollback automático** se a versão nova não abrir. Detalhes em [arquitetura.md](arquitetura.md#atualização-automática).
