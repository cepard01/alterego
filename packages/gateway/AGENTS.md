    # AGENTS.md — Message Gateway

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§3 Core Modules — Message Gateway** from `docs/architecture/v1-platform-architecture.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Translates WhatsApp transport events into internal events and back.

    ## Responsibilities
    - Provider adapters (Baileys, WhatsApp Cloud API) behind one interface
- Normalize inbound messages/media into MessageReceived/MediaReceived events
- Execute outbound SendMessage commands, including presence (online/offline) control for the Human Simulation Engine's appear_offline action

    ## Inputs
    Raw WhatsApp transport events.

    ## Outputs
    MessageReceived / MediaReceived events on the Event Bus; sends outbound messages.

    ## Integration points
    Depends on: events, security, observability. Feeds: conversation.

    ## Build status
    Build after foundational packages; this is the system's entry point.

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
