# AGENTS.md — Repository-wide instructions for AI coding agents

This project has a **complete architecture already written** before any
code exists. Do not redesign, simplify, or reinterpret the architecture
while implementing it — if something in the docs seems wrong or
underspecified, say so explicitly and ask, rather than silently deviating.

## Layout

Single TypeScript project (ESM, `"type": "module"`), no workspaces. Every
module is a folder under `src/`, one per bounded context from the
architecture docs. The composition root lives in `src/runtime` and the
admin dashboard in `src/dashboard`.

```
src/
  events, config, observability, data, security, scheduler, llm   -- foundational
  gateway, media                                                  -- I/O edges
  memory, personality, identity, psychology, thoughts,
  social-graph, human-simulation, messaging-behavior,
  conversation, offline-recovery, longitudinal, evaluation        -- domain logic
  runtime/       composition root — wires modules together, boots the process
  dashboard/     internal UI for inspecting/tuning the running agent

test/           one test file per module (module name = file name)
infra/          db/migrations (SQL), docker
docs/           architecture/ (v1, v2, v3) — the source of truth
```

## Before writing any code

1. Read `docs/architecture/v1-platform-architecture.md`,
   `v2-human-simulation.md`, and `v3-identity-continuity.md` — at least
   skim all three, even if you're only working in one module, since later
   documents extend earlier ones rather than replacing them.
2. Check that a module's stated dependencies actually exist (even as
   stubs) before assuming their interfaces.

## Commands

- `npm run typecheck` — `tsc --noEmit` (src + test must both be clean)
- `npm test` — the whole vitest suite in `test/`
- `npm run dev` — boot the runtime against real Postgres/Redis
- `npm run dev:memory` — boot with `ALTEREGO_MEMORY_MODE=1`, no DB needed

## Module boundary rules (non-negotiable)

- A module only imports from another module's `src/<module>/index.ts` —
  never reaches into another module's internal files. Cross-module
  imports use the `@alterego/<module>` alias; both tsconfig paths and the
  vitest config resolve it.
- No module talks to a provider SDK (OpenAI, Anthropic, WhatsApp
  transport, Postgres client) directly except the module whose whole job
  is that integration (`llm`, `gateway`, `data` respectively).
- Persisted state lives in `data`'s repositories. If you need a new
  table, add it there (plus a migration in `infra/db/migrations`), not
  inline in a domain module.
- Cross-module communication for anything event-shaped goes through
  `events`, not direct function calls between unrelated modules.

## Working style for this codebase specifically

- This system is explicitly designed to run indefinitely, not just for a
  short experiment (see v3's opening section) — don't take shortcuts that
  assume a short-lived process (e.g., in-memory-only state for anything
  the docs mark as persisted).
- Realism work (Human Simulation, Timing, Variability, Offline Recovery)
  is the actual point of this project. Treat it with the same rigor as
  the "serious" infrastructure — it is not a nice-to-have layer on top.
- Bounded variability (v2 §11) and bounded evolution (v3 §9) are load-
  bearing constraints, not suggestions: any randomness or drift must be
  anchored to a stored baseline and must revert/decay back toward it.
  Don't implement open-ended randomness anywhere in this codebase.
- Consent/disclosure is called out as an open item in v3 §10 — if you're
  asked to build onboarding or first-contact flows, that's the right
  place to make sure the human on the other end knows they're talking to
  a simulation. Don't design around avoiding that disclosure.
- Type-only re-exports must use `export type` (never `export { Type }`)
  — tsx/esbuild resolve the source directly and cannot elide them.

## When the docs and the code disagree

The architecture docs win. If you update a module's public interface in a
way that changes its inputs/outputs/integration points, update this file
and `README.md` in the same change so the next agent isn't working from
stale notes.
