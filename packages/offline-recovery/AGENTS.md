    # AGENTS.md — Offline Recovery Engine

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§8 Offline Recovery Engine** from `docs/architecture/v3-identity-continuity.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Handles what happens when the process was offline for hours/days: backlog analysis, freshness scoring, context reconstruction, recovery response planning.

    ## Responsibilities
    - Detect downtime gap via heartbeat/last-active timestamp check on boot
- FreshnessScorer per conversation -> strategy (respond_normally / respond_with_summary_awareness / respond_with_soft_acknowledgment / skip_silently / reopen_selectively)
- Context Reconstructor: raw messages (short gap) / compressed summary (medium gap) / summary + unanswered questions only (long gap)
- Stagger recovery responses via scheduler rather than sending all at once on boot

    ## Inputs
    Process boot event, last_active_at per conversation, social-graph relationship strength, memory (unanswered question detection).

    ## Outputs
    RecoveryPlan per conversation, consumed by the standard conversation pipeline.

    ## Integration points
    Depends on: data, memory, social-graph, scheduler, events. Runs once at startup, then hands off to normal event-driven operation.

    ## Build status
    Build once the core pipeline (conversation, human-simulation) works end-to-end — this wraps it, doesn't replace it. Treat as near-mandatory before any real deployment, per v3's closing gap analysis.

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
