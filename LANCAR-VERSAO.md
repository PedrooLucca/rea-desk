# Como lançar uma nova versão (atualização automática)

Os usuários recebem a versão nova sozinhos: o programa procura atualizações ao abrir (e a cada 4 horas), baixa só o que
mudou, e instala ao reiniciar. Os dados do usuário (nome, código, configurações) ficam fora da pasta do programa e são mantidos.

## 1. Preparação (uma vez só)

1. **Instale o Git** (`winget install Git.Git`) e crie uma conta no GitHub.
2. **Crie um repositório** no GitHub (pode ser privado só se você configurar um token de leitura nos clientes; para uso
   simples, crie **público**) com o nome que quiser, por exemplo `rea-desk`.
3. *(Já feito)* O repositório está informado em `package.json`, bloco `build > publish`: usuário `PedrooLucca`, repositório
   `rea-desk`. Se usar outro nome de repositório, altere o campo `repo` ali.
4. **Envie o projeto** para o repositório (o commit inicial já existe localmente; na pasta do projeto):
   ```bash
   git remote add origin https://github.com/PedrooLucca/rea-desk.git
   git push -u origin main
   ```
   Na primeira vez o Git abre o navegador para você entrar no GitHub (é o seu login; ninguém mais precisa dele).
   **Primeira versão publicada** (a versão 0.3.0 que já está no `package.json`):
   ```bash
   git tag -a v0.3.0 -m "Versão 0.3.0"
   git push origin v0.3.0
   ```
   Isso dispara o GitHub Actions, que gera a Release com o instalador. Depois disso, use `npm run release -- patch`.
5. *(Recomendado)* **Assinatura digital**: compre um certificado de assinatura de código (.pfx) e guarde-o nos *Secrets* do
   repositório (Settings > Secrets and variables > Actions): `WIN_CSC_LINK` (o .pfx em base64 ou uma URL) e
   `WIN_CSC_KEY_PASSWORD`. O pipeline passa a assinar sozinho. Depois acrescente em `package.json`, em `build.win`,
   `"signtoolOptions": { "publisherName": ["Nome da sua empresa conforme o certificado"] }` para o atualizador também
   **verificar a assinatura** antes de instalar. **Sem certificado não use `publisherName`** (as atualizações falhariam).
6. **Primeira instalação dos usuários:** esta continua manual. Lance a primeira versão (passo 2), baixe o instalador em
   *Releases* e entregue aos usuários. Quem já tem uma versão **anterior à 0.3.0** precisa instalar uma vez a nova;
   só a partir dela as atualizações são automáticas.

## 2. Lançar uma versão (um comando)

```bash
npm run release -- patch     # 0.3.0 -> 0.3.1  (correções)
npm run release -- minor     # 0.3.0 -> 0.4.0  (novidades)
npm run release -- major     # 0.3.0 -> 1.0.0  (mudanças grandes)
npm run release -- 1.0.1     # versão exata
```

O comando roda os testes, atualiza a versão, cria o *commit* e a etiqueta (`v1.0.1`) e envia ao GitHub. O **GitHub Actions**
(`.github/workflows/release.yml`) então compila, assina (se houver certificado), gera o instalador, o `latest.yml` e o
`.blockmap` (para o download incremental) e publica em *Releases*. Acompanhe em **GitHub > aba Actions**; em poucos minutos a
versão chega aos usuários. Dica: acrescente `--dry-run` para só ver o que seria feito.

**Atualizar com ou sem perguntar:** por padrão, correções pequenas (só o número final muda, ex.: 1.0.0 → 1.0.1) são
instaladas sozinhas quando o programa não está em acesso remoto; versões maiores perguntam ("Atualizar agora ou depois?").
Você pode forçar escrevendo na descrição da Release (no GitHub) `[silencioso]` ou `[perguntar]`.

**Se uma versão sair com problema:** o próprio programa faz *rollback* sozinho (veja abaixo). Para tirá-la do ar, apague a Release
no GitHub e lance uma versão corrigida com número maior.

## 3. Testar o fluxo de atualização no seu computador, antes de publicar

Usa uma identidade separada ("REA Desk Teste"), com pasta de dados própria: **não mexe na sua instalação real**.

```bash
npm run update:build-local -- 1.0.0          # instalador de teste 1.0.0  (dist-local\)
# instale dist-local\REA-Desk-Teste-Instalar-1.0.0.exe (dois cliques) e abra "REA Desk Teste"
npm run update:build-local -- 1.0.1          # versão nova de teste
npm run update:serve-local                   # deixe rodando: servidor de atualizações em http://127.0.0.1:8899
```

Com o servidor ligado, no "REA Desk Teste" abra **Configurações > Procurar atualizações** (ou aguarde ~20 s). Você verá o
download e a instalação. Para testar o **rollback**, gere uma versão quebrada de propósito e deixe o app atualizar para ela:

```bash
npm run update:build-local -- 1.0.2 --broken        # fecha ao abrir
```

Em cerca de 4 minutos (60 s se você abrir o app de teste com a variável `REA_WATCHDOG_TIMEOUT_SEC=60`) o programa volta sozinho
para a versão anterior e mostra um aviso. Registro de tudo: `%APPDATA%\rea-desk-teste\updater\updater.log`.
Quando terminar, desinstale "REA Desk Teste" em *Aplicativos instalados*.

> No seu Windows, o *Controle de Aplicativo* pode bloquear `.exe` novos e não assinados (isso afetou os testes aqui).
> Se o instalador de teste for bloqueado, é o Windows, não o atualizador: o remédio real é assinar o executável.

## 4. Como funciona e o que protege o usuário

- **Verificação** em segundo plano; sem internet ou com o servidor fora do ar, nada é mostrado (só vai para o log).
- **Download incremental** (blockmap): baixa só os blocos que mudaram. A integridade é conferida pelo `sha512` do `latest.yml`.
- **Backup + vigia + rollback:** antes de instalar, o programa guarda uma cópia da versão atual e inicia um vigia
  independente. A versão nova precisa ficar viva e carregada por ~8 s e avisar "estou saudável". Se não avisar em 4 minutos,
  o vigia restaura a versão anterior, reabre o programa, avisa o usuário e marca a versão ruim para **não ser baixada de novo**.
- **Não interrompe acesso remoto:** a instalação espera a sessão terminar.
- **Dados do usuário** ficam em `%APPDATA%\rea-desk` (`localStorage`), nunca na pasta do programa. **Nunca mude o campo `name` do
  `package.json`**: é ele que define essa pasta.
- **Migração de dados:** `src/renderer/migrations.js`. Para mudar o formato de algum dado, aumente `CURRENT` e acrescente um
  passo (`2(s) { ... }`). Os passos só ajustam/adicionam chaves e nunca apagam; dados de versão mais nova (depois de um rollback)
  são deixados como estão. Testes: `npm test`.
- **Versionamento semântico** (MAIOR.MENOR.CORREÇÃO), comparado pela biblioteca `semver`; versões menores nunca são instaladas
  por cima de maiores.
