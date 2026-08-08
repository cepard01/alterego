    # AGENTS.md — Human Simulation Engine

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§1, §6, §7, §11 (Engine, Stickers, Timing, Variability)** from `docs/architecture/v2-human-simulation.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    The decision-maker: whether/when/how the agent acts. Sits between memory/psychology and the conversation package's behavior-execution step.

    ## Responsibilities
    - HumanSimulationEngine.decide() -> SimulatedAction (reply/ignore/emoji_reaction/sticker/delayed_reply/multi_message/go_idle/appear_offline/change_subject/forget_on_purpose/appear_distracted)
- Action Selector: text vs emoji vs sticker vs image vs voice vs silence
- Sticker Selector + Sticker metadata scoring
- Human Timing Model: read/typing/send delays from activity, relationship, importance, time of day, attention span
- Variability Model: bounded, personality-anchored randomness — never permanent drift

    ## Inputs
    WorldState, PsychologyState, CognitiveLoadScore (psychology pkg), Relationship (social-graph), recent Thoughts, Goals (identity) as proactive candidates.

    ## Outputs
    SimulatedAction + TimingPlan, consumed by conversation package.

    ## Integration points
    Depends on: psychology, social-graph, thoughts, identity, data, events. Feeds: conversation (as the v1 Behavior Engine's new input).

    ## Build status
    Core domain package — the 'new brain'; build after psychology/social-graph/thoughts/identity all exist.

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
