    # AGENTS.md — Identity, Timeline, Inventory, Goals, Calendar

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **v3 §1-5** from `docs/architecture/v3-identity-continuity.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    WHO the simulated person is — biography, possessions, goals, and schedule — as opposed to how they behave or feel.

    ## Responsibilities
    - IdentityProfile: name, age, background, occupation, interests, values, skills
- Life Timeline: ordered persistent life events, semantically retrievable
- Personal Inventory: possessions with sentiment, linked to goals
- Long-Term Goals: dreams/projects/plans — the only mechanism for the agent to proactively raise a topic rather than only react
- Personal Calendar: deterministic schedule that overrides World State's probabilistic activity/availability when an entry is active

    ## Inputs
    Setup-time seeding; longitudinal-evolution proposals.

    ## Outputs
    IdentitySnapshot for context-builder; CalendarEntry checks feed world-state ticks; Goals surfaced to human-simulation as proactive topic candidates.

    ## Integration points
    Depends on: data, events. Used by: conversation (context-builder), human-simulation, world-state (via psychology package), longitudinal.

    ## Build status
    Core domain package — new in v3, no v1/v2 equivalent to migrate from.

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
