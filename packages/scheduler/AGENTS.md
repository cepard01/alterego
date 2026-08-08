    # AGENTS.md — Scheduler

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§12 Scheduler** from `docs/architecture/v1-platform-architecture.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Durable job queue for delayed sends, idle timers, cooldowns, background jobs.

    ## Responsibilities
    - Delayed response execution (from human-simulation timing decisions)
- Idle timers -> ConversationEnded
- Cooldown enforcement
- Background jobs: memory expiration sweeps, summary compression, embedding re-index, periodic conversation summaries, World State ticks, longitudinal evolution passes

    ## Inputs
    Job definitions from any package (conversation, memory, human-simulation, longitudinal, offline-recovery).

    ## Outputs
    Durable job execution (BullMQ on Redis recommended).

    ## Integration points
    Depends on: events, config, observability. Used by nearly every domain package.

    ## Build status
    Foundational — build early.

    ## Ground rules for agents working in this package
    - Do not import provider SDKs, database clients, or other packages' internals
      directly — go through the interfaces those packages export (see their own
      `src/index.ts`).
    - If you need something from another package that doesn't exist yet, stub it
      with a typed interface and a `// TODO(<package-name>): implement` comment
      rather than inlining that package's logic here.
    - Every persisted entity belongs in the `data` package's repositories, not
      queried directly from this package.
    - Keep this package's public surface (what other packages import) limited to
      `src/index.ts`. Internal files are free to change; the exported interface
      is the contract other packages and other agents rely on.
    - If your changes affect the inputs/outputs/integration points described
      above, update this file in the same change.
