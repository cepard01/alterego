    # AGENTS.md — Logging, Metrics, Tracing

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§16 Observability** from `docs/architecture/v1-platform-architecture.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Structured logging, metrics, tracing, cost/token monitoring, health checks.

    ## Responsibilities
    - Structured JSON logger with correlation IDs threaded per message lifecycle
- Metrics: response latency, reply-vs-ignore ratio, memory retrieval hit rate
- Cost/token usage tracking per LLM call, rolled up per user/day
- Health check endpoints (esp. WhatsApp transport connection liveness)

    ## Inputs
    Subscribes to nearly every Event Bus event.

    ## Outputs
    logger, metrics client, tracer, health check handlers.

    ## Integration points
    Depends on: events, config. Used passively by everything (import logger).

    ## Build status
    Foundational — build alongside config.

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
