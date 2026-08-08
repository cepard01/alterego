# AGENTS.md — Admin Dashboard

## Purpose
Internal UI/API for inspecting conversations, memory, evaluation reports, and tuning Behavior Profile / feature flags live (v1 §15, §16; v3's IdentityEvolutionProposal manual-review queue).

## Notes
Reads from the data package's repositories directly (read-heavy). Config writes go through the config package so ConfigChanged fires correctly.

See the root `AGENTS.md` and `docs/architecture/` for full context —
this app is a thin composition layer over the `packages/*` domain
logic, not where business logic should live.
