# Recursos

Descrição de uso de cada recurso. Para o funcionamento interno, veja [arquitetura.md](arquitetura.md).

## Acesso por código

Quem precisa de ajuda informa o **código de 9 dígitos** mostrado em "Quero receber ajuda". Quem ajuda o digita em "Quero ajudar alguém"
e clica em **Conectar**. Quem está sendo acessado vê um aviso e escolhe **Permitir** (ou **Não permitir**), podendo liberar ou não o
controle de mouse e teclado e a transferência de arquivos e textos. Toda conexão exige esse aceite. A qualquer momento, os dois lados podem
**Encerrar acesso**.

Na bandeja do sistema, fechar a janela não encerra o programa (ele continua pronto para receber pedidos); o menu do ícone tem
"Encerrar acesso remoto agora". Só abre uma janela por vez, e há a opção de abrir junto com o Windows.

## Texto, arquivos e conversa

- **Copiar texto para lá / Trazer texto de lá:** copia o texto da área de transferência entre os dois computadores.
- **Enviar arquivo:** até 200 MB; quem recebe confirma e o arquivo vai para `Downloads\REA-Desk-Recebidos`.
- **Conversa:** painel ao lado da imagem, nos dois computadores.

### Ocultar / mostrar a conversa

O botão **Ocultar conversa** (barra de cima) esconde o painel e a imagem do outro computador passa a ocupar a janela toda; **Mostrar conversa**
o traz de volta. Mensagens que chegam com a conversa escondida não se perdem: aparece um contador no botão (e um aviso discreto na primeira) e,
ao mostrar, elas estão no histórico da conversa. A escolha é lembrada. Em janelas com menos de 760 px de largura a conversa já fica escondida e
o botão não aparece.

## Exibição da tela: reduzida ou esticada

O botão **Exibição: reduzida / esticada** (só quem controla) alterna como a tela do outro computador aparece na janela:

- **Reduzida** (padrão): só **diminui**, quando a imagem é maior que a janela, e **nunca amplia**. Se a janela for maior, a imagem fica no
  tamanho real (1 pixel remoto = 1 pixel do seu monitor, já descontada a escala do Windows), centralizada e nítida, com barras pretas em volta.
- **Esticada:** a imagem preenche a janela mantendo a proporção; se a janela for maior que a tela remota, é **ampliada** (pode ficar borrada).

Vale para a janela principal e para a segunda janela (alternar em uma muda as duas), recalcula sozinho ao redimensionar, esconder a conversa,
trocar de monitor ou quando o outro computador muda de resolução. O mouse continua mapeado certo nos dois modos; cliques nas barras pretas são
ignorados.

### Ajuste automático da janela

Como no AnyDesk, **ao conectar** a janela se redimensiona para caber a tela remota (1 pixel remoto = 1 pixel do seu monitor, mais ~24 px de
margem de cada lado), limitada à área útil do monitor onde ela está, e é centralizada. Uma tela remota de 1366×768 aparece em 1366×768; uma de
1920×1080 num monitor 1920×1080 usa toda a área útil e a exibição reduzida a encolhe só o necessário. Janela maximizada ou em tela cheia nunca é
redimensionada. O botão **Ajustar janela** refaz o ajuste quando quiser, e em **Configurações** dá para desligar o ajuste automático.

## Histórico de computadores acessados

Cada acesso **aceito** é lembrado na tela inicial, em **Computadores recentes**: nome, código e "há quanto tempo". Um clique no item conecta,
sem digitar o código, mesmo depois de fechar e abrir o programa. Cada item tem:

- **★** favorito (fica sempre no topo e nunca é descartado);
- **✎** renomear (o nome escolhido não é mais trocado pelo nome informado pelo outro computador);
- **✕** remover.

**Limpar** apaga tudo, menos os favoritos. O histórico guarda até 20 computadores. Se o outro computador reinstalar o programa e ganhar um
código novo, remova o item antigo e conecte com o código novo.

## Vários monitores

Se o computador controlado tem mais de um monitor, a barra de quem controla mostra **Monitor: 1 2 …**. Clicar em um número troca a imagem
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

A opção **Mostrar o mouse do outro computador** (quem controla): desmarcada, o ponteiro some da imagem. Como o ponteiro vai embutido no vídeo,
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
