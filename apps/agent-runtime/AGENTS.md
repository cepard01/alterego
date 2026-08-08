# AGENTS.md — Agent Runtime (composition root)

## Purpose
The actual running process. Wires every package together, starts the gateway connection, runs the offline-recovery boot sequence, and starts the scheduler's tick loop.

## Notes
This is where dependency injection happens. Keep it thin — it should mostly be imports and wiring, no business logic. If you find yourself writing domain logic here, it belongs in a package instead.

`AgentRuntimeOptions` supports test/demo seams (all optional): `memoryMode` (in-memory data), `env` (ConfigService env vars), `rng` (deterministic randomness for human-simulation + world state), `sleep` (no-op to skip realistic typing/pacing delays), `transports`/`llm` overrides, and `config`/`bus`/`logger` instances. The message pipeline is: gateway ingest → ConversationManager (persist + session) → world state/psychology/thoughts/goals/social edge → HumanSimulationEngine.decide → ContextBuilder/PromptBuilder → LLM → ResponsePlanner/ResponseExecutor → gateway send. `start()` runs offline-recovery first; `shutdown()` stops the scheduler and disconnects transports.

See the root `AGENTS.md` and `docs/architecture/` for full context —
this app is a thin composition layer over the `packages/*` domain
logic, not where business logic should live.
