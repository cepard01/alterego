# How the docs fit together

Three documents, read in order, each extending the last without
replacing anything:

- **v1 — Platform Architecture**: the infrastructure. Gateway, Event Bus,
  Memory (basic), LLM Router, Scheduler, Database, Config, Observability,
  Security. If it were built alone, this would be a solid but fairly
  ordinary LLM-backed chatbot.
- **v2 — Human Simulation Layer**: reframes the LLM as one organ inside a
  simulated person. Adds World State, Psychology, Thoughts, Social Graph,
  the Human Simulation Engine (the actual decision-maker), Timing,
  Stickers, and bounded Variability. v1's Behavior Engine stops deciding
  and starts executing decisions this layer makes.
- **v3 — Identity & Continuity**: closes two remaining gaps — who the
  agent *is* when not actively behaving (Identity, Life Timeline,
  Inventory, Goals, Calendar), and what happens when the process isn't
  running (Offline Recovery — the single most load-bearing addition in
  the whole set of documents). Also adds Cognitive Load, Memory
  Confidence, and a governed mechanism for long-horizon change.

Each package's `AGENTS.md` under `packages/*` and `apps/*` cites exactly
which section(s) of which document it implements — start there, then go
read the cited section in full.
