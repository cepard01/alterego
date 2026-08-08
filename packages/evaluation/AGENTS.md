    # AGENTS.md — Behavior Evaluation

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§9 Behavior Evaluation** from `docs/architecture/v2-human-simulation.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Post-session scoring of naturalness, consistency, and human-likeness, surfaced in the admin dashboard for manual tuning.

    ## Responsibilities
    - Subscribe to ConversationEnded; run LLM-judge + heuristic scoring pass
- Compute: naturalness, behavior/personality/memory consistency, conversation flow, latency realism, media/sticker/emoji usage vs targets, human-likeness composite, relationship evolution delta
- Write EvaluationReport, linked to Conversation

    ## Inputs
    Full conversation transcript + Timing Model expected distributions + Behavior Profile targets.

    ## Outputs
    EvaluationReport records, surfaced in apps/admin-dashboard.

    ## Integration points
    Depends on: data, llm, events. Feeds: longitudinal (evidence source).

    ## Build status
    Build after the core pipeline is functional enough to produce real sessions to evaluate.

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
