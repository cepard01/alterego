    # AGENTS.md — World State, Psychology, Cognitive Load

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **v2 §2 World State, v2 §8 Conversation Psychology, v3 §6 Cognitive Load** from `docs/architecture/v2-human-simulation.md` and `docs/architecture/v3-identity-continuity.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    The agent's internal, non-conversational state: what it's doing, how it feels, and how much mental bandwidth it has right now.

    ## Responsibilities
    - WorldState: activity, location_context, availability, energy, stress, focus, battery, sleep_state — ticked on a scheduler timer, read-only to the LLM
- PsychologyState (per relationship): curiosity, trust, patience, interest, social_energy, empathy, confidence, stress, comfort, conversation_fatigue — each with its own decay/growth function
    - CognitiveLoadState: volume-driven degradation from unread count / concurrent conversations / message complexity, distinct from Energy/Stress/Focus
- Calendar check (from identity package) takes priority over probabilistic ticks
- `WorldStateService` takes an optional `rng: () => number` as its last constructor arg (default `Math.random`) — used for activity transitions, so tests can be deterministic

    ## Inputs
    Scheduler ticks, ConversationEnded events, CalendarEntry data (from identity).

    ## Outputs
    Current WorldState/PsychologyState/CognitiveLoadScore, read by human-simulation before every decision.

    ## Integration points
    Depends on: data, events, scheduler, identity (calendar bridge). Used by: human-simulation (primary consumer).

    ## Build status
    Core domain package — this is v2's 'Emotion State' slot, fully specified, plus v3's Cognitive Load addition.

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
