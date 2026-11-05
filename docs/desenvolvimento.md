# Desenvolvimento

## Requisitos

- Windows 64 bits (o injetor de entrada usa `user32.dll`; o instalador é `x64`).
- Node.js 22 ou mais novo e npm (o pipeline de publicação usa o Node 22; o `package.json` não fixa a versão).
- Git, para lançar versões.

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | Instala as dependências (inclui o Electron) |
| `npm run build:ui` | Gera o CSS, os ícones e a fonte da interface em `src/renderer/assets/` (roda sozinho antes de `npm start` e `npm run dist`) |
| `npm start` | Abre o aplicativo a partir do código-fonte (gera a interface antes) |
| `npm run server` | Servidor de conexão avulso (`127.0.0.1:8787`; veja [conexao.md](conexao.md)) |
| `npm test` | Roda todos os testes (abaixo) |
| `npm run dist` | Gera o instalador: `dist\REA-Desk-Instalar-<versão>.exe` (~116 MB, com Electron e bibliotecas) |
| `npm run dist:dir` | Gera só a pasta, sem instalador: `dist\win-unpacked\REA Desk.exe` |
| `npm run icon` | Regera `build/icon.png` (`scripts/make-icon.ps1`) |
| `npm run release -- patch` | Lança uma versão (veja abaixo) |
| `npm run update:build-local -- 1.0.0` | Gera um instalador de TESTE para experimentar a atualização |
| `npm run update:serve-local` | Servidor local de atualizações de teste (`http://127.0.0.1:8899`) |

## Testes

`npm test` roda, em sequência, testes em Node (sem abrir o app):

| Arquivo | Cobre |
|---|---|
| `server/test.js` | Servidor de conexão: registro, chamada, aceite, recusa, encaminhamento e encerramento |
| `scripts/test-migrations.js` | Migração dos dados do usuário |
| `scripts/test-watchdog.js` | Vigia de atualização, com pastas de mentira (versão saudável e rollback; usa o PowerShell) |
| `scripts/test-monitors.js` | Conversão de coordenadas, seleção de monitor e hot-plug com topologias sintéticas |
| `scripts/test-history.js` | Histórico de computadores acessados |
| `scripts/test-viewmode.js` | Cálculo do tamanho da imagem (reduzida / esticada) |
| `scripts/test-contrast.js` | Contraste das cores do design system (`ui/app.css`) nos temas escuro e claro |

O repositório não tem testes automatizados da interface; a conexão completa foi verificada à mão e com scripts descartáveis.

## Estrutura

```
src/                  processo principal, injetor, servidor embutido, atualizador, vigia
  renderer/           interface (index.html, renderer.js) e lógica pura (history, viewmode, migrations)
    assets/           GERADA por npm run build:ui (CSS, ícones, fonte); não vai para o git
ui/                   design system: tokens e CSS por tela (app.css e parciais), ícones e animações (entry.js)
server/server.js      servidor de conexão (também usado pelo Dockerfile)
scripts/              testes e ferramentas de build/lançamento
config/defaults.json  servidor de conexão e STUN embutidos no instalador
build/icon.png        ícone
.github/workflows/    publicação automática (release.yml)
Dockerfile            servidor de conexão para a internet
```

## Lançar uma versão

Pré-requisitos (uma vez): repositório no GitHub com o `origin` configurado, `package.json` → `build.publish` com `owner` e `repo`, e o projeto
enviado. Com a árvore do git limpa:

```bash
npm run release -- patch        # 0.5.1 -> 0.5.2 (correções; atualiza sozinho quando não há acesso remoto)
npm run release -- minor        # 0.5.1 -> 0.6.0 (novidades; o programa pergunta antes de atualizar)
npm run release -- major        # 0.5.1 -> 1.0.0
npm run release -- 1.0.1        # versão exata
npm run release -- patch --dry-run   # só mostra o que seria feito
```

O comando roda `npm test`, atualiza a versão no `package.json`, cria o commit e a etiqueta `vX.Y.Z` e envia ao GitHub. O workflow
`.github/workflows/release.yml` (disparado pela etiqueta, no `windows-latest` com Node 22) roda `npm ci` e `npm test`, confere que a etiqueta
bate com a versão, **cria a Release antes** (evita Releases duplicadas) e então roda `electron-builder --win nsis --x64 --publish always`,
publicando o instalador, o `latest.yml` e o `.blockmap`.

**Assinatura de código (recomendado):** com um certificado `.pfx` nos *Secrets* do repositório (`WIN_CSC_LINK` e `WIN_CSC_KEY_PASSWORD`) o
pipeline passa a assinar sozinho. Para o atualizador também **verificar** a assinatura, acrescente em `build.win` a opção
`signtoolOptions.publisherName` (nome do certificado); sem certificado, **não** a use, ou as atualizações falham. Isto ainda não foi testado
neste projeto. Sem assinatura, a atualização é verificada só pelo `sha512` do `latest.yml`.

A primeira instalação é manual (baixar o instalador); só versões a partir da 0.3.0 trazem o atualizador.

## Testar a atualização sem publicar

```bash
npm run update:build-local -- 1.0.0     # instalador de teste 1.0.0 em dist-local\
npm run update:build-local -- 1.0.1     # versão nova de teste (latest.yml passa a apontar para ela)
npm run update:serve-local              # deixe rodando
```

Instale `dist-local\REA-Desk-Teste-Instalar-1.0.0.exe` e abra o "REA Desk Teste": ele usa outra identidade e outra pasta de dados
(`%APPDATA%\rea-desk-teste`), sem mexer na instalação real. Em **Configurações → Procurar atualizações** (ou ~20 s depois de abrir) ele baixa e
instala a 1.0.1. Para testar o **rollback**, gere `npm run update:build-local -- 1.0.2 --broken` (versão que fecha ao abrir); abrindo o programa
de teste com `REA_WATCHDOG_TIMEOUT_SEC=60` o rollback leva ~1 minuto em vez de 4. O registro fica em
`%APPDATA%\rea-desk-teste\updater\updater.log`. O Controle de Aplicativo do Windows pode bloquear `.exe` novos e não assinados; isso afeta o teste,
não o atualizador.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `HOST`, `PORT` | Servidor de conexão avulso (padrão `127.0.0.1` e `8787`) |
| `REA_WATCHDOG_TIMEOUT_SEC` | Tempo do vigia para a versão nova ficar saudável (padrão 240; só para testes) |
| `REA_UPDATER_DEV=1` | Liga o atualizador fora de um build empacotado (precisa de `dev-app-update.yml`) |
| `REA_TEST_MONITORS_FILE` | Lista de monitores simulada por um arquivo JSON (só para testes) |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | Certificado de assinatura, no pipeline |
