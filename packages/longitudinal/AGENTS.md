    # AGENTS.md — Longitudinal Evolution

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§9 Long-Term Simulation** from `docs/architecture/v3-identity-continuity.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Slow, bounded evolution of Identity/Interests/Goals/Relationships over weeks-months, governed and logged — not silent drift.

    ## Responsibilities
    - Periodic (weekly/monthly) evolution pass via scheduler
- IdentityEvolutionProposal: every change requires accumulated multi-session evidence (Thoughts/Timeline events), never a single offhand comment
- Auto-commit small changes; surface larger ones in admin-dashboard for approval

    ## Inputs
    Aggregated evaluation results (evaluation pkg), Thought patterns (thoughts pkg).

    ## Outputs
    IdentityEvolutionProposal records, applied to identity package on approval.

    ## Integration points
    Depends on: data, thoughts, evaluation, identity, scheduler.

    ## Build status
    Build last — depends on evaluation data existing, which requires the system running for a while first.

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
