# Sorteador by gclabs 🎟️✨

Sorteador para eventos ao vivo com modo de números, lista de nomes e **sorteio interativo em tempo real via internet** com QR Code. Participantes de qualquer dispositivo e rede podem entrar no sorteio.

---

## 🏗️ Arquitetura

- **Frontend**: SPA em HTML/JS puro, servida pelo Express
- **Backend**: Node.js + Express
- **Tempo real**: Server-Sent Events (SSE) via Redis Pub/Sub
- **Persistência**: Redis (sessões com TTL de 24h)
- **Infraestrutura**: Docker + Docker Compose + Traefik

### Estrutura de arquivos

```
sorteador/
├── server/
│   ├── index.js            # Entry point Express
│   ├── redis.js            # Cliente Redis + helpers
│   └── routes/
│       ├── session.js      # POST /api/session, GET, join
│       ├── draw.js         # draw, reset, regen (🔒 operatorKey)
│       └── events.js       # GET /api/session/:code/events (SSE)
├── public/
│   ├── index.html          # Frontend SPA
│   └── logo.png
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## 🚀 Como Executar (Desenvolvimento)

```bash
docker compose up
```

Acesse: **[http://localhost:3001](http://localhost:3001)** (ou `http://sorteador.localhost` via Traefik)

- **Traefik dashboard**: http://localhost:8088

Para parar:
```bash
docker compose down
```

### Sem Traefik

Comente o serviço `traefik` e as `labels` do serviço `app` no `docker-compose.yml`, e acesse diretamente em `http://localhost:3001`.

---

## 🌐 Sorteio Interativo (Rede Real)

O modo interativo funciona com qualquer participante na internet:

1. O operador acessa o site e seleciona **Modo Interativo**
2. O servidor gera um código de 6 caracteres e um QR Code
3. Participantes escaneiam o QR Code ou acessam `{URL}/?join=CODIGO`
4. Participantes entram com nome e código — aparecem na lista do operador em tempo real (SSE)
5. O operador realiza o sorteio — resultado aparece instantaneamente na tela de todos os participantes

### Segurança da sessão

- O operador recebe um `operatorKey` (UUID) salvo no `localStorage` do navegador
- Todas as operações de escrita (sortear, reiniciar, regenerar) requerem esse `operatorKey` no header `X-Operator-Key`
- Participantes só podem entrar e aguardar — não podem controlar o sorteio

---

## 🐳 Deploy em Produção (com Traefik externo)

Em produção, remova o serviço `traefik` do `docker-compose.yml` e configure o domínio nas labels:

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

> **Importante**: O `X-Accel-Buffering=no` é necessário para que o SSE (Server-Sent Events) funcione corretamente atrás do Traefik/Nginx sem delay.

---

## 🔌 API Endpoints

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| `POST` | `/api/session` | Público | Cria nova sessão |
| `GET` | `/api/session/:code` | Público | Estado da sessão |
| `POST` | `/api/session/:code/join` | Público | Participante entra |
| `GET` | `/api/session/:code/events` | Público | Stream SSE |
| `POST` | `/api/session/:code/draw` | 🔒 Operador | Realiza sorteio |
| `POST` | `/api/session/:code/reset` | 🔒 Operador | Reinicia sessão |
| `POST` | `/api/session/:code/regen` | 🔒 Operador | Regenera código |

---

## ⚙️ Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `REDIS_URL` | `redis://localhost:6379` | URL do Redis |
| `PORT` | `3000` | Porta do servidor Node |
| `NODE_ENV` | `development` | Ambiente de execução |
