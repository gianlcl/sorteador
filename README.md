# Sorteador by gclabs 🎟️✨

Sorteador para eventos ao vivo com modo de números, lista de nomes e **sorteio interativo em tempo real via internet** com QR Code. Participantes de qualquer dispositivo e rede podem entrar no sorteio.

---

## 🚀 Funcionalidades

- **Múltiplos Modos**:
  - **Números**: Sorteia números aleatórios dentro de um intervalo.
  - **Lista**: Sorteia nomes ou itens a partir de uma lista preenchida.
  - **Interativo**: Sessão ao vivo via QR Code/Código para eventos.
- **Modo Teatro**: Painel em tela cheia otimizado para projetores e telões.
- **Multilinguagem (i18n)**: Suporte para Português (PT), Inglês (EN) e Espanhol (ES) com detecção automática pelo navegador.
- **Tema Personalizável**: Alternância entre Modo Claro (Sun) e Escuro (Moon).
- **Exportação e Histórico**: Registra os sorteios e permite baixar o log detalhado em arquivo de texto.

---

## 🏗️ Arquitetura

- **Frontend**: SPA em HTML/JS puro (Vanilla), servida pelo Express. Tradução carregada via JSON de forma assíncrona.
- **Backend**: Node.js + Express
- **Tempo real**: Server-Sent Events (SSE) via Redis Pub/Sub
- **Persistência**: Redis (sessões com TTL de 24h)
- **Infraestrutura**: Docker + Docker Compose + Traefik

### Estrutura de arquivos principal

```text
sorteador/
├── server/
│   ├── index.js            # Entry point Express e config
│   ├── redis.js            # Cliente Redis + helpers
│   └── routes/
│       ├── session.js      # Rotas gerais da sessão (join, kick-all, leave, delete)
│       ├── draw.js         # Operações de sorteio (draw, reset, regen) 🔒
│       └── events.js       # Stream de tempo real (SSE)
├── public/
│   ├── i18n/               # Arquivos de tradução (pt.json, en.json, es.json)
│   ├── index.html          # Frontend SPA (UI e Lógica)
│   └── logo.png
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## ⚙️ Como Executar (Desenvolvimento)

```bash
docker compose up
```

Acesse: **[http://localhost:3000](http://localhost:3000)**

Para parar:
```bash
docker compose down
```

---

## 🌐 Sorteio Interativo (Rede Real)

O modo interativo funciona com qualquer participante na internet:

1. O operador acessa o site e seleciona **Modo Interativo**
2. O servidor gera um código de 6 caracteres e um QR Code
3. Participantes escaneiam o QR Code ou acessam `{URL}/?join=CODIGO`
4. Participantes entram com nome e código — aparecem na lista do operador em tempo real (SSE)
5. O operador realiza o sorteio — resultado aparece instantaneamente na tela de todos os participantes

### Segurança da sessão

- O operador recebe um `operatorKey` (UUID) salvo no `localStorage` do navegador.
- Todas as operações de escrita da sessão requerem esse `operatorKey` no header `X-Operator-Key`.
- Participantes só podem entrar, aguardar e sair — não controlam a sessão.

---

## 🔌 API Endpoints

| Método   | Rota                           | Acesso      | Descrição                                 |
|----------|--------------------------------|-------------|-------------------------------------------|
| `GET`    | `/api/config`                  | Público     | Retorna configurações globais do servidor |
| `POST`   | `/api/session`                 | Público     | Cria nova sessão                          |
| `GET`    | `/api/session/:code`           | Público     | Estado atual da sessão                    |
| `POST`   | `/api/session/:code/join`      | Público     | Participante entra na sessão              |
| `POST`   | `/api/session/:code/leave`     | Público     | Participante sai da sessão                |
| `GET`    | `/api/session/:code/events`    | Público     | Stream SSE em tempo real                  |
| `POST`   | `/api/session/:code/draw`      | 🔒 Operador | Realiza sorteio                           |
| `POST`   | `/api/session/:code/reset`     | 🔒 Operador | Reinicia a sessão                         |
| `POST`   | `/api/session/:code/regen`     | 🔒 Operador | Regenera o código da sessão               |
| `POST`   | `/api/session/:code/kick-all`  | 🔒 Operador | Expulsa todos os participantes            |
| `DELETE` | `/api/session/:code`           | 🔒 Operador | Encerra e apaga a sessão                  |

---

## 🐳 Deploy em Produção (com Traefik externo)

Em produção, remova o serviço `traefik` do `docker-compose.yml` e configure o domínio nas labels do serviço:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.sorteador.rule=Host(`sorteador.seudominio.com`)"
  - "traefik.http.routers.sorteador.entrypoints=websecure"
  - "traefik.http.routers.sorteador.tls.certresolver=letsencrypt"
  - "traefik.http.services.sorteador.loadbalancer.server.port=3000"
  - "traefik.http.middlewares.sorteador-sse.headers.customresponseheaders.X-Accel-Buffering=no"
  - "traefik.http.routers.sorteador.middlewares=sorteador-sse"
```

> **Importante**: O `X-Accel-Buffering=no` é necessário para que o SSE (Server-Sent Events) funcione corretamente atrás do Traefik/Nginx sem *delay* ou cortes.

---

## 🔧 Variáveis de Ambiente

| Variável      | Padrão                   | Descrição                    |
|---------------|--------------------------|------------------------------|
| `REDIS_URL`   | `redis://localhost:6379` | URL de conexão com o Redis   |
| `PORT`        | `3000`                   | Porta do servidor Node       |
| `NODE_ENV`    | `development`            | Ambiente de execução         |
