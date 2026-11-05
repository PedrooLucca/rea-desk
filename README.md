# REA Desk

Aplicativo de acesso remoto para Windows, feito para quem não tem conhecimento técnico: quem precisa de ajuda passa um **código**, quem ajuda
o digita e a outra pessoa clica em **Permitir**. Instala com dois cliques e não exige configuração na mesma rede.

## Recursos

- Conexão por código de 9 dígitos, com aceite a cada pedido e permissões escolhidas por quem é acessado
- Tela, mouse e teclado em tempo real, direto entre os dois computadores (WebRTC, criptografado)
- Copiar texto, enviar arquivos (até 200 MB) e conversa
- Vários monitores: trocar de monitor sem reconectar e abrir outro monitor em uma segunda janela
- Exibição reduzida (tamanho real) ou esticada, com ajuste automático da janela ao conectar
- Histórico de computadores acessados, para reconectar com um clique
- Atualização automática, com rollback se a versão nova não abrir
- Funciona na mesma rede sem configurar nada; pela internet com um servidor de conexão próprio

## Requisitos

- Windows 64 bits (testado no Windows 11)
- Para rodar o código-fonte: Node.js 22 ou mais novo e npm

## Instalação e execução

**Usuário:** baixe `REA-Desk-Instalar-x.y.z.exe` em [Releases](https://github.com/PedrooLucca/rea-desk/releases/latest) e dê dois cliques.
Se o Windows mostrar "O Windows protegeu seu computador", clique em **Mais informações → Executar assim mesmo** (o instalador ainda não é assinado).

**Código-fonte:**

```bash
git clone https://github.com/PedrooLucca/rea-desk.git
cd rea-desk
npm install
npm start          # abre o aplicativo
npm test           # roda os testes
npm run dist       # gera o instalador em dist\
```

## Uso básico

1. No computador de quem precisa de ajuda, abra o REA Desk: o código aparece em **Quero receber ajuda** (por exemplo, `123 456 789`).
2. No computador de quem ajuda, digite o código em **Quero ajudar alguém** e clique em **Conectar** (ou clique num item de
   **Computadores recentes**).
3. Quem está sendo acessado clica em **Permitir**, escolhendo se libera mouse e teclado e arquivos.
4. Para terminar, qualquer um dos lados clica em **Encerrar acesso**.

Os dois computadores precisam estar na mesma rede (mesmo Wi-Fi ou cabo). Para acessar pela internet, veja [docs/conexao.md](docs/conexao.md).

## Configuração

Em **Configurações** no próprio aplicativo:

| Opção | Padrão |
|---|---|
| Nome deste computador (aparece no pedido de acesso) | Nome do Windows |
| Abrir o programa junto com o Windows | Desligado |
| Ajustar o tamanho da janela ao da tela do outro computador ao conectar | Ligado |
| Instalar correções pequenas automaticamente, sem perguntar | Ligado |
| Avançado: servidor de conexão e STUN | Vazio (automático) |

Para o instalador já sair apontando para um servidor de conexão na internet, edite `config/defaults.json` (`serverUrl` e `stun`) e gere o
instalador de novo. Detalhes em [docs/conexao.md](docs/conexao.md).

## Documentação

- [docs/recursos.md](docs/recursos.md): como usar cada recurso em detalhe
- [docs/conexao.md](docs/conexao.md): rede local, internet, servidor de conexão, portas
- [docs/arquitetura.md](docs/arquitetura.md): processos, protocolo, monitores, atualizador, dados do usuário
- [docs/desenvolvimento.md](docs/desenvolvimento.md): scripts, testes, como lançar versões e testar a atualização
- [docs/limitacoes.md](docs/limitacoes.md): limitações e o que foi testado
- [docs/mudancas.md](docs/mudancas.md): histórico de mudanças por versão

## Contribuição

Rode `npm test` antes de enviar mudanças; o pipeline de publicação roda os mesmos testes. Veja [docs/desenvolvimento.md](docs/desenvolvimento.md).

## Licença

MIT (campo `license` do `package.json`).
