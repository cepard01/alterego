    # AGENTS.md — Conversation Manager, Context Builder, Prompt Builder

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§6 Context Building, §10 Prompt Engineering, Conversation State Manager** from `docs/architecture/v1-platform-architecture.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Owns conversation/session state and assembles the final LLM request from every other package's output.

    ## Responsibilities
    - Conversation Manager: session lifecycle (active/idle/ended), turn-taking
- Conversation Manager preserves the transport-scoped `payload.conversationId` as the internal conversation id when creating a new conversation (messages/outbound replies share one id space)
- Conversation State Manager: topic stack, who-spoke-last, open questions
- Context Builder: assembles the token-budgeted context (identity/rules -> personality -> relationship -> behavior/emotion -> summary -> recent messages -> retrieved memories -> time/metadata -> current message)
- Prompt Builder: layered composition (system -> developer -> safety -> dynamic -> context injection -> memory injection -> behavior rules)
- v1 Behavior Engine now consumes human-simulation's SimulatedAction as its primary input rather than deciding independently (see docs/architecture/v2, 'How v1 and v2 fit together')

    ## Inputs
    MessageReceived, SimulatedAction (human-simulation), Memory, Personality, Identity, MediaAnalyzed.

    ## Outputs
    Final prompt payload for llm; BehaviorDecided event.

    ## Integration points
    Depends on: memory, personality, identity, human-simulation, llm, media, events, data. This is the integration hub — build last among domain packages, once its dependencies exist.

    ## Build status
    Integration hub — build after its dependency packages are stubbed out.

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
