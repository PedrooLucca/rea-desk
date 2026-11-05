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
