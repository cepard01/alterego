    # AGENTS.md — Data Access Layer

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§4 Data Models, §14 Database Design** from `docs/architecture/v1-platform-architecture.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Repositories and migrations for every persisted entity across v1/v2/v3.

    ## Responsibilities
    - Postgres schema + migrations for: User, Conversation, Message, Media, Memory, Relationship, Personality, Session, Knowledge, BehaviorProfile, Reminder, TaskQueue (v1); WorldState, Thought, SocialGraphNode/Edge/Cluster, Sticker, PsychologyState, EvaluationReport (v2); IdentityProfile, TimelineEvent, InventoryItem, Goal, CalendarEntry, MemoryContradiction, RecoveryPlan, IdentityEvolutionProposal (v3)
- pgvector setup for embedding columns (Memory, Knowledge, Thought)
- Repository pattern — no other package should write raw SQL

    ## Inputs
    Postgres connection (from config), Redis connection (from config).

    ## Outputs
    Typed repository classes, one per entity family.

    ## Integration points
    Depends on: config, observability. Used by: memory, identity, social-graph, conversation, evaluation, offline-recovery.

    ## Build status
    Foundational — build third, before any domain package.

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
