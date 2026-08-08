# WhatsApp AI Agent

Experimental research project: an autonomous WhatsApp conversational agent
with long-term memory, identity, and simulated human behavior — not a
chatbot wrapper around an LLM.

## Start here

- `docs/architecture/v1-platform-architecture.md` — core platform: gateway,
  memory, LLM router, event system, database, security, observability.
- `docs/architecture/v2-human-simulation.md` — the Human Simulation Layer:
  World State, Psychology, Thoughts, Social Graph, Timing, Stickers,
  Variability.
- `docs/architecture/v3-identity-continuity.md` — Identity, Life Timeline,
  Goals, Calendar, Cognitive Load, Memory Confidence, and the Offline
  Recovery Engine (read this one before deploying anywhere real).
- `AGENTS.md` (this folder's root) — instructions for AI coding agents
  working anywhere in this repo.

## Layout

This is a pnpm workspace. Business logic lives in `packages/*`, one package
per bounded context from the architecture docs. `apps/*` contains the two
things that actually run: the runtime process and the admin dashboard.
Every package folder has its own `AGENTS.md` — read it before writing code
in that package.

```
apps/
  agent-runtime/       composition root — wires packages together, boots the process
  admin-dashboard/     internal UI for inspecting/tuning the running agent

packages/
  events, config, observability, data, security, scheduler, llm   -- foundational
  gateway, media                                                  -- I/O edges
  memory, personality, identity, psychology, thoughts,
  social-graph, human-simulation, messaging-behavior,
  conversation, offline-recovery, longitudinal, evaluation        -- domain logic

docs/
  architecture/        the three architecture documents (v1, v2, v3)
```

No package imports another package's internals — only what that package
exports from `src/index.ts`. This is what keeps the architecture's module
boundaries real instead of aspirational as the codebase grows.

## Suggested build order

1. Foundational: `events` -> `config` -> `observability` -> `data` -> `llm`
     -> `scheduler` -> `security`
2. I/O edges: `gateway`, `media`
3. Domain state: `memory`, `personality`, `identity`, `psychology`,
   `thoughts`, `social-graph`
4. Decision layer: `human-simulation`, `messaging-behavior`
5. Integration hub: `conversation` (depends on nearly everything above)
6. Resilience & long-run: `offline-recovery`, `evaluation`, `longitudinal`
7. Apps: `agent-runtime`, `admin-dashboard`

Each package's `AGENTS.md` states its dependencies explicitly — this order
is a starting recommendation, not a hard rule.

## Setup

```
pnpm install
cp .env.example .env   # fill in provider keys and DB/Redis URLs
pnpm build
```
