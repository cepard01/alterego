    # AGENTS.md — LLM Router

    > Read this before writing any code in this package.

    ## Source of truth
    This package implements **§11 LLM Layer** from `docs/architecture/v1-platform-architecture.md`.
    Read that section in full before starting — this file is a summary, not a
    replacement for the architecture doc.

    ## Purpose
    Provider-agnostic completion interface with fallback/retry.

    ## Responsibilities
    - Single LLMRouter.complete() interface; no other package imports a provider SDK directly
- Provider adapters: OpenAI, Anthropic, Google, OpenRouter, local (Ollama)
- Capability-based routing (vision/audio/long-context) and automatic fallback
- Circuit breaker per provider

    ## Inputs
    Prompt payload from prompt-builder; capability requirements.

    ## Outputs
    { text, toolCalls?, usage, provider, latencyMs }

    ## Integration points
    Depends on: config, observability. Used by: conversation (prompt-builder), media, thoughts.

    ## Build status
    Foundational — build early, most other packages depend on it.

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
