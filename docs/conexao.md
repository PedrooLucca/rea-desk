# Conexão entre os computadores

O vídeo, o mouse, o teclado, os arquivos e a conversa vão **direto entre os dois computadores** (WebRTC, criptografado). Um servidor de conexão
só apresenta um computador ao outro (troca os dados necessários para abrir a conexão) e nunca vê a imagem nem o que é digitado.

## Na mesma rede (Wi-Fi ou cabo): sem configurar nada

O programa já traz o servidor de conexão embutido. O primeiro computador que abre vira o "ponto de encontro" da rede e os demais o encontram
sozinhos (descoberta por broadcast UDP). Se esse computador for fechado, os outros se reconectam sozinhos em poucos segundos; uma sessão em
andamento não é afetada, porque a imagem vai direto entre os dois. Na primeira vez o Windows pode pedir permissão de rede: clique em
**Permitir acesso**.

| Uso | Porta |
|---|---|
| Servidor de conexão (WebSocket) | TCP 8787 |
| Descoberta na rede local | UDP 41234 |

## Pela internet: servidor de conexão próprio

Fora da rede local é preciso um servidor de conexão hospedado por você (uma vez só):

1. Hospede o `Dockerfile` do projeto em um serviço com HTTPS (Render, Fly.io, Railway, uma VPS etc.). Ele sobe o `server/server.js` na porta
   8787 escutando em todas as interfaces (`HOST=0.0.0.0`).
2. Coloque o endereço em `config/defaults.json`: `"serverUrl": "wss://seu-servidor.exemplo.com"`.
3. Gere o instalador de novo (`npm run dist`). Os instaladores gerados já saem configurados.

Cada pessoa também pode apontar o programa para outro servidor em **Configurações → Avançado** (campo vazio = automático).

Rodando o servidor sem Docker: `npm run server`. Por padrão ele escuta só em `127.0.0.1:8787`; use as variáveis `HOST` e `PORT` para mudar
(`HOST=0.0.0.0` aceita conexões da rede).

## STUN e TURN

`config/defaults.json` traz `"stun": "stun:stun.l.google.com:19302"`, usado para descobrir o endereço público (pela internet). O projeto **não
tem servidor TURN**: redes muito restritivas (CGNAT, algumas redes de empresas) podem não conseguir conectar. O STUN também pode ser trocado
em Configurações → Avançado.

## Segurança do servidor

O servidor de conexão não tem autenticação nem limite de tentativas; ele só aceita mensagens pequenas (até 64 KB) e só encaminha mensagens entre
computadores com uma chamada em andamento. Todo acesso depende de quem está sendo acessado clicar em **Permitir**.
