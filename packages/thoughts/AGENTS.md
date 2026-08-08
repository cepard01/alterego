    # AGENTS.md — Internal Thoughts

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§3 Internal Thoughts** from `docs/architecture/v2-human-simulation.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Private reasoning layer: facts vs memories vs thoughts vs interpretations vs predictions, never shown to the user.

    ## Responsibilities
    - Async Thought Generator — runs after a turn, not on the hot path
- Maintain the five-category distinction strictly, both in storage and injection
- Feed human-simulation's reasoning field and bias psychology variables
- Self-reflection: periodically verify past Predictions against outcomes

    ## Inputs
    Conversation transcripts (post-turn), llm for the background reasoning call.

    ## Outputs
    Thought records; never directly quoted in outbound text.

    ## Integration points
    Depends on: data, llm, events. Used by: human-simulation, identity (timeline-worthy thought proposals), memory (confidence/contradiction).

    ## Build status
    Core domain package — build after memory and psychology exist.

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
