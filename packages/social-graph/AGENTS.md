    # AGENTS.md — Social Graph

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§4 Social Graph** from `docs/architecture/v2-human-simulation.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Relationship graph across users — who knows who, shared context, clusters — feeding memory retrieval and per-contact behavior variance.

    ## Responsibilities
    - GraphNode/GraphEdge/Cluster model, incrementally built from what users mention (never treated as verified until corroborated)
- social_relevance term for memory ranking
- Per-contact behavior variance storage (effective_verbosity/energy per edge, per v2 §11)

    ## Inputs
    Mentions extracted from conversation (via thoughts/memory).

    ## Outputs
    Relationship edges/clusters, queried by memory and human-simulation.

    ## Integration points
    Depends on: data, events. Used by: memory (ranking), human-simulation (variability), offline-recovery (freshness scoring).

    ## Build status
    Core domain package.

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
