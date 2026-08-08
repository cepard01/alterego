    # AGENTS.md — Personality Engine

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§7 Personality Engine** from `docs/architecture/v1-platform-architecture.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Static/versioned communication style profile — HOW the agent talks, not who it is.

    ## Responsibilities
    - PersonalityProfile: tone, vocabulary, writing habits, emoji usage, typing quirks, humor style, energy baseline, response length bias, decision-making tone
- Versioned — changes only via explicit new versions, never silently mid-conversation

    ## Inputs
    Initial hand-authored configuration.

    ## Outputs
    PersonalitySnapshot injected into context-builder.

    ## Integration points
    Depends on: data. Read by: conversation (context-builder, prompt-builder), human-simulation (variability-model anchors to this baseline).

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
