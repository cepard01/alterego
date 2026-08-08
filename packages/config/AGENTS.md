    # AGENTS.md — Configuration Manager

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§15 Configuration System** from `docs/architecture/v1-platform-architecture.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Single typed, validated config source for the whole system.

    ## Responsibilities
    - Layered config: defaults.json -> environment variables -> runtime overrides
- Schema validation (e.g. Zod) at boot — fail fast on bad config
- Feature flags, model switching, log levels, rate limits, memory/token budgets
- Emit ConfigChanged on the Event Bus when runtime overrides update, for hot-reload

    ## Inputs
    .env, defaults.json, runtime override writes (from admin-dashboard app).

    ## Outputs
    Typed ConfigService singleton other packages import.

    ## Integration points
    Depends on: events. Imported by: everything.

    ## Build status
    Foundational — build second.

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
