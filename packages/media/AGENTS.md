    # AGENTS.md — Media Pipeline

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§9 Media Pipeline** from `docs/architecture/v1-platform-architecture.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Async processing of images, audio, video, documents, stickers.

    ## Responsibilities
    - Vision captioning for images/video keyframes
- Speech-to-text for audio/voice notes
- Document text extraction and summarization
- Sticker-pack meaning lookup (integrates with human-simulation's sticker system)
- Always emits MediaAnalyzed before the message is eligible for a behavior decision

    ## Inputs
    MediaReceived events (from gateway).

    ## Outputs
    MediaAnalyzed events with analysis_summary/transcript.

    ## Integration points
    Depends on: llm, events, data. Feeds: conversation (context-builder).

    ## Build status
    Core domain package — can be built in parallel with human-simulation track.

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
