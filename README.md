# AlterEgo

Experimental research project: an autonomous conversational agent with
long-term memory, identity, and simulated human behavior — not a chatbot
wrapper around an LLM. Each persona is an "alter ego": a continuous,
self-consistent simulated person rather than a stateless responder.

## Start here

- `docs/architecture/v1-platform-architecture.md` — core platform: gateway,
  memory, LLM router, event system, database, security, observability.
- `docs/architecture/v2-human-simulation.md` — the Human Simulation Layer:
  World State, Psychology, Thoughts, Social Graph, Timing, Stickers,
  Variability.
- `docs/architecture/v3-identity-continuity.md` — Identity, Life Timeline,
  Goals, Calendar, Cognitive Load, Memory Confidence, and the Offline
  Recovery Engine (read this one before deploying anywhere real).
- `AGENTS.md` (repo root) — instructions for AI coding agents working in
  this repo.

## Layout

Single TypeScript project (ESM), one folder per bounded context under
`src/`. `src/runtime` is the composition root that wires everything and
boots the process; `src/dashboard` is the internal admin UI. Cross-module
imports use the `@alterego/<module>` alias and only touch each module's
`index.ts` — that is what keeps the architecture's module boundaries real
instead of aspirational as the codebase grows.

```
src/
  events, config, observability, data, security, scheduler, llm   -- foundational
  gateway, media                                                  -- I/O edges
  memory, personality, identity, psychology, thoughts,
  social-graph, human-simulation, messaging-behavior,
  conversation, offline-recovery, longitudinal, evaluation        -- domain logic
  runtime/       composition root
  dashboard/     admin UI

test/            one test file per module
infra/
  db/migrations/ SQL migrations, applied in order
  docker/
docs/architecture/  v1, v2, v3
```

## Setup

```
npm install
cp .env.example .env   # fill in provider keys and DB/Redis URLs
```

## Running

```
npm run typecheck   # tsc --noEmit over src/ and test/
npm test            # full vitest suite (no DB needed)
npm run dev:memory  # boot the runtime in-memory, no Postgres/Redis required
npm run dev         # boot the runtime against the configured DB/Redis
```
