# AlterEgo

<p align="center">
  <strong>Um agente conversacional autônomo com memória de longo prazo, identidade própria e comportamento humano simulado.</strong>
</p>

<p align="center">
  Não é um chatbot genérico. Cada persona é um <em>alter ego</em>: uma pessoa simulada, contínua e auto-consistente — não um responder stateless.
</p>

---

## Sobre o Projeto

O **AlterEgo** é um projeto de pesquisa experimental que simula seres humanos artificiais capazes de:

- 🧠 **Memória de longo prazo** — lembra de conversas, eventos e identidade ao longo do tempo
- 🎭 **Identidade contínua** — objetivos, personalidade, timeline de vida e evolução própria
- ⏱️ **Comportamento humano realista** — timing variável, stickers, estados psicológicos, carga cognitiva
- 🔄 **Offline Recovery** — reconstrói contexto ao voltar de uma ausência, sem perder a linha
- 🌐 **Multi-provider LLM** — roteamento inteligente entre OpenAI, Anthropic, Google, Ollama e OpenRouter

A arquitetura é dividida em **camadas de bounded contexts**, cada uma com sua responsabilidade, mantendo fronteiras de módulo rígidas via imports explícitos.

---

## Arquitetura

```
src/
├── foundational/
│   ├── config/           # Configuração central com Zod schemas
│   ├── events/           # Event bus para comunicação intra-módulo
│   ├── llm/              # Router, circuit breaker, adapters de providers
│   ├── data/             # Repositórios, MikroORM, schema SQLite/Postgres
│   ├── security/         # Auth, rate-limiter, retention, validação
│   ├── observability/    # Logger, métricas, health checks, token tracking
│   └── scheduler/        # Fila em memória, idle timer, agendamento
│
├── i-o-edges/
│   ├── gateway/          # Transport adapters (Baileys/WhatsApp, Cloud API)
│   └── media/            # Processamento de mídia
│
├── domain-logic/
│   ├── memory/           # Memória de curto/longo prazo, contradições
│   ├── personality/      # Perfil, variabilidade, baseline de personalidade
│   ├── identity/         # Serviço de identidade, goals, calendar
│   ├── psychology/       # Carga cognitiva, world state, estados
│   ├── thoughts/         # Gerador, verificador, falsas memórias
│   ├── social-graph/     # Grafo social, clusters, relações
│   ├── human-simulation/ # Timing, stickers, engine de simulação
│   ├── messaging-behavior/ # Planner e executor de mensagens
│   ├── conversation/     # Gerenciador, pipeline, context/prompt builder
│   ├── offline-recovery/ # Reconstrução de contexto, backlog, freshness
│   ├── longitudinal/     # Evolução de identidade, drift de interesses
│   └── evaluation/       # Heurísticas, avaliação de qualidade
│
├── runtime/              # Composition root — bootstrap e wiring
└── dashboard/            # UI interna para inspeção e tuning
```

---

## Pré-requisitos

| Ferramenta | Versão | Descrição |
|------------|--------|-----------|
| Node.js | >= 20 | Runtime |
| npm | >= 9 | Gerenciador de pacotes |
| PostgreSQL | >= 14 | Banco principal (opcional p/ dev) |
| Redis | >= 7 | Cache e filas (opcional p/ dev) |

> **Dica para desenvolvimento rápido**: Use o modo `dev:memory` — ele roda com SQLite em memória, sem precisar de Postgres ou Redis instalados.

---

## Setup

```bash
# 1. Clone e instale dependências
git clone https://github.com/cepard01/alterego.git
cd alterego
npm install

# 2. Configure variáveis de ambiente
cp .env.example .env
# Edite o .env com suas chaves de API e URLs de banco
```

### Variáveis de ambiente obrigatórias

```env
# Banco de dados (Postgres em produção, SQLite em dev:memory)
DATABASE_URL=postgres://localhost:5432/alterego
REDIS_URL=redis://localhost:6379

# Chaves de pelo menos um provedor LLM
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
OPENROUTER_API_KEY=...

# Configurações do gateway
WHATSAPP_PROVIDER=baileys
LOG_LEVEL=info
```

---

## Como Rodar

### Modo desenvolvimento com banco real (Postgres + Redis)

```bash
# Certifique-se que Postgres e Redis estão rodando
npm run dev
```

### Modo desenvolvimento rápido (sem banco externo)

```bash
# Roda com SQLite em memória + MikroORM
# Nenhum Postgres ou Redis necessário
npm run dev:memory
```

### Comandos úteis

```bash
# Type check rigoroso (src + test)
npm run typecheck

# Rodar toda a suíte de testes
npm test

# Rodar testes em modo watch (desenvolvimento)
npm run test:watch
```

---

## Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run typecheck` | TypeScript strict check (`tsc --noEmit`) |
| `npm test` | Suíte completa de testes (Vitest) |
| `npm run test:watch` | Testes em modo watch com HMR |
| `npm run dev` | Boot do runtime contra Postgres + Redis |
| `npm run dev:memory` | Boot com SQLite em memória, zero dependências externas |

---

## Testes

A suíte roda **171 testes** cobrindo 23 módulos. Nenhum banco de dados externo é necessário para rodar os testes.

```bash
npm test
```

**Cobertura por módulo:**
- Config, Events, Gateway, LLM, Data, Scheduler
- Identity, Memory, Personality, Psychology
- Conversation, MessagingBehavior, HumanSimulation
- OfflineRecovery, Longitudinal, Evaluation
- SocialGraph, Thoughts, Media, Observability, Security, Runtime

---

## Decisões Técnicas

- **ESM puro** — `"type": "module"` em todo o projeto
- **MikroORM v7** — schema auto-criado, suporte a SQLite e Postgres, lazy init
- **Vitest** — testes rápidos com HMR
- **Zod** — validação de config e schemas de API
- **Cross-module via eventos** — módulos não se chamam diretamente, usam o event bus
- **Type-only re-exports** — `export type` para evitar bundling de tipos em runtime

---

## Status do Projeto

> [!IMPORTANT]
> Projeto em desenvolvimento ativo. A arquitetura está completa e funcional — tipos passam, 171/171 testes verdes, runtime boota.

### Checklist

- [x] Arquitetura v1 (Plataforma base)
- [x] Arquitetura v2 (Human Simulation Layer)
- [x] Arquitetura v3 (Identity Continuity)
- [x] Schema de banco + 30 entidades MikroORM
- [x] Repositórios com SQL parametrizado
- [x] Router LLM multi-provider com circuit breaker
- [x] Offline Recovery Engine
- [x] 171 testes passing

---

## Documentação

- `docs/architecture/v1-platform-architecture.md` — Core platform
- `docs/architecture/v2-human-simulation.md` — Human Simulation Layer
- `docs/architecture/v3-identity-continuity.md` — Identity & Offline Recovery
- `AGENTS.md` — Instruções para agentes de IA trabalhando no repo

---

<p align="center">
  Construído com rigor arquitetural. Nada de atalhos.
</p>
