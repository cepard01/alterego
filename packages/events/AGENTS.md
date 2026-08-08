    # AGENTS.md — Event Bus & Contracts

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§13 Event System** from `docs/architecture/v1-platform-architecture.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Central pub/sub backbone every other package communicates through.

    ## Responsibilities
    - Define typed event contracts (MessageReceived, MediaReceived, MemoryCreated, ConversationStarted/Ended, BehaviorDecided, LLMCompleted, ResponseSent, MemoryContradiction, etc.)
- Provide publish/subscribe API used by every other package
- Start as an in-process EventEmitter with an interface shaped like a real broker (Redis Streams/NATS) so it can be swapped later without touching callers

    ## Inputs
    None — this is foundational infrastructure other packages depend on.

    ## Outputs
    Typed emit()/on() API, event type definitions.

    ## Integration points
    Imported by every other package. Build this first.

    ## Build status
    Foundational — build first, before anything else.

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
