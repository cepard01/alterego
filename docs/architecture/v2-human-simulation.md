# WhatsApp AI Agent — Architecture v2: Human Simulation Layer

**Status:** Evolution of `whatsapp-ai-agent-architecture.md` (v1). This document does not replace v1 — every module, data model, and section from v1 remains in force. This is an **extension**: a new layer sits alongside the existing pipeline, and a handful of existing modules gain new inputs.

**Framing shift:** v1 built a well-architected LLM-backed chatbot. v2 reframes the LLM as *one organ inside a larger simulated person*. The LLM generates language; it does not decide whether to speak, when, or how. That authority now belongs entirely to the new **Human Simulation Layer** described below.

---

## How v1 and v2 fit together

v1 already separated *Behavior* from *Personality* — that instinct was correct and is why this extension is possible without a rewrite. v2 takes that separation further:

```
v1 had:            Personality  ──►  Behavior Engine  ──►  Prompt Builder ──► LLM
v2 adds beneath:    World State ──► Psychology ──► Thoughts ──► Human Simulation Engine
                                                                        │
                                                    (feeds decisions INTO the existing
                                                     Behavior Engine / Prompt Builder,
                                                     doesn't bypass them)
```

Concretely: the v1 `Behavior Engine` (section 8) is **not deleted**. It becomes the final "translate a decision into an LLM instruction" stage. The new **Human Simulation Engine** (below) becomes the layer that produces the *decision* the Behavior Engine used to compute on its own. Think of it as v1's Behavior Engine being promoted from "decider" to "executor," with a richer decider now feeding it.

---

## Updated Folder Structure (additions only)

```
src/
├── ...(everything from v1, unchanged)...
│
├── world-state/                  # NEW
│   ├── world-state.ts
│   ├── activity-simulator.ts
│   └── availability-model.ts
│
├── psychology/                    # NEW
│   ├── psychology-state.ts
│   └── variable-decay.ts
│
├── thoughts/                      # NEW
│   ├── thought-generator.ts
│   ├── thought-store.ts
│   └── interpretation-layer.ts
│
├── social-graph/                  # NEW
│   ├── graph-store.ts
│   ├── relationship-edges.ts
│   └── cluster-detection.ts
│
├── human-simulation/              # NEW — the new brain
│   ├── human-simulation-engine.ts
│   ├── action-selector.ts        # text | emoji | sticker | image | voice | silence
│   ├── timing-model.ts            # replaces v1's simple delay logic
│   └── variability-model.ts       # controlled inconsistency
│
├── stickers/                      # NEW
│   ├── sticker-metadata.ts
│   └── sticker-selector.ts
│
├── messaging-behavior/            # NEW
│   ├── typing-simulator.ts        # pause/type/stop/correct
│   ├── bubble-splitter.ts
│   └── partial-reply.ts           # reply to only part of a message
│
├── evaluation/                    # NEW
│   ├── behavior-evaluator.ts
│   └── human-likeness-score.ts
```

Nothing in v1's `behavior/`, `personality/`, `memory/`, `context/`, `prompt/`, `llm/` folders is removed. `behavior/reply-decision.ts` changes from *source of truth* to *consumer* of the new engine's output.

---

## 1. Human Simulation Engine

**Position in the system:** sits between Memory/Relationship (v1) and the v1 Behavior Engine. It does not talk to the LLM directly — everything it decides becomes a structured instruction that the existing Prompt Builder (v1 §10) injects as a Behavior Rule, exactly as v1 already does for simpler decisions.

```
HumanSimulationEngine.decide(input: {
  message, worldState, psychologyState, relationship,
  recentThoughts, conversationHistory
}) → SimulatedAction {
  type: 'reply' | 'ignore' | 'emoji_reaction' | 'sticker' | 'delayed_reply'
      | 'multi_message' | 'go_idle' | 'appear_offline' | 'change_subject'
      | 'forget_on_purpose' | 'appear_distracted',
  timing: TimingPlan,
  confidence: number,
  reasoning: Thought[]   // internal only, never surfaced to the user
}
```

Each action type maps to a concrete downstream effect:

| Action | Effect |
|---|---|
| `ignore` | No response queued; message marked read (or not) per World State |
| `emoji_reaction` | WhatsApp native reaction sent, no text message |
| `sticker` | Sticker Selector (ch. 6) picks from the sticker library |
| `delayed_reply` | Handed to Timing Model (ch. 7) instead of immediate response |
| `multi_message` | Response Planner splits output into paced bubbles |
| `go_idle` | Conversation marked idle; no action until re-triggered |
| `appear_offline` | World State's presence flag set; "last seen" behavior changes at the Gateway level |
| `change_subject` | Passed to v1 Conversation State Manager's topic stack as an instruction |
| `forget_on_purpose` | A memory is deliberately *not* retrieved this turn (see ch. 3) even though it exists |
| `appear_distracted` | Prompt Builder receives a "distracted" behavior rule — shorter, less attentive replies |

**Why this is a separate module and not just a bigger v1 Behavior Engine:** v1's engine was designed to answer one question ("respond how?"). This engine answers a *prior* question ("is this even a moment where a human would engage, and as what kind of person-right-now?"). Keeping them separate means the World State/Psychology/Thoughts inputs never leak into the narrower, well-tested v1 logic — they only arrive as an already-resolved decision.

---

## 2. World State

A continuously-ticking internal simulation, independent of any single conversation. One World State per agent (or per agent-persona, if v1's future multi-agent support is used).

```
WorldState
  activity: enum        # idle, working, commuting, eating, gaming, sleeping, socializing
  location_context: enum  # home, work, out, travelling  (coarse — never real GPS)
  availability: 0-1       # composite score derived from activity + time
  energy_level: 0-1
  stress_level: 0-1
  focus_level: 0-1
  device_battery: 0-100   # simulated, decays and "charges" on a cycle
  sleep_state: enum       # awake, drowsy, asleep
  current_activity_detail: string  # "listening to music", "playing a game" — flavor for Thoughts
  updated_at: timestamp
```

**Update model:** a scheduled tick (v1 Scheduler, §12) advances World State on a timer, plus event-driven nudges (a long gap since last message increases `energy_level` recovery; a burst of incoming messages during "sleep_state: asleep" increases `stress_level` slightly on wake).

**Critical rule:** World State is computed **before** any LLM call and is read-only input to the Human Simulation Engine — the LLM never sets or reasons about it directly. This keeps the simulation deterministic-enough to debug and prevents the model from "role-playing" a world state that contradicts the system's actual timers (e.g., claiming to be asleep while replying instantly).

---

## 3. Internal Thoughts

A private layer, never included in outbound messages, that gives the agent something closer to an interior life to reason from.

**Taxonomy — the system must keep these five categories distinct, both in storage and in prompt injection:**

| Category | Definition | Example | Persisted? |
|---|---|---|---|
| **Facts** | Verifiable, stated information (v1 Memory) | "User's sister is named Ana" | Yes, long-term |
| **Memories** | Experienced events (v1 Memory + Conversation history) | "We talked about this last Tuesday" | Yes, long-term |
| **Thoughts** | The agent's own private reasoning | "I think they're avoiding the topic" | Yes, short/medium-term |
| **Interpretations** | Subjective read on a fact/memory | "This probably means they're stressed about work" | Yes, tagged with confidence |
| **Predictions** | Forward-looking guesses | "They'll probably bring this up again this weekend" | Yes, with expiry/verification hook |

```
Thought
  id, user_id, category (thought|interpretation|prediction),
  content, confidence (0-1), related_memory_ids[], related_message_id?,
  created_at, verified_at?, verification_result? (confirmed|contradicted|expired)
```

**Thought Generator** runs asynchronously after a conversation turn (not on the hot path) — it's a background LLM call, not part of the response-critical path, that reviews the exchange and optionally writes new Thought entries. This mirrors v1's summarizer job (§5) architecturally — same async pattern, different content.

**Retrieval:** Thoughts feed the Human Simulation Engine's `reasoning` field and can bias Psychology variables (ch. 8), but — critically — are **never directly quoted** in outbound text. The Prompt Builder injects them as private context ("your private impression, do not state this directly") the same way v1 already isolates memory injection from raw message injection (v1 §10).

---

## 4. Social Graph

Extends v1's per-user Relationship Memory (v1 §5) into a graph rather than isolated edges.

```
GraphNode: User { id, display_name }
GraphEdge: Relationship {
  from_user_id, to_user_id, edge_type (friend|family|coworker|unknown),
  strength (0-1), shared_jokes[], shared_interests[], shared_events[],
  interaction_frequency, last_confirmed_at
}
Cluster {
  id, member_user_ids[], cluster_label (e.g. "college friends"), cohesion_score
}
```

**Population strategy:** the graph is built incrementally from what users *mention*, not from external data sources — if User A mentions "my friend Ana," a tentative edge is created; it strengthens with repeated, consistent mentions and is never treated as verified fact until corroborated (this avoids the agent confidently stating incorrect social claims).

**Integration with Memory Retrieval (v1 §5):** the ranking formula gains a fourth term:

```
score = similarity*w1 + importance*w2 + recency_decay*w3 + social_relevance*w4
```

where `social_relevance` boosts memories connected to people currently relevant to the conversation (e.g., the user just mentioned Ana → memories/thoughts linked to the Ana edge rank higher).

**Why this belongs in v2, not v1:** v1's memory was person-isolated by design (simple, fast to ship). Realism requires the agent to reason across people — "you and Ana both mentioned the same trip" — which only works once relationships are edges in a graph, not scattered facts.

---

## 5. Human Messaging Model

Formalizes the mechanics humans actually use when texting, most of which v1's Response Generator (§ "Core Modules") did not attempt.

```
MessagingBehavior (sampled per outgoing turn, from Behavior Profile + Psychology)
  will_pause_before_typing: bool
  will_send_incomplete_then_correct: bool
  bubble_count: int
  will_reply_to_partial_question: bool     # answers only one part of a multi-part message
  will_skip_a_question: bool
  will_send_reaction_instead_of_reply: bool
  will_defer_and_answer_later: bool         # → creates a Reminder (v1 §4) to circle back
```

**Self-correction simulation:** when `will_send_incomplete_then_correct` is true, the Response Planner emits two sequential WhatsApp events — an initial short message, then (after a short delay) a follow-up correcting or extending it ("wait I meant—"). This is generated by asking the LLM for both parts in one call (to keep them coherent) and pacing their delivery separately.

**Deferred answers:** when the model decides to skip a question now and answer later, it writes a `Reminder` (v1 data model, §4) with a payload referencing the unanswered message. The v1 Scheduler (§12) already has the primitive needed to fire this later — v2 just gives it a new producer.

**Partial replies:** the Prompt Builder is instructed to address only a subset of a multi-part user message when `will_reply_to_partial_question` fires — this is an instruction to the LLM (v1's existing Behavior Rules channel, §10), not a new LLM capability.

---

## 6. Sticker Intelligence

```
Sticker
  id, pack_id, file_url,
  emotion_tags[], intent_tags[] (agreement|joke|comfort|celebration|sarcasm...),
  humor_level (0-1), context_tags[] (casual|affectionate|playful|serious_reply_ok),
  usage_frequency, reply_probability_weight,
  preferred_contact_ids[]   # some stickers "belong" to specific relationships
  last_used_at
```

**Sticker Selector** is invoked when the Human Simulation Engine's `action-selector` (ch. 1) picks `sticker` as the output modality. Selection scoring:

```
score = emotion_match*w1 + context_match*w2 + relationship_affinity*w3
       - recency_penalty (avoid repeating the same sticker back-to-back)
```

**Action Selector (text vs. emoji vs. sticker vs. image vs. voice vs. silence):** this is the concrete decision v1's Response Generator never had to make (v1 assumed text-or-media-attachment only). It's a classifier-style decision made from: message intent, World State (e.g., low `focus_level` biases toward stickers/emoji over composed text), Psychology `social_energy`, and relationship familiarity (stickers/emoji increase with familiarity in most human texting patterns).

---

## 7. Human Timing Model

Replaces v1's "randomized jitter" (v1 §8) with a full probabilistic model. v1's timing logic is not discarded — it becomes the fallback/default curve when richer signals are unavailable.

```
TimingModel.computeDelay(input: {
  activity, availability, relationship_importance, conversation_importance,
  time_of_day, day_of_week, message_complexity, recent_interruption_rate
}) → {
  read_delay_ms,       # time before "read" receipt
  typing_start_delay_ms,
  typing_duration_ms,   # simulated typing-speed based on response length
  send_delay_ms
}
```

**Typing speed simulation:** `typing_duration_ms` is derived from a per-agent words-per-minute baseline (part of the Personality Profile, v1 §7) with variance, so longer responses visibly take longer to "type" — this is what makes the WhatsApp typing indicator believable rather than a fixed 2-second placeholder.

**Attention span / interruptions:** if World State's `focus_level` is low or `activity` indicates the agent is "mid-task," the model injects a secondary pause (message read, then a gap, then typing starts) — simulating "saw it, got distracted, came back."

**Day/time modulation:** a configurable per-agent activity curve (e.g., slower responses late at night, faster during typical free periods) — stored alongside the Behavior Profile (v1 §4) as a new `activity_curve` field, not a new table.

---

## 8. Conversation Psychology

A set of slow-evolving scalar variables, distinct from the fast-changing World State and the near-static Personality.

```
PsychologyState (per relationship, i.e. per user-agent pair)
  curiosity: 0-1
  trust: 0-1
  patience: 0-1
  interest: 0-1
  social_energy: 0-1
  empathy: 0-1        # baseline trait, low variance
  confidence: 0-1
  stress: 0-1
  comfort: 0-1
  conversation_fatigue: 0-1   # resets on session end, unlike the others
  updated_at
```

**Evolution model:** each variable has its own decay/growth function, updated after every turn or on a background tick:

- `trust`, `comfort` — slow-moving, increase gradually with positive interactions, drop sharply on negative ones (asymmetric, like real trust).
- `conversation_fatigue` — rises within a session, resets on session close (v1 Conversation Manager already fires `ConversationEnded`; v2 subscribes to it here).
- `curiosity`, `interest` — topic-sensitive, spike on novel subjects, decay on repetition.
- `stress` — influenced by both World State (external) and conversation content (internal), read by the Timing Model (ch. 7) and Action Selector (ch. 6).

**Where this plugs in:** Psychology is a **direct input** to the Human Simulation Engine (ch. 1) and an indirect input to the Prompt Builder via Behavior Rules — exactly as v1's `EmotionState` module (v1 §3 core modules table) was already designed to work. In fact, v2's `PsychologyState` **is the fully-specified version of v1's placeholder `Emotion State` module** — same slot in the architecture, filled in with the variable set above instead of the abstract "mood vector" v1 left underspecified.

---

## 9. Behavior Evaluation

Runs asynchronously after each conversation session closes (subscribing to v1's `ConversationEnded` event, §13).

```
Metric                    Computation approach
────────────────────────────────────────────────────────────
Naturalness                LLM-judge pass scoring the transcript against
                            human-texting heuristics (pacing, bubble use, typos)
Behavior consistency        Compare this session's Human Simulation Engine
                            decisions against the agent's historical decision
                            distribution — flag outliers
Personality consistency     Style-vector distance between this session's
                            output and the Personality Profile baseline
Memory consistency          Check for contradicted Facts/Thoughts (did the
                            agent state something that conflicts with stored memory?)
Conversation flow            Turn-taking balance, topic-change smoothness
Latency realism              Compare actual send timings against the
                            Timing Model's expected distribution
Media/sticker/emoji usage    Compare usage rate against the agent's configured
                            Behavior Profile targets
Human-likeness score          Weighted composite of the above, 0-100
Relationship evolution        Delta in Social Graph edge strength +
                            Psychology state over the session
```

Results are written to a new `EvaluationReport` record (linked to `Conversation`, v1 §4) and surfaced in the Admin Panel (v1, cross-cutting) as a session-by-session dashboard — this is the primary tool for tuning Behavior Profile parameters over time without guesswork.

---

## 10. Human Simulation Pipeline (supersedes the v1 diagram, additively)

```
WhatsApp
   ↓
Message Gateway  (v1, unchanged)
   ↓
Event Bus  (v1, unchanged)
   ↓
World State Update        ← NEW: tick/event-driven, reads current WorldState
   ↓
Relationship Update        ← NEW: Social Graph edge reinforcement
   ↓
Thought Generation          ← NEW: async-eligible; fast heuristic pass inline,
   │                           deep LLM pass queued for after response (like v1's
   │                           summarizer pattern)
   ↓
Human Simulation Engine     ← NEW: produces SimulatedAction
   ↓
Conversation Decision       ← v1 Behavior Engine, now a consumer/executor
   ↓
Context Builder             (v1, unchanged — gains Thoughts/Psychology as new
   │                           injectable sections, still token-budgeted)
   ↓
Prompt Builder               (v1, unchanged — gains new Behavior Rule vocabulary)
   ↓
LLM Router                   (v1, unchanged)
   ↓
Response Planner             ← v1 Response Generator, extended with
   │                           Messaging Behavior Model (ch. 5) and
   │                           Action Selector output (ch. 6)
   ↓
Typing Simulation             ← NEW: drives WhatsApp typing indicator via Timing Model
   ↓
Message Delivery              (v1 Gateway, unchanged)
   ↓
Conversation Evaluation        ← NEW: async, post-session
```

Every "NEW" stage is additive — it either runs before the v1 pipeline starts (World State/Relationship/Thoughts) or wraps an existing v1 stage without changing its interface (Human Simulation Engine feeds the same `BehaviorDecided` event shape v1 already defined in §13, just with a richer payload).

---

## 11. Human Variability

Controlled inconsistency is implemented as **bounded randomness with a personality-anchored center**, not free-floating noise — this is the key mechanism that prevents "realism" from degrading into "the agent feels broken."

```
VariabilityModel.applyNoise(baseline: PersonalityProfile, psychology: PsychologyState) → {
  effective_verbosity,    # baseline ± small variance, wider when fatigue is high
  effective_energy,       # baseline ± variance, correlated with World State
  typo_probability,        # rises with typing_speed and low focus_level
  topic_drift_probability, # rises with high curiosity, low patience
  mood_swing_triggered: bool  # rare, bounded event — temporary deviation, always reverts
}
```

**The anchoring rule:** every sampled variance is drawn from a distribution *centered on the Personality baseline*, with a standard deviation that itself is a tunable Behavior Profile parameter. This guarantees that "randomness" never permanently drifts the character — a `mood_swing_triggered` event is explicitly time-boxed (decays back to baseline within N turns via the Psychology decay functions in ch. 8), so short-term inconsistency never becomes long-term drift. This directly extends v1's Personality Engine design principle (v1 §7: "identity vs. state separation") — v2 just gives that principle a formal probabilistic implementation instead of an implied one.

**Per-contact behavior variance:** the same agent can have a materially different `effective_verbosity`/`effective_energy` baseline per relationship (stored on the Social Graph edge, ch. 4, not the global Personality Profile) — modeling how real people behave differently with different friends without splitting personality itself.

---

## 12. Future Research

- **Daily routines** — a scripted-but-randomized daily World State schedule (wake, work, meals, wind-down) that the tick-based World State (ch. 2) follows instead of pure event-reaction.
- **Long-term life simulation** — World State entries that persist and evolve across weeks/months (a simulated ongoing "project" or "trip" the agent references unprompted).
- **Virtual calendars** — giving the agent its own schedule that can conflict with availability, feeding directly into the Timing Model (ch. 7).
- **Memory dreams** — a background job (same pattern as v1's summarizer, §5) that recombines existing Memories/Thoughts into new, clearly-tagged speculative Thoughts, simulating idle reflection between conversations.
- **Habit formation** — Behavior Profile parameters that drift slowly based on accumulated Behavior Evaluation (ch. 9) results, rather than being purely static config.
- **Relationship evolution over long horizons** — Social Graph edges (ch. 4) and Psychology state (ch. 8) with multi-month trend tracking, not just session-level deltas.
- **Personality aging** — extremely slow, bounded drift of the Personality Profile itself (not just state) over very long timescales, gated behind explicit versioning (v1 §7 already versions Personality — this is a natural extension).
- **Learning social patterns** — using the Social Graph's cluster detection (ch. 4) to infer unstated norms within a friend group and adjust behavior accordingly.
- **Self-reflection** — a periodic job where the Thought Generator (ch. 3) reviews its own past Predictions against outcomes and writes `verification_result` entries, closing the loop on its own forecasting accuracy.
- **Long-term emotional state** — a slower-moving layer above per-relationship Psychology (ch. 8): a global mood baseline for the agent itself, independent of any one conversation.

---

## Data Model Additions Summary

New tables/entities introduced in this document (all additive to v1 §4):

`WorldState`, `Thought`, `SocialGraphNode`, `SocialGraphEdge`, `SocialCluster`, `Sticker`, `MessagingBehavior` (ephemeral, computed per-turn), `TimingPlan` (ephemeral), `PsychologyState`, `EvaluationReport`, `VariabilityModel` output (ephemeral).

None of these require changes to existing v1 tables except one additive field: `BehaviorProfile.activity_curve` (ch. 7).

---

## A note on scope, carried over from v1 §17

This layer makes the agent measurably better at *appearing* human — including appearing offline, delaying reads, and simulating distraction. Since v1 already flagged privacy/consent as core (not optional) for this project, that requirement extends directly here: the person on the other end of these conversations should know they're talking to a simulation. Realism as an engineering goal and disclosure as a project requirement aren't in tension — nothing in this architecture needs the human counterpart to be deceived about *what* they're talking to in order to work.
