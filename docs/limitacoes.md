# Limitações e estado dos testes

## Limitações

- **Plataforma:** só Windows (a injeção de mouse e teclado usa `SendInput`), 64 bits. Sem áudio.
- **Monitores:** uma imagem por janela (no máximo duas janelas); ainda não existe a visão combinada de todos os monitores. O computador
  controlado codifica duas imagens ao mesmo tempo quando há duas janelas.
- **Assinatura de código:** o instalador não é assinado. O SmartScreen avisa na primeira execução ("O Windows protegeu seu computador": clique em
  **Mais informações → Executar assim mesmo**), e em computadores com o Controle de Aplicativo ativo um `.exe` novo e não assinado pode ser
  **bloqueado** pelo Windows (aconteceu em builds de teste). A solução é assinar o executável.
- **Atualização:** a primeira instalação é manual, e a versão instalada precisa já conter o atualizador (0.3.0 ou mais nova). O rollback automático
  cobre uma versão que não abre ou não fica saudável, mas não consegue contornar um bloqueio do próprio Windows na reabertura.
- **Internet:** exige um servidor de conexão hospedado por você, e o projeto não tem servidor TURN: redes muito restritivas (CGNAT, algumas
  redes de empresas) podem não conectar. O servidor de conexão não tem autenticação nem limite de tentativas. Veja [conexao.md](conexao.md).
- **Rede local:** se dois computadores abrirem exatamente ao mesmo tempo, os dois podem virar servidor.
- **Sem acesso não supervisionado:** não há senha de acesso; toda conexão exige alguém clicar em **Permitir**.
- **Janelas de administrador:** janelas executadas como administrador (e a tela de permissão do Windows, UAC) não aceitam mouse e teclado
  vindos do app; seria preciso um serviço do Windows com privilégios.
- **Mouse remoto escondido:** afeta os ponteiros padrão do Windows (programas com ponteiro próprio continuam mostrando o deles) e, enquanto
  escondido, o ponteiro também some para quem está no computador controlado.
- **Imagem parada sem controle:** sem controlar, ou com o ponteiro remoto escondido, um travamento real não é detectado sozinho; use
  **Atualizar imagem**.
- **Barra de controles:** a barra flutuante cobre uns 50 px do topo da imagem do outro computador; recolha-a (`Ctrl+Alt+Shift+B`) para ver tudo.
- **Atalhos do programa:** `Ctrl+Alt+Shift` + letra não é repassado ao outro computador, mas os três modificadores chegam lá antes da letra.
  Se o outro computador usa essa combinação para algo, os atalhos ficam indisponíveis para o programa que a usa.
- **Contraste da interface:** textos, ícones e o foco passam no nível AA (conferido por `npm test`); as bordas dos campos são discretas (cerca
  de 1,6:1), abaixo dos 3:1 que o WCAG pede para o contorno de componentes.
- **Área de transferência automática:** só **texto** (imagens e arquivos copiados não são sincronizados; use o gerenciador de arquivos, **Transferir arquivos**). Cabe em uma
  mensagem do canal de dados: textos acima de cerca de 250 KB não são enviados e o programa avisa. **Não há botão de pausa**: tudo o que é copiado
  durante o acesso vai para o outro computador, **inclusive senhas**. Quem é acessado pode desligar negando **Arquivos e textos**; quem controla
  deve evitar copiar algo sigiloso durante o acesso. O programa olha a área de transferência a cada ~0,6 s, então uma cópia seguida de colar muito
  rápido pode chegar depois.
- **Computadores de confiança:** o segredo é combinado na primeira vez, quando quem é acessado aceita (confiança na primeira vez): um intermediário no servidor de
  conexão **naquele momento** poderia ficar com ele. Os segredos ficam no `localStorage` do programa, sem criptografia extra: quem usa a sua conta do Windows e
  alcança a pasta de dados do programa poderia copiá-los. Quem controla um computador de confiança entra sem pedir permissão, então **remova** computadores que você
  não usa mais, vendeu ou perdeu. Num acesso automático a imagem começa a ser enviada antes de a prova do canal terminar (menos de 1 s); mouse, teclado e arquivos só
  são liberados depois dela.
- **Teclas do Windows:** só com o foco na imagem. **Ctrl+Alt+Del** e **Win+L** não funcionam (o Windows reserva a tela de segurança; Win+L, em alguns casos, só
  tranca o computador de quem controla), e janelas de administrador/UAC não recebem teclas (veja acima). Alt+F4 passa a fechar a janela do outro computador e não
  mais a deste programa enquanto o foco estiver na imagem.
- **Antivírus:** o gancho de teclado do Windows é o mesmo mecanismo usado por programas espiões; alguns antivírus podem desconfiar. O programa só o liga com o foco na
  imagem do outro computador, não guarda nem registra o que é digitado e o desliga ao sair da imagem.
- **Gerenciador de arquivos:** só **quem controla** transfere (o computador controlado não tem botões). Um arquivo por vez; **pastas inteiras não** são transferidas (só navegadas);
  limite de **4 GB** por arquivo; só arquivos (não atalhos especiais, dispositivos nem fluxos alternativos do NTFS). Listas com mais de ~1500 itens (ou grandes demais para uma mensagem)
  aparecem cortadas, com um aviso: digite o caminho de uma subpasta na barra para ir direto a ela. A lista mostra nome, tamanho e data, sem ícones por tipo de arquivo e sem ordenar
  por outras colunas. Não existe apagar, renomear nem criar pasta. Arquivos em uso por outro programa, de pastas protegidas do Windows e de unidades de rede paradas podem não abrir (o
  programa avisa o motivo). Quando a conexão cai no meio, o arquivo que chegava é apagado (não há "continuar de onde parou"). O envio antigo (uma pergunta "Deseja receber?" por arquivo,
  pasta `Downloads\REA-Desk-Recebidos`) **foi removido**, e um computador com versão antiga **não** entende o gerenciador: atualize os dois.
- **Alcance da permissão "Arquivos e textos":** ao marcá-la, o dono do computador controlado deixa quem controla **ver qualquer pasta e arquivo que a conta do Windows dele alcance e copiar
  arquivos daqui e para cá** (inclusive para pastas de programas e de inicialização, se a conta puder gravar nelas), além da área de transferência. Antes da 0.9.0 essa permissão só
  deixava enviar um arquivo por vez, com uma pergunta, para uma pasta fixa. Por isso: **computadores de confiança** que foram lembrados com "Arquivos e textos" (inclusive de versões
  antigas) passam a entrar com esse alcance maior sem perguntar: confira a lista em **Configurações → Computadores de confiança** e remova o que não for mais adequado (não há como
  ajustar só a permissão de arquivos de um item). Enquanto o gerenciador é usado, a tela do computador controlado mostra um aviso e a conversa registra cada arquivo copiado; o
  controlado pode **Encerrar acesso agora** a qualquer momento. O gerenciador **não** dá acesso a programas de administrador nem a arquivos que a conta do Windows não alcance.
- **Histórico:** guarda o código do outro computador; se ele ganhar um código novo (reinstalação), o item antigo precisa ser removido.

## O que foi testado

- Testes automáticos (`npm test`, veja [desenvolvimento.md](desenvolvimento.md)) e verificações com duas instâncias do aplicativo no mesmo PC:
  pedido, aceite, vídeo, mouse, teclado, texto, arquivo, conversa, histórico, exibição, ajuste da janela, segunda janela e encerramento.
- Dois monitores reais (1920×1080 cada): troca, mapeamento do mouse, segunda janela e hot-plug (desligar e religar o monitor pelo Windows).
- Instalação e desinstalação silenciosas do instalador, e o fluxo de atualização (incremental, backup, vigia, rollback) em instaladores de teste.
- Atualização de uma versão instalada para a seguinte publicada no GitHub (confirmada em uso real).

## O que ainda não foi testado

- Acesso pela internet (servidor de conexão hospedado).
- Monitores com DPIs diferentes, três ou mais monitores e troca de orientação com hardware real (o cálculo está coberto por testes unitários).
- Escala do Windows acima de 100% na janela do controlador (só coberta por testes unitários).
- O download incremental vindo do GitHub (em testes locais, o atualizador caiu para o download completo quando o servidor de teste não
  suportava trechos; o `.blockmap` é publicado em cada Release).
- Assinatura de código e a verificação de assinatura pelo atualizador.
