# AGENTS.md — Repository-wide instructions for AI coding agents

This project has a **complete architecture already written** before any
code exists. Do not redesign, simplify, or reinterpret the architecture
while implementing it — if something in the docs seems wrong or
underspecified, say so explicitly and ask, rather than silently deviating.

## Before writing any code

1. Read `docs/architecture/v1-platform-architecture.md`,
   `v2-human-simulation.md`, and `v3-identity-continuity.md` — at least
   skim all three, even if you're only working in one package, since
   later documents extend earlier ones rather than replacing them.
2. Read the `AGENTS.md` in the specific package you're working in.
3. Check that package's stated dependencies actually exist (even as stubs)
   before assuming their interfaces.

## Module boundary rules (non-negotiable)

- A package only imports from another package's `src/index.ts` — never
  reaches into another package's internal files.
- No package talks to a provider SDK (OpenAI, Anthropic, WhatsApp
  transport, Postgres client) directly except the package whose whole job
  is that integration (`llm`, `gateway`, `data` respectively).
- Persisted state lives in `data`'s repositories. If you need a new table,
  add it there, not inline in a domain package.
- Cross-package communication for anything event-shaped goes through
  `events`, not direct function calls between unrelated packages.

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

## When a package's AGENTS.md and the architecture doc disagree

The architecture doc wins. Package AGENTS.md files are generated
summaries meant to save you a re-read, not the source of truth. If you
update a package's public interface in a way that changes its inputs/
outputs/integration points, update that package's AGENTS.md in the same
change so the next agent isn't working from stale notes.
