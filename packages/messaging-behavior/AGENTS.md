    # AGENTS.md — Human Messaging Model

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§5 Human Messaging Model** from `docs/architecture/v2-human-simulation.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Mechanics of how a decided action becomes actual WhatsApp message events: pauses, self-correction, bubble splitting, partial replies, deferred answers.

    ## Responsibilities
    - Typing simulation: pause/type/stop/correct sequencing
- Bubble splitter: multi-message pacing
- Partial reply logic: answer only part of a multi-part message on instruction
- Deferred answers: write a Reminder (data pkg) when skip_and_answer_later fires

    ## Inputs
    SimulatedAction + TimingPlan (from human-simulation), LLM output (from conversation/llm).

    ## Outputs
    Sequenced outbound WhatsApp events (typing indicators + message sends), handed to gateway.

    ## Integration points
    Depends on: human-simulation, llm, scheduler, gateway. This is the 'Response Planner + Typing Simulation' stage of the v2 pipeline (§10).

    ## Build status
    Core domain package — build after human-simulation.

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
