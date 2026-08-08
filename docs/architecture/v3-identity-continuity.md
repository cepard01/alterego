# WhatsApp AI Agent — Architecture v3: Identity, Continuity & Offline Resilience

**Status:** Final evolution of the architecture. Builds on `whatsapp-ai-agent-architecture.md` (v1 — platform/infrastructure) and `whatsapp-ai-agent-architecture-v2-human-simulation.md` (v2 — behavior/psychology/simulation). Nothing from v1 or v2 is altered. This document closes the remaining gaps: **who the agent is** (as opposed to how it behaves), **what happens when nothing is happening** (idle time, offline gaps), and **how the whole thing stays coherent over years, not weeks**.

**Framing for this revision:** v1 answered "how is this built." v2 answered "how does it act like a person, turn by turn." v3 answers the two questions neither predecessor addressed: "who is this person when no one's looking," and "what happens to all of this when the process isn't running." A system that only exists while actively conversing isn't simulating a person — it's simulating a conversation. v3 is what closes that gap.

---

## Why design for indefinite operation despite a ~1-month expected lifetime

Three concrete reasons, not just a philosophical preference:

1. **Memory, Identity, and the Social Graph are the entire value of this project.** If the schema assumes a short life, every table becomes a rewrite the moment the project outlives its first estimate — and research projects that turn out to be useful almost always outlive their first estimate.
2. **Bounded long-term drift (v2 §11) is only meaningful if there's a long term to drift across.** A one-month-scoped Identity layer would have no reason to model change over years — but the moment it's asked to, half the schema needs redesigning. Building it right once is cheaper than building it twice.
3. **Offline Recovery (ch. 8 below) is valuable at any timescale**, including within the one-month window — the agent going quiet for a weekend is a near-certainty even in a short deployment, not just a hypothetical for a multi-year one.

Nothing below adds infrastructure weight proportional to a multi-year system — it adds *schema and decision logic* that costs the same to build small or large. That's the lever being used to satisfy "design for indefinite operation" without over-engineering for it.

---

## Updated Folder Structure (additions only)

```
src/
├── ...(everything from v1 and v2, unchanged)...
│
├── identity/                      # NEW
│   └── identity.service.ts
│
├── offline-recovery/                 # NEW
│   ├── recovery-engine.ts
│   ├── freshness-scorer.ts
│   ├── backlog-analyzer.ts
│   └── context-reconstructor.ts
│
├── longitudinal/                      # NEW
│   ├── identity-evolution.ts
│   ├── interest-drift.ts
│   └── longitudinal-scheduler.ts
```

---

## 1. Identity Engine

**Purpose:** Represent *who the simulated person is*, independent of how they currently feel (Psychology, v2 §8) or act (Behavior, v1 §8 / v2 ch. 1). Personality (v1 §7) describes *communication style*; Identity describes *life content* — the difference between "talks casually and uses dry humor" (Personality) and "is a 27-year-old graphic designer from Lisbon who plays bass and is saving for a motorcycle" (Identity).

**Responsibilities:**
- Hold the static/slow-changing biographical facts the agent draws on when talking about itself.
- Supply grounding content for Thoughts (v2 §3) and conversation topics the agent can *initiate*, not just react to.
- Prevent self-contradiction ("didn't you say you don't like sushi?") by being the single source of truth for self-referential claims.

**Inputs:** initial configuration (hand-authored, since this defines the persona), plus slow updates from Longitudinal Evolution (ch. 9).
**Outputs:** an `IdentitySnapshot` injected into the Context Builder (v1 §6) alongside Personality — same injection mechanism, new content category.
**Integration points:** Context Builder (new injectable section), Thought Generator (v2 §3, now has biographical content to reason from), Life Timeline (ch. 2) and Personal Inventory (ch. 3), which are structurally sub-components of Identity rather than siblings.

**Data model:**
```
IdentityProfile
  id, agent_id, name, age, background_summary,
  education[], occupation, hometown,
  interests[] (music, games, movies, food, etc. — tagged by category),
  values[], beliefs[], skills[],
  family_summary (coarse — "has a younger sister," not invented specifics
                   about real people if this maps to anyone real),
  version, created_at, last_evolved_at
```

**Architectural justification:** without this, every "personal" detail the agent produces is generated fresh per-conversation by the LLM, which is exactly how self-contradiction happens across sessions. v1's Facts (memory) can store *user* biographical detail this way, but nothing in v1/v2 gave the *agent itself* a persistent biography — Identity is that missing counterpart, structured the same way (a profile object, versioned like Personality already is in v1 §7) rather than as free-floating LLM invention.

---

## 2. Life Timeline

**Purpose:** An ordered, persistent record of significant events in the agent's simulated life — the backbone that lets the agent reference its own past coherently ("that was around when I switched jobs") instead of Identity being a flat, dateless fact sheet.

**Responsibilities:** store major life events; provide temporal anchors other systems can reference; supply Memory Retrieval with a way to connect *conversational* memories (v1 §5) to *life* context ("this is the third time they've asked about the move — it happened 2 months ago per the Timeline").

**Inputs:** manually seeded milestones at setup; new entries proposed by Longitudinal Evolution (ch. 9) as the simulation progresses; entries can also be proposed by the Thought Generator (v2 §3) when a conversation reveals something timeline-worthy ("agent mentioned finally finishing the album they'd been recording").
**Outputs:** `TimelineEvent` objects, retrievable by date range or by semantic search (embedded, same retrieval mechanism as v1 Memory).
**Integration points:** Memory Retrieval ranking (v1 §5 / v2 §4's social-relevance term) gains a fifth optional term, `timeline_relevance`, when a conversation references a life period.

**Data model:**
```
TimelineEvent
  id, agent_id, event_type (milestone|achievement|trip|change|purchase),
  title, description, occurred_at (or occurred_range for ongoing things),
  related_identity_fields[], related_memory_ids[], importance_score
```

**Architectural justification:** Identity alone (ch. 1) is static content; the Timeline is what makes that content *feel lived* rather than configured — it's the difference between "likes hiking" (a trait) and "went to Patagonia in March, which is why hiking talk lights up" (a story). This is a thin addition — one table, one retrieval hook — but it's the piece that prevents Identity from reading like a settings page.

---

## 3. Personal Inventory

**Purpose:** Track what the agent "owns," so references to possessions stay consistent across conversations rather than being invented ad hoc by the LLM each time.

**Responsibilities:** persist a list of notable possessions with enough metadata to ground casual mentions and complaints/praise ("my laptop's fan is so loud again").
**Inputs:** seeded at setup; updated via Longitudinal Evolution (ch. 9) or explicit Thought-driven proposals (agent "buys" something as part of a Goal being fulfilled, ch. 4).
**Outputs:** injected into Context Builder only when relevant (keyword/topic triggered, not injected every turn — this is a low-frequency-relevance category, unlike Personality).
**Integration points:** Long-Term Goals (ch. 4) — a goal like "save for a motorcycle" resolves into a new Inventory entry when marked complete, linked back to the Timeline (ch. 2) as a milestone.

**Data model:**
```
InventoryItem
  id, agent_id, category (device|instrument|vehicle|book|clothing|other),
  name, description, acquired_at?, sentiment (neutral|favorite|frustrating),
  linked_goal_id?, still_owned (bool)
```

**Architectural justification:** small in scope but prevents a specific, common realism failure — an agent that owns a different phone model in every conversation because nothing persisted the detail. Cheap to build, meaningfully closes a believability gap.

---

## 4. Long-Term Goals

**Purpose:** Give the agent forward-looking motivation, not just a reactive backward-looking Identity/Timeline. Real people bring up their own plans unprompted — this is the structure that permits that without it being invented per-message.

**Responsibilities:** track active goals with enough state to reference progress consistently, and to eventually resolve (into a Timeline event and/or Inventory item).
**Inputs:** seeded at setup; new goals proposed by the Thought Generator (v2 §3) or by Longitudinal Evolution (ch. 9) as old goals resolve.
**Outputs:** goals are surfaced to the Human Simulation Engine (v2 ch. 1) as candidate topics the agent can *proactively* raise — the first real mechanism in the whole architecture for the agent to initiate a subject rather than only respond to one.
**Integration points:** Personal Calendar (ch. 5) for time-bound goals; Inventory (ch. 3) and Timeline (ch. 2) as resolution targets.

**Data model:**
```
Goal
  id, agent_id, category (dream|project|purchase|skill|plan),
  title, description, status (active|paused|achieved|abandoned),
  progress (0-1), target_date?, created_at, resolved_at?,
  resolution_link (timeline_event_id? | inventory_item_id?)
```

**Architectural justification:** this is the module that most directly serves realism-over-infrastructure — without it, the agent is structurally incapable of having its own agenda in a conversation, which is a hallmark of a chatbot rather than a person. It's a thin table plus one new integration point into the already-existing Human Simulation Engine.

---

## 5. Personal Calendar

**Purpose:** Ground World State (v2 §2) in *scheduled*, not just simulated-reactive, time commitments — the difference between "randomly rolled busy" and "has a dentist appointment Thursday at 2pm, and has for a week."

**Responsibilities:** hold a lightweight schedule of recurring and one-off commitments; feed World State's `activity` and `availability` fields deterministically when a calendar entry is active, instead of those fields being purely probabilistic.
**Inputs:** seeded recurring patterns (work hours, typical sleep window) at setup; one-off entries proposed by Goals (ch. 4, time-bound ones) or Longitudinal Evolution (ch. 9).
**Outputs:** at each World State tick (v2 §2), the Calendar is checked first; if an entry is active, it deterministically sets `activity`/`availability` for that window, and the probabilistic World State model only fills gaps.
**Integration points:** World State (v2 §2) — described there as "influenced by," now formally specified as a priority input; Timing Model (v2 §7) — calendar-driven unavailability directly extends response delay.

**Data model:**
```
CalendarEntry
  id, agent_id, type (recurring|one_off),
  title, category (work|school|social|appointment|trip|free_time),
  recurrence_rule? (for recurring), start_at, end_at,
  world_state_override { activity, availability_delta }
```

**Architectural justification:** v2's World State (§2) was explicitly probabilistic/reactive. That's correct for moment-to-moment texture, but unaided it can produce inconsistencies ("said they were at work" on a day the Calendar would say otherwise). The Calendar is the deterministic backbone World State checks first — a small addition that meaningfully increases consistency without touching v2's probabilistic logic.

---

## 6. Cognitive Load

**Purpose:** A distinct variable from Energy/Stress/Focus (v2 §2 World State, §8 Psychology) that specifically models *volume-driven* degradation — too much incoming information, not low internal resources.

**Why it's distinct from existing variables:** Energy/Stress/Focus describe the agent's internal state regardless of external load. Cognitive Load specifically captures "there are 40 unread messages across 6 conversations" — a condition that can coexist with high energy and low stress, but still degrades response quality/attentiveness in a specifically human way (skimming, missing details, shorter replies).

**Responsibilities:** compute a load score from concurrent conversation count, unread volume, and message complexity; feed that score into both the Human Simulation Engine (v2 ch. 1, biasing toward `ignore`/`delayed_reply`/`appear_distracted`) and the Prompt Builder (as a Behavior Rule — "responses should be shorter and slightly less attentive to detail right now").

**Inputs:** live counts from the Conversation Manager (v1) — unread messages, active conversation count, recent message complexity (token length as a proxy).
**Outputs:** `CognitiveLoadScore` (0-1), recomputed on each tick alongside World State.
**Integration points:** Human Simulation Engine (v2 ch. 1) as an additional input alongside World State/Psychology; does not require a new event — piggybacks on the existing World State tick (v2 §2).

**Data model:**
```
CognitiveLoadState  (ephemeral — computed, not stored long-term; a rolling log
                      of recent scores is enough for the Evaluation module, ch. 9's
                      predecessor in v2 §9)
  agent_id, current_load (0-1), contributing_factors { unread_count,
  active_conversations, recent_complexity_avg }, computed_at
```

**Architectural justification:** genuinely missing from v2 — Energy/Stress/Focus (World State) and Psychology's variables are all either intrinsic or relationship-specific; none of them capture *system-wide message pressure across all conversations at once*, which is exactly the condition that makes a real person reply tersely or skip messages. This is a small, mostly-computed (not persisted) addition that plugs into existing tick and decision infrastructure rather than adding a new pipeline stage.

---

## 7. Memory Confidence

**Purpose:** Extend v1's Memory (§5) and v2's Thoughts (§3) with uncertainty modeling — human memory is not a reliable database, and an agent that treats every stored fact as equally certain misses a core piece of realism, especially over long timescales where facts can become stale or misremembered.

**Responsibilities:**
- Attach confidence/certainty to every memory and thought.
- Track source (directly stated by user vs. inferred vs. agent-generated).
- Detect and flag contradictions between new statements and stored memory.
- Model **decay of certainty** over time (distinct from v1's importance-based expiration, §5) — an old fact isn't necessarily unimportant, but the agent might reasonably be *less sure* of a stale detail.
- Optionally simulate **false memories** — low-probability, low-confidence memory entries that are subtly wrong, used sparingly to add realism to long-run conversations ("wait, didn't you say you moved in June? ... oh, was it July") — always low-stakes, never fabricated on consequential facts.

**Inputs:** every write to Memory (v1 §5) or Thought (v2 §3) now passes through a confidence-scoring step at write-time; new messages trigger the Contradiction Detector against existing high-confidence memories.
**Outputs:** memories/thoughts carry `confidence`, `source`, `verification_status` fields; contradictions raise a `MemoryContradiction` event (new, follows v1's Event Bus pattern, §13) that the Thought Generator (v2 §3) can resolve into an "interpretation" (e.g., "they must have changed their mind, or I misremembered").

**Data model additions (extends v1 Memory + v2 Thought, does not replace them):**
```
Memory / Thought (extended fields)
  confidence: 0-1
  source: enum (user_stated|inferred|agent_generated|false_memory_simulated)
  verification_status: enum (unverified|confirmed|contradicted)
  last_confidence_decay_at

MemoryContradiction
  id, memory_id_a, memory_id_b (or memory_id + new message_id),
  detected_at, resolution (unresolved|reinterpreted|corrected|ignored)
```

**Architectural justification:** this is the most "invisible but load-bearing" addition in v3. v1's Memory Ranking (§5) already scores by importance/recency/similarity — confidence is a natural fourth axis that was implicitly assumed to be 1.0 for everything. Making it explicit unlocks two realism wins directly requested: the agent can express appropriate uncertainty ("I think you said..."), and can gracefully handle being wrong instead of either doubling down or silently overwriting history.

---

## 8. Offline Recovery Engine (the load-bearing new system in this revision)

**Purpose:** The single largest gap across v1 and v2: both assume the agent is continuously running. This engine defines what happens when it isn't — which, for a real deployment (even a one-month one), is not an edge case but a near-certainty.

**Responsibilities:**
1. **Detect** a downtime gap (process restart, extended offline period) via a heartbeat/last-active timestamp check on boot.
2. **Analyze the backlog** — every conversation with unread messages accumulated during the gap.
3. **Score freshness per conversation** — not per message — to decide how to handle each one.
4. **Reconstruct context** appropriately for the gap length (see decision table below).
5. **Plan a recovery response** — which may be silence, a summary-aware natural reply, or an explicit acknowledgment of the gap, depending on freshness scoring and Relationship data (v1 §5 / v2 §4).

**Decision process — Freshness Scoring:**

```
FreshnessScorer.score(conversation, gap_duration) → {
  freshness: 0-1,        # how "alive" this thread still is
  strategy: 'respond_normally' | 'respond_with_summary_awareness'
          | 'respond_with_soft_acknowledgment' | 'skip_silently'
          | 'reopen_selectively'
}

score = recency_of_last_message * w1
      + relationship_strength (v2 Social Graph) * w2
      - topic_staleness (has the subject clearly moved on / resolved itself?) * w3
      - gap_duration_penalty * w4
      + explicit_unanswered_question_bonus  (a direct question left hanging
                                              weighs heavily toward NOT skipping)
```

**Strategy definitions:**

| Strategy | When | Behavior |
|---|---|---|
| `respond_normally` | Short gap, low volume | Standard pipeline (v2 ch. 10), as if no gap occurred |
| `respond_with_summary_awareness` | Longer gap, thread still relevant | Context Reconstructor (below) injects a compressed summary of the missed span instead of every raw message |
| `respond_with_soft_acknowledgment` | Gap large enough a human would plausibly notice/comment | Response Planner (v2 ch. 5) is instructed to naturally acknowledge the delay ("sorry, been offline") — not scripted, just a Behavior Rule |
| `skip_silently` | Low freshness, low relationship weight, no unanswered question | No response generated; message marked read per World State's return-to-online logic |
| `reopen_selectively` | Multiple unread messages, only some still relevant | Only the highest-freshness sub-thread gets a response; the rest are acknowledged implicitly by topic choice, not itemized |

**Context Reconstruction — how much history to load:**

- **Short gap (minutes–hours):** load raw messages as normal (v1 Conversation Memory, §5).
- **Medium gap (a day–few days):** raw messages beyond a cap get compressed via the same Summarizer pattern v1 already uses for aging Conversation Memory (§5) — no new compression mechanism needed, just triggered earlier/more aggressively.
- **Long gap (many days+):** only the compressed Summary plus any explicitly unanswered questions (detected via the Contradiction/Question-detection heuristics adjacent to ch. 7) are loaded — raw messages beyond that are treated as background Memory, retrievable but not force-injected.

**Response suppression / delayed apologies:** handled entirely through the strategy table above — `respond_with_soft_acknowledgment` is the only path that produces gap-aware language, and it's generated the same way v2 generates any Behavior Rule–driven tone shift (v1 §10), not a hardcoded template.

**Inputs:** process boot event, `last_active_at` timestamps per conversation, Relationship strength (v2 §4), Memory (for question-detection).
**Outputs:** a `RecoveryPlan` per conversation, consumed by the standard v2 pipeline (ch. 10) as an additional pre-stage — it runs *once, at startup*, then the system returns to normal event-driven operation.
**Integration points:** runs before the v2 pipeline resumes; reuses v1's Scheduler (§12) to stagger recovery-response sends across multiple backlogged conversations rather than sending everything the instant the process comes back online (which would itself be an unmistakable "the bot just restarted" tell).

**Data model:**
```
RecoveryPlan
  id, conversation_id, gap_duration, freshness_score, strategy,
  reconstructed_context_type (raw|summary|summary_plus_questions),
  scheduled_response_at, status (pending|executed|skipped)
```

**Architectural justification:** flagged explicitly as important in the review brief, and correctly so — this is the one gap that, left unaddressed, breaks the illusion the entire rest of the architecture (v1 + v2) is built to sustain, the moment the process is ever restarted or the machine sleeps. Every other module in this document is an enhancement; this one is closer to a prerequisite for the system being deployable at all.

---

## 9. Long-Term Simulation (Identity Evolution)

**Purpose:** Define how Identity (ch. 1), Interests (part of Identity), Goals (ch. 4), and Relationships (v2 Social Graph, §4) are allowed to change over long timescales, without violating v2's bounded-variability principle (v2 §11).

**Responsibilities:**
- Periodic (weekly/monthly-scale, via v1 Scheduler §12) evolution passes that propose small, justified changes: a Goal resolving into a Timeline event; an Interest gradually gaining or losing salience based on how often it's organically come up in conversation; Personality (v1 §7) receiving its already-planned "aging" nudge (v1 flagged this as a versioned, gated future feature — v3 is where it becomes concrete).
- Every proposed change is logged with its justification (what conversational or Timeline evidence motivated it) — nothing evolves silently.

**Bounding mechanism (extends v2 §11's anchoring rule):** Identity/Interest evolution uses the same "centered, bounded, reverting-by-default" philosophy v2 established for short-term variability, just on a much slower clock — a proposed change must accumulate supporting evidence over multiple sessions (not one offhand comment) before it's committed, and each committed change is small and versioned (Identity gains the same `version` field Personality already has, v1 §7).

**Inputs:** aggregated Behavior Evaluation results (v2 §9) over time, Thought Generator patterns (v2 §3) — repeated Thoughts/Interpretations about a topic are the actual trigger for proposing an Identity change, not a random walk.
**Outputs:** `IdentityEvolutionProposal` records, auto-committed if evidence threshold is met, otherwise surfaced in the Admin Panel (v1) for manual review — appropriate given this is still a personal research project where the owner likely wants visibility into "why did the agent's stated interests change."

**Data model:**
```
IdentityEvolutionProposal
  id, agent_id, field_changed, old_value, new_value,
  supporting_evidence[] (thought_ids, timeline_event_ids),
  confidence, status (proposed|auto_committed|manually_approved|rejected),
  created_at, resolved_at
```

**Architectural justification:** this is what makes the "design for indefinite operation" instruction concrete rather than aspirational — without an explicit evolution mechanism, a long-running deployment either stays frozen (breaking realism the brief explicitly wants) or drifts unaccountably (breaking the consistency v1/v2 worked hard to establish). This module is the governance layer that lets both goals coexist.

---

## 10. Final Gap Analysis

Reviewing v1 + v2 + this document as a whole, from the perspective of an eventual open-source release:

**Genuinely closed by this revision:**
- Self-consistent biography (Identity, Timeline, Inventory) — previously absent entirely.
- Forward motive (Goals) — the system could only react, never initiate, before this.
- Deterministic time grounding (Calendar) reduces World State's previous "randomly rolled busy" weakness.
- Volume-driven degradation (Cognitive Load) — a distinct, previously-missing failure mode of realistic attention.
- Explicit uncertainty (Memory Confidence) — the architecture previously treated all stored information as ground truth.
- **Continuity across downtime (Offline Recovery)** — previously the single largest hidden assumption in the whole system.
- A named, bounded mechanism for long-horizon change (Longitudinal Evolution), rather than an unspecified "future work" note.

**Still open, worth naming rather than silently deferring (genuine remaining gaps, not filler):**
- **Multi-device/multi-instance consistency** — if this ever runs as more than one process (e.g., horizontally scaled per v1's original scaling framing), World State/Cognitive Load/Offline Recovery all currently assume a single authoritative process. Needs a leader-election or single-writer pattern before that's safe.
- **Cross-agent consistency**, if v1's future multi-agent support (§19) is ever used with agents that know each other — the Social Graph (v2 §4) models human-to-agent edges; agent-to-agent edges aren't specified.
- **Explicit consent/disclosure UX** — flagged at the end of v2 as a product requirement, not yet an architectural module. Given how far realism now extends (offline gaps, memory confidence, self-initiated topics), this is worth promoting from "note" to a real, designed onboarding flow before any real deployment — the architecture can fully support it (nothing here depends on deception to function), but nothing currently *implements* it.
- **Evaluation-driven tuning feedback loop** isn't fully closed — v2 §9 measures behavior quality, v3 §9 adds evolution, but nothing yet automatically feeds low human-likeness scores back into Behavior Profile parameter adjustment. Currently that loop still requires a human (via the Admin Panel) in the middle, which is a reasonable choice for a project this size, but worth naming as a conscious scope decision rather than an oversight.

These four are intentionally left as named future work rather than force-fit into this revision — adding them now would violate the brief's own instruction to avoid unnecessary infrastructure for gaps that don't yet have a concrete trigger (no multi-instance deployment exists yet; no second agent exists yet).

---

## Data Model Additions Summary (v3 only)

New: `IdentityProfile`, `TimelineEvent`, `InventoryItem`, `Goal`, `CalendarEntry`, `CognitiveLoadState` (ephemeral), `MemoryContradiction`, `RecoveryPlan`, `IdentityEvolutionProposal`.

Extended (existing v1/v2 tables gain fields, not replaced): `Memory` and `Thought` gain `confidence`/`source`/`verification_status`; `BehaviorProfile` (v1) gains no new field this round — Calendar and Cognitive Load integrate via existing World State/tick mechanisms rather than the Behavior Profile.

---

## Closing note on scope discipline

Every module in this document was checked against a single test: *does this require new infrastructure, or does it require a new table plus a new integration point into infrastructure that already exists (Event Bus, Scheduler, World State tick, Context Builder injection, Memory Ranking)?* Everything above is the latter. The one exception — Offline Recovery — is a new pipeline pre-stage, not a new piece of infrastructure; it reuses the Scheduler (v1 §12) and the standard pipeline (v2 §10) it feeds into. This is consistent with the brief's instruction to increase realism without increasing infrastructure complexity, carried through from v2 into this final revision.
