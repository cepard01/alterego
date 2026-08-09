# AlterEgo

<p align="center">
  <strong>An autonomous conversational agent with long-term memory, continuous identity, and simulated human behavior.</strong>
</p>

<p align="center">
  Not a generic chatbot wrapper. Each persona is an <em>alter ego</em>: a continuous, self-consistent simulated person — not a stateless responder.
</p>

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/cepard01/alterego.git
cd alterego
npm install

# 2. Configure environment
cp .env.example .env

# 3. Boot in-memory (zero external dependencies)
npm run dev:memory

# 4. Or boot against Postgres + Redis
npm run dev
```

| Command | Description |
|---------|-------------|
| `npm run typecheck` | Strict TypeScript check (`tsc --noEmit`) |
| `npm test` | Full Vitest suite — 171 tests, no DB needed |
| `npm run test:watch` | Watch mode with HMR |
| `npm run dev:memory` | SQLite in-memory runtime — zero external dependencies |
| `npm run dev` | Runtime against Postgres + Redis |

---

## What It Does

AlterEgo is an experimental research platform that simulates continuous, realistic artificial humans. Each persona maintains:

- 🧠 **Long-term memory** — recalls conversations, events, and identity across sessions
- 🎭 **Continuous identity** — goals, personality profile, life timeline, and self-evolution
- ⏱️ **Human timing** — variable response delays, sticker selection, psychological states, cognitive load
- 🔄 **Offline Recovery** — reconstructs context after absence without losing the thread
- 🌐 **Multi-provider LLM** — intelligent routing across OpenAI, Anthropic, Google, Ollama, and OpenRouter with circuit breakers

---

## Architecture

```
src/
├── foundational/
│   ├── config/              # Centralized config with Zod schemas
│   ├── events/              # Event bus for intra-module communication
│   ├── llm/                 # Router, circuit breaker, provider adapters
│   ├── data/                # Repositories, MikroORM, SQLite/Postgres schema
│   ├── security/            # Auth, rate limiting, retention, validation
│   ├── observability/       # Logger, metrics, health checks, token tracking
│   └── scheduler/           # In-memory queue, idle timer, job scheduling
│
├── i-o-edges/
│   ├── gateway/             # Transport adapters (Baileys/WhatsApp, Cloud API)
│   └── media/               # Media processing
│
├── domain-logic/
│   ├── memory/              # Short/long-term memory, contradiction detection
│   ├── personality/         # Profile, variability, personality baseline
│   ├── identity/            # Identity service, goals, calendar
│   ├── psychology/          # Cognitive load, world state, psychological states
│   ├── thoughts/            # Generator, verifier, false memories
│   ├── social-graph/        # Social graph, clusters, relationships
│   ├── human-simulation/    # Timing, stickers, simulation engine
│   ├── messaging-behavior/  # Message planner and executor
│   ├── conversation/        # Manager, pipeline, context/prompt builder
│   ├── offline-recovery/    # Context reconstruction, backlog, freshness scoring
│   ├── longitudinal/        # Identity evolution, interest drift
│   └── evaluation/          # Heuristics, quality assessment
│
├── skills/                  # Agent skills runtime (registry, loader, execution)
├── runtime/                 # Composition root — bootstrap and wiring
└── dashboard/               # Internal admin UI for inspection and tuning
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js >= 20, ESM |
| Language | TypeScript 5.5 (strict mode) |
| ORM | MikroORM v7 (SQLite / PostgreSQL) |
| Validation | Zod |
| Testing | Vitest (171 tests, 23 modules) |
| LLM Providers | OpenAI, Anthropic, Google, Ollama, OpenRouter |
| Transport | Baileys (WhatsApp), Cloud API |
| Skills | agent-skills (addyosmani/agent-skills) |

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 20 | Runtime |
| npm | >= 9 | Package manager |
| PostgreSQL | >= 14 | Primary database (optional for `dev:memory`) |
| Redis | >= 7 | Cache and queues (optional for `dev:memory`) |

> **Pro tip**: Use `npm run dev:memory` for instant startup — it runs on SQLite in-memory with no external services required.

---

## Environment Variables

```env
# Database (Postgres in production, SQLite in dev:memory)
DATABASE_URL=postgres://localhost:5432/alterego
REDIS_URL=redis://localhost:6379

# At least one LLM provider key
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
OPENROUTER_API_KEY=...

# Gateway configuration
WHATSAPP_PROVIDER=baileys
LOG_LEVEL=info
```

---

## Tests

The suite runs **171 tests** across **23 modules**. No external database is required.

```bash
npm test
```

**Module coverage:**
- Config, Events, Gateway, LLM, Data, Scheduler
- Identity, Memory, Personality, Psychology
- Conversation, MessagingBehavior, HumanSimulation
- OfflineRecovery, Longitudinal, Evaluation
- SocialGraph, Thoughts, Media, Observability, Security, Runtime

---

## Project Status

> [!IMPORTANT]
> Active development. Architecture is complete and functional — typecheck passes, 171/171 tests green, runtime boots successfully.

### Milestones

- [x] v1 Platform Architecture (core platform)
- [x] v2 Human Simulation Layer (timing, variability, psychology)
- [x] v3 Identity Continuity (goals, timeline, offline recovery)
- [x] 30 MikroORM entities with auto-schema
- [x] Parameterized SQL repositories
- [x] Multi-provider LLM router with circuit breaker
- [x] Offline Recovery Engine
- [x] 171 tests passing
- [x] Agent Skills integration (addyosmani/agent-skills)

---

## Documentation

- `docs/architecture/v1-platform-architecture.md` — Core platform
- `docs/architecture/v2-human-simulation.md` — Human Simulation Layer
- `docs/architecture/v3-identity-continuity.md` — Identity & Offline Recovery
- `AGENTS.md` — Instructions for AI coding agents working in this repo
- `references/agent-skills/` — Production-grade engineering skills for AI coding agents

---

## Contributing

This project follows the [Agent Skills](https://github.com/addyosmani/agent-skills) workflow:

1. **Spec** — Define the change before coding (`/spec`)
2. **Plan** — Break into atomic tasks (`/plan`)
3. **Build** — Implement incrementally (`/build`)
4. **Test** — Prove it works (`/test`)
5. **Review** — Quality gate before merge (`/review`)
6. **Ship** — Deploy with confidence (`/ship`)

See `AGENTS.md` for repository-specific conventions and module boundaries.

---

## License

MIT

---

<p align="center">
  Built with architectural rigor. No shortcuts.
</p>
