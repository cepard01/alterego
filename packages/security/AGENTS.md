    # AGENTS.md — Security

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§17 Security** from `docs/architecture/v1-platform-architecture.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Secrets handling, auth for admin-dashboard, input validation, rate limiting.

    ## Responsibilities
    - Admin panel authentication/authorization (role-based: viewer/operator/owner)
- Input validation/sanitization for inbound messages and media
- Per-user and global rate limiting
- Data retention policy enforcement + cascading delete ('forget me') across Postgres, Redis, and the vector store

    ## Inputs
    Inbound requests (admin-dashboard, gateway).

    ## Outputs
    Auth middleware, validators, rate limiters, deletion cascade utility.

    ## Integration points
    Depends on: config, data. Used by: gateway, apps/admin-dashboard.

    ## Build status
    Build once gateway and data exist.

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
