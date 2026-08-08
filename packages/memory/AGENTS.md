    # AGENTS.md — Memory System

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **v1 §5 Memory Architecture, v3 §7 Memory Confidence** from `docs/architecture/v1-platform-architecture.md` and `docs/architecture/v3-identity-continuity.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Working, conversation, and long-term memory with ranking, retrieval, and confidence/uncertainty modeling.

    ## Responsibilities
    - Working memory (in-process, per-turn scratch state)
- Conversation memory (Redis, recent window + session topic stack)
- Long-term memory: facts, preferences, summaries, embeddings
- Memory ranking: similarity + importance + recency decay + social_relevance (from social-graph) + timeline_relevance (from identity)
- Memory expiration / importance scoring
- v3 additions: confidence, source, verification_status on every memory; contradiction detection -> MemoryContradiction

    ## Inputs
    Messages (via conversation), embeddings, social-graph edges, timeline events.

    ## Outputs
    remember() / recall() / forget() facade API for the rest of the system.

    ## Integration points
    Depends on: data, llm (embeddings), events. Used by: conversation (context-builder), thoughts, human-simulation.

    ## Build status
    Core domain package — build early, most realism features depend on it.

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
