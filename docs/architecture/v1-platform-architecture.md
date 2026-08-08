# WhatsApp AI Agent — Software Architecture Blueprint

**Project type:** Experimental research project — autonomous conversational agent with realistic behavior
**Author role:** Senior AI Software Architect / LLM Engineer / Node.js Backend Engineer
**Scope:** Single-agent MVP designed to scale to a multi-tenant, multi-agent platform

---

## 0. Design Philosophy

Three principles drive every decision in this document:

1. **Nothing talks to a provider directly.** WhatsApp, the LLM, the database, and the media processors are all accessed through interfaces. Providers are swappable plugins, not dependencies baked into business logic.
2. **The agent is a state machine with memory, not a function.** A chatbot maps `message -> response`. This system maps `message -> updated world state -> behavior decision -> (maybe) response`. Silence, delay, and multi-message bursts are first-class outputs.
3. **Everything that can be observed should be observed.** Every module emits events. The system should be debuggable in production without code changes, because behavioral bugs (an agent that feels "off") are the hardest bugs to catch with unit tests alone.

---

## 1. High-Level Architecture

```
                         ┌─────────────────────┐
                         │   WhatsApp Client    │  (Baileys / Cloud API)
                         └──────────┬───────────┘
                                    │ inbound/outbound events
                         ┌──────────▼───────────┐
                         │   Message Gateway     │  normalizes transport → internal event
                         └──────────┬───────────┘
                                    │ MessageReceived
                         ┌──────────▼───────────┐
                         │      Event Bus        │  pub/sub backbone
                         └──────────┬───────────┘
                     ┌──────────────┼───────────────────┐
                     ▼              ▼                   ▼
         ┌───────────────────┐ ┌──────────────┐ ┌──────────────────┐
         │ Conversation Mgr   │ │ Media Pipeline│ │ Scheduler         │
         │ (state machine)    │ │ (async)       │ │ (timers/cooldowns)│
         └─────────┬──────────┘ └──────┬───────┘ └─────────┬─────────┘
                    │                  │                    │
                    └────────┬─────────┴──────────┬─────────┘
                              ▼                    │
                    ┌───────────────────┐          │
                    │  Memory Manager    │◄─────────┘
                    │ (working/ltm/facts)│
                    └─────────┬──────────┘
                              ▼
                    ┌───────────────────┐
                    │  Behavior Engine   │  decides: reply? when? how?
                    └─────────┬──────────┘
                              ▼
                    ┌───────────────────┐
                    │  Context Builder   │  assembles the prompt payload
                    └─────────┬──────────┘
                              ▼
                    ┌───────────────────┐
                    │   Prompt Builder   │  system + dynamic + safety layers
                    └─────────┬──────────┘
                              ▼
                    ┌───────────────────┐
                    │    LLM Router      │  provider-agnostic call layer
                    └─────────┬──────────┘
                              ▼
                    ┌───────────────────┐
                    │ Response Generator │  formats, splits, paces messages
                    └─────────┬──────────┘
                              ▼
                    ┌───────────────────┐
                    │  Message Gateway   │  sends back to WhatsApp
                    └───────────────────┘

   Cross-cutting: Configuration Manager · Logging · Analytics · Admin Panel
```

**Why this shape:** every arrow is an event, not a function call. The Conversation Manager doesn't call the Behavior Engine directly — it publishes `MessageReceived`, and the Behavior Engine subscribes. This means you can add a new subscriber (e.g., a "Safety Auditor" module) without touching existing code, and you can replay events for debugging.

---

## 2. Folder Structure

```
whatsapp-ai-agent/
├── src/
│   ├── gateway/                 # WhatsApp transport adapters
│   │   ├── providers/
│   │   │   ├── baileys/
│   │   │   └── cloud-api/
│   │   ├── gateway.interface.ts
│   │   └── message-normalizer.ts
│   │
│   ├── conversation/             # Conversation state machine
│   │   ├── conversation-manager.ts
│   │   ├── conversation-state.ts
│   │   └── session.ts
│   │
│   ├── memory/                   # All memory layers
│   │   ├── working-memory/
│   │   ├── conversation-memory/
│   │   ├── long-term-memory/
│   │   ├── facts/
│   │   ├── relationship-memory/
│   │   ├── summarizer/
│   │   ├── retrieval/            # embedding search, ranking
│   │   └── expiration/
│   │
│   ├── behavior/                 # Behavior Engine
│   │   ├── reply-decision.ts
│   │   ├── timing-model.ts
│   │   ├── mood-state.ts
│   │   └── rules/
│   │
│   ├── personality/               # Personality Engine
│   │   ├── personality-profile.ts
│   │   ├── style-rules.ts
│   │   └── presets/
│   │
│   ├── context/                  # Context Builder
│   │   ├── context-builder.ts
│   │   └── token-budget.ts
│   │
│   ├── prompt/                   # Prompt Builder
│   │   ├── system-prompt.ts
│   │   ├── dynamic-prompt.ts
│   │   └── safety-rules.ts
│   │
│   ├── llm/                      # LLM Router (provider-agnostic)
│   │   ├── llm-router.interface.ts
│   │   ├── providers/
│   │   │   ├── openai/
│   │   │   ├── anthropic/
│   │   │   ├── google/
│   │   │   ├── openrouter/
│   │   │   └── local/
│   │   └── fallback-strategy.ts
│   │
│   ├── media/                    # Media Pipeline
│   │   ├── image/
│   │   ├── audio/
│   │   ├── video/
│   │   ├── document/
│   │   └── sticker/
│   │
│   ├── scheduler/                # Delayed/background jobs
│   │   ├── job-queue.ts
│   │   ├── cooldowns.ts
│   │   └── recurring-jobs.ts
│   │
│   ├── events/                   # Event Bus + event contracts
│   │   ├── event-bus.ts
│   │   └── events/
│   │
│   ├── data/                     # Data access layer (repositories)
│   │   ├── repositories/
│   │   └── migrations/
│   │
│   ├── config/                   # Configuration Manager
│   │   ├── config.schema.ts
│   │   └── feature-flags.ts
│   │
│   ├── observability/            # Logging, metrics, tracing
│   │   ├── logger.ts
│   │   ├── metrics.ts
│   │   └── tracing.ts
│   │
│   ├── security/                 # Auth, encryption, validation
│   │
│   └── admin/                    # Admin panel API (internal)
│
├── apps/
│   └── admin-dashboard/          # Separate frontend app (optional)
│
├── infra/
│   ├── docker/
│   └── terraform/ (or IaC of choice)
│
├── tests/
└── docs/
```

**Rationale for the split:** each top-level folder under `src/` maps 1:1 to a bounded context in section 3. This is deliberate — when the project scales to multiple agents or is split into services, each folder becomes a plausible service boundary without a rewrite. `providers/` subfolders isolate vendor SDKs so a provider outage or SDK breaking change never touches core logic.

---

## 3. Core Modules

| Module | Responsibility | Depends on |
|---|---|---|
| **Message Gateway** | Translates WhatsApp transport events (Baileys sockets, Cloud API webhooks) into internal `MessageReceived`/`MediaReceived` events, and internal `SendMessage` commands back into transport calls. | Event Bus |
| **Conversation Manager** | Owns conversation state (active/idle/ended), turn-taking, and session boundaries. | Event Bus, Data layer |
| **Memory Manager** | Facade over all memory layers (section 5). Single entry point: `remember()`, `recall()`, `forget()`. | Data layer, Embeddings provider |
| **Behavior Engine** | Decides *whether*, *when*, and *how* to respond (section 8). | Memory Manager, Personality Manager, Emotion State |
| **Personality Manager** | Holds the static + evolving personality profile (section 7). | Data layer |
| **Profile Manager** | Manages the *user's* profile (not the agent's) — name, preferences, relationship metadata. | Data layer |
| **Context Builder** | Assembles everything the LLM needs into a bounded, token-budgeted payload (section 6). | Memory Manager, Personality Manager, Conversation Manager |
| **Conversation State Manager** | Tracks fine-grained turn state: who spoke last, open questions, topic stack. | Conversation Manager |
| **Emotion State** | A lightweight, decaying mood vector for the agent (e.g., energy, warmth, patience) that biases the Behavior Engine and Prompt Builder. | Behavior Engine |
| **Relationship Manager** | Tracks the evolving human-agent relationship: familiarity level, inside jokes, trust score, conversation frequency. | Memory Manager |
| **Prompt Builder** | Compiles system prompt + dynamic context + safety rules into the final LLM payload. | Context Builder |
| **LLM Router** | Provider-agnostic call layer with fallback/retry (section 11). | Prompt Builder |
| **Response Generator** | Post-processes LLM output: splits into multiple WhatsApp bubbles, paces sends, injects typing indicators. | LLM Router, Behavior Engine |
| **Media Processor** | Handles inbound/outbound media (section 9). | LLM Router (vision/audio models) |
| **Scheduler** | Cron-like and delayed-job engine (section 12). | Event Bus |
| **Event Bus** | Central pub/sub. Everything communicates through it. | — |
| **Configuration Manager** | Central typed config + feature flags (section 15). | — |
| **Logging / Analytics** | Structured logs, metrics, dashboards (section 16). | Event Bus |
| **Admin Panel** | Internal API/UI for inspecting conversations, memory, and tuning behavior live. | Data layer, Config |

---

## 4. Data Models

Shown as simplified entity shapes (illustrative, not a full schema).

```
User
  id, phone_number, display_name, timezone, locale,
  created_at, last_seen_at, opt_in_status

Conversation
  id, user_id, status (active|idle|ended), started_at, last_message_at,
  current_topic, turn_count

Message
  id, conversation_id, sender (user|agent), content, media_id?,
  timestamp, is_read, reply_to_message_id?

Media
  id, message_id, type (image|audio|video|document|sticker),
  storage_url, mime_type, caption, transcript?, analysis_summary?,
  duration_ms?, size_bytes

Memory
  id, user_id, type (fact|preference|event|summary), content,
  embedding_vector, importance_score, created_at, last_accessed_at,
  expires_at?, source_message_id?

Relationship
  user_id, familiarity_level, trust_score, tone_preference,
  shared_context[] (inside jokes, recurring topics), interaction_count

Personality (Agent-level, not per-user)
  id, name, tone, humor_style, verbosity, emoji_frequency,
  vocabulary_profile, quirks[], version

Session
  id, conversation_id, opened_at, closed_at?, close_reason

Knowledge  (static/curated facts the agent can draw on — not user memory)
  id, topic, content, embedding_vector, source, confidence

BehaviorProfile
  id, reply_latency_curve, ignore_probability, multi_message_probability,
  topic_change_tolerance, question_asking_rate

InteractionHistory
  user_id, date, message_count, avg_response_time, sentiment_trend

ContextWindow  (ephemeral — built per-request, not persisted long-term)
  system_prompt, recent_messages[], injected_memories[], behavior_state,
  personality_snapshot, token_count

Reminder
  id, user_id, trigger_at, payload, status (pending|fired|cancelled)

TaskQueue
  id, type, payload, run_at, status, retry_count, max_retries
```

**Design note:** `ContextWindow` is intentionally *not* a persisted table — it's a value object constructed fresh on every LLM call from the other entities. Persisting it would create a stale-cache problem.

---

## 5. Memory Architecture

A four-layer model, ordered from most volatile to most durable:

```
┌─────────────────────────────────────────────────┐
│ 1. Working Memory        (in-process, seconds)   │  current turn's scratch state
├─────────────────────────────────────────────────┤
│ 2. Conversation Memory   (Redis, hours-days)      │  recent message window, current session
├─────────────────────────────────────────────────┤
│ 3. Long-Term Memory      (Vector DB + Postgres)   │  facts, preferences, summaries
├─────────────────────────────────────────────────┤
│ 4. Relationship Memory   (Postgres)                │  slow-changing relational state
└─────────────────────────────────────────────────┘
```

**Working Memory** — exists only for the duration of processing a single message: parsed intent, pending media analysis, temp flags. Never persisted.

**Conversation Memory** — the last N messages (raw) plus the current session's topic stack. Backed by Redis for low-latency reads. Expires with the session (idle timeout).

**Long-Term Memory** — the durable layer, split into:
- **Facts** — atomic, verifiable statements ("user works night shifts").
- **Preferences** — stated likes/dislikes/style requests.
- **Summaries** — LLM-generated compressions of past conversations, replacing raw history once it ages out of Conversation Memory.

Each entry gets an **Importance Score** (0-1), computed from recency, emotional salience (detected at write-time), and explicit user signal ("remember this"). Retrieval combines:
- **Embedding similarity** to the current message (semantic relevance)
- **Importance Score** (weighted boost)
- **Recency decay** (exponential, so month-old trivia fades before month-old commitments)

**Memory Ranking** at retrieval time = `similarity * w1 + importance * w2 + recency_decay * w3`, top-K selected under the token budget.

**Memory Expiration** — facts and preferences don't expire by default; low-importance conversational summaries get pruned or re-compressed (summary-of-summaries) once storage/relevance drops below a threshold. This is a background Scheduler job, not a synchronous path.

**Relationship Memory** — separate from Long-Term Memory because it's not retrieved via similarity search; it's always loaded in full (it's small and structural): familiarity level, trust score, running inside-jokes list.

---

## 6. Context Building

The Context Builder runs on every inbound message that reaches the Behavior Engine's "will reply" branch. Order of assembly matters for both quality and token cost:

1. **Identity & rules** (fixed, cheapest) — system prompt skeleton, safety rules.
2. **Personality snapshot** — current tone/verbosity/emoji settings.
3. **Relationship state** — familiarity level, shared context.
4. **Behavior/emotion state** — current mood vector, energy level.
5. **Conversation summary** — compressed prior context (if session is long).
6. **Recent raw messages** — last N turns, verbatim.
7. **Retrieved memories** — top-K facts/preferences relevant to the current message.
8. **Time-of-day / metadata** — current local time for the user, day of week.
9. **Current message** — the triggering input.

**Token Optimization strategy:**
- A fixed **token budget** is allocated per section (e.g., 15% personality/rules, 35% recent messages, 30% retrieved memory, 20% headroom for response).
- If over budget: raw messages get summarized first (cheapest quality loss), then retrieved-memory count is trimmed, before ever touching the system prompt or safety rules.
- Summaries are cached and only regenerated when the underlying window changes materially.

---

## 7. Personality Engine

A **Personality Profile** is a versioned, mostly-static configuration object plus a small set of *slow-moving* dials the Behavior/Emotion layers can nudge session-to-session (not mid-conversation flip-flopping).

Static dimensions:
- **Communication style** — formal/casual, directness, sentence length bias
- **Vocabulary** — a curated word list/avoid-list, slang tolerance
- **Writing habits** — punctuation quirks, capitalization style, typo tolerance (intentional "humanness")
- **Emoji usage** — frequency curve + a preferred emoji subset
- **Typing quirks** — abbreviations, filler words, regional phrasing
- **Humor style** — dry, playful, sarcastic, absent
- **Energy level baseline** — how upbeat responses default to
- **Response length bias** — terse vs. elaborative default
- **Decision-making tone** — how the agent frames opinions/uncertainty

**Consistency over time** is enforced by treating the Personality Profile as close to immutable within a version — the Behavior Engine and Emotion State are what add situational variance (a consistently "playful" agent can still sound tired late at night without changing *who it is*). This separation (identity vs. state) is what prevents "personality drift" — a common failure mode where an agent's character erodes over long deployments.

---

## 8. Behavior Engine

This is the decision layer that turns "a message arrived" into "here's what happens." It is the module most responsible for the agent feeling human rather than mechanical.

**Reply Decision** — a scored pipeline, not a binary flag:
```
score = base_engagement
       + relationship.familiarity_weight
       - emotion_state.fatigue
       + topic_relevance
       + direct_mention_bonus
→ reply | ignore | delayed_reply | acknowledge_only
```

**When to reply** — governed by a **Timing Model**: sampled delay based on message complexity, agent's simulated "activity" state (e.g., appears busy in the afternoon), and a randomized human-like jitter so responses aren't suspiciously instant or metronomic.

**Whether to ignore** — deliberately rare, reserved for low-signal messages (e.g., a lone emoji reaction) where the Behavior Profile's `ignore_probability` allows silence, mimicking natural conversational dynamics.

**Continue vs. change topics** — tracked via the Conversation State Manager's topic stack; the engine has a `topic_change_tolerance` that governs how readily it follows a tangent vs. steering back.

**Asking questions** — rate-limited by `question_asking_rate` so the agent doesn't interrogate; biased upward early in a relationship (curiosity) and downward as familiarity increases.

**Emoji frequency, short messages, multi-message bursts** — all sampled from the Behavior Profile's distributions, not hardcoded, so different agent personalities produce measurably different texting patterns.

**When to stop talking** — session-end heuristics: user inactivity past a threshold, explicit sign-off detected, or a soft "natural close" the agent itself initiates (mirroring how real conversations trail off) rather than abrupt cutoff.

This entire module is intentionally probabilistic and profile-driven rather than a hardcoded flowchart, because the "realistic behavior" goal in the brief is fundamentally about *variance*, not correctness.

---

## 9. Media Pipeline

Async by design — media is acknowledged immediately (typing/received indicator) and processed off the hot path.

| Media type | Processing | Output stored |
|---|---|---|
| **Images** | Vision-model captioning + object/scene description | `analysis_summary` |
| **Audio / Voice notes** | Speech-to-text transcription + tone/emotion cues where supported | `transcript` |
| **Video** | Keyframe extraction → image pipeline, plus audio track → audio pipeline | combined summary |
| **Documents** | Text extraction (PDF/DOCX parsing), summarized if long | `analysis_summary` |
| **Stickers** | Mapped to a known sticker-pack meaning table, or vision-captioned if unknown | tag/label |
| **Emojis-as-messages** | Treated as sentiment signal, not media — routed to Behavior Engine directly | n/a |

Every processed media item emits a `MediaAnalyzed` event, which the Conversation Manager attaches to the triggering message before the Context Builder runs — media analysis is always resolved *before* the Behavior Engine decides whether/how to respond, so decisions are never made on an unprocessed attachment.

**Captions & metadata** are stored alongside the media reference so future memory retrieval can surface "the photo you sent me last week" contextually.

---

## 10. Prompt Engineering

Layered composition, assembled by the Prompt Builder in this fixed order (most stable → most dynamic):

1. **System Prompt** — identity, immutable behavioral contract, safety rules. Changes only on deploy.
2. **Developer Prompt** — operational instructions not shown to the "character" framing (output format constraints, function-calling schema if used).
3. **Safety Rules** — always injected last in the static block so they can't be diluted by dynamic content pushing them out of the effective context.
4. **Dynamic Prompt** — personality snapshot + emotion state + relationship state, regenerated per session.
5. **Context Injection** — the assembled Context Window from section 6 (recent messages, retrieved memories).
6. **Memory Injection** — explicitly labeled memory block (`<memories>...</memories>`) so the model can distinguish "things I know about this person" from "things they just said."
7. **Behavior Rules** — the current turn's behavior-engine decision, passed as an instruction (e.g., "respond briefly, 1-2 messages, mildly playful tone") so the LLM's *output shape* matches the Behavior Engine's *decision*, rather than the two systems fighting each other.

**Why safety rules are structurally separated and always-last-in-static-block:** it keeps them immune to token-budget trimming logic that only ever touches the dynamic sections.

---

## 11. LLM Layer

A provider-agnostic router sitting behind a single interface:

```
LLMRouter.complete({
  messages, systemPrompt, tools?, maxTokens, temperature,
  preferredProvider?, capabilityRequirements? (vision, audio, long-context)
}) → { text, toolCalls?, usage, provider, latencyMs }
```

**Provider adapters** (OpenAI, Anthropic, Google, OpenRouter, local models via e.g. Ollama) each implement the same interface, translating the canonical request shape into their SDK's format. The application core never imports a provider SDK directly — only `LLMRouter`.

**Fallback strategy:**
- Primary provider fails/times out → automatic retry against a configured secondary.
- Capability-based routing: vision or audio requests route to a provider/model known to support that modality, transparently.
- Circuit breaker pattern per provider to avoid hammering a degraded service.

**Why this matters for a research project specifically:** provider pricing, rate limits, and model quality shift constantly; an abstraction here means swapping models is a config change, not a refactor — essential for a project meant to experiment.

---

## 12. Scheduler

Responsibilities, each implemented as a distinct job type in the Task Queue:

- **Delayed responses** — the Behavior Engine's timing decision is executed here (send at T+delay, not immediately).
- **Idle timers** — detect conversation inactivity, trigger session close or a re-engagement nudge.
- **Conversation cooldowns** — enforce a minimum gap after certain interaction types (e.g., after the agent was asked to stop).
- **Background memory maintenance** — expiration sweeps, summary compression, embedding re-indexing.
- **Periodic summaries** — nightly/weekly conversation summarization jobs to keep Conversation Memory lean.
- **Recurring jobs** — health checks, analytics rollups, cost reports.

Implementation preference: a durable job queue (e.g., BullMQ on Redis, or Postgres-backed for simplicity at small scale) rather than in-process `setTimeout`, so scheduled work survives restarts.

---

## 13. Event System

Event-driven core; all modules communicate via typed events on the Event Bus.

```
MessageReceived        { conversationId, messageId, userId, ... }
MediaReceived           { messageId, mediaId, type }
MediaAnalyzed           { mediaId, analysisSummary }
MemoryCreated            { memoryId, userId, type, importance }
MemoryUpdated            { memoryId, changes }
ConversationStarted      { conversationId, userId }
ConversationEnded        { conversationId, reason }
BehaviorDecided          { messageId, decision: reply|ignore|delay, params }
LLMCompleted             { requestId, provider, latencyMs, tokenUsage }
ResponseSent              { messageId, conversationId }
```

**Why event-driven:** it decouples the "decide" and "act" halves of the system, makes the whole pipeline replayable for debugging (store the event log, replay against a modified Behavior Engine to see how a decision *would* have changed), and lets analytics/observability subscribe without touching business logic.

At MVP scale, an in-process EventEmitter is sufficient. The interface should be identical to what a real broker (Redis Streams, NATS, Kafka) would expose, so migrating later is a swap, not a rewrite.

---

## 14. Database Design

| Data | Recommended store | Why |
|---|---|---|
| Messages, Users, Conversations, Relationships, Reminders | **PostgreSQL** | Relational integrity, transactional writes, mature tooling |
| Embeddings (memory/knowledge retrieval) | **pgvector (on the same Postgres)** or a dedicated vector DB (Qdrant/Weaviate) at scale | Keeps one source of truth at MVP; split out only when QPS demands it |
| Conversation Memory (hot, recent window) | **Redis** | Low-latency reads/writes, natural TTL for session expiry |
| Media files | **Object storage (S3-compatible)** | Binary blobs don't belong in a relational DB |
| Logs | **Structured log store (e.g., Loki, or hosted like Datadog)** | Query-by-label, cheap retention tiers |
| Analytics/metrics | **Time-series store (Prometheus + Grafana, or a hosted APM)** | Built for aggregation over time |
| Task queue | **Redis-backed (BullMQ)** or Postgres-backed at small scale | Durable, restart-safe |

**Starting recommendation for a single-agent MVP:** Postgres + pgvector + Redis. This is two moving parts, not five, and covers every requirement above except object storage. Split into dedicated services only when a specific bottleneck is measured, not preemptively.

---

## 15. Configuration System

A single typed `ConfigService` loaded at boot, validated against a schema (e.g., Zod), sourced from layered inputs in priority order:

```
defaults.json → environment variables → runtime feature-flag overrides (admin panel)
```

Covers:
- **Environment variables** — secrets, provider API keys, database URLs
- **Feature flags** — toggle modules (e.g., disable media pipeline, disable behavior randomness for deterministic testing)
- **Model switching** — which provider/model is default per capability (text/vision/audio)
- **Logging levels** — per-module verbosity, adjustable at runtime
- **Rate limits** — per-user message rate, per-provider request rate
- **Memory limits** — max working set size, token budgets per context section (tunable without redeploy)

Runtime-adjustable flags (via Admin Panel) are stored in Postgres and hot-reloaded through the Event Bus (`ConfigChanged` event), so tuning behavior doesn't require a restart.

---

## 16. Observability

- **Logging** — structured JSON logs, one line per event, correlation ID threaded through the whole pipeline (message → memory retrieval → LLM call → response).
- **Metrics** — response latency, reply-vs-ignore ratio, average messages-per-conversation, memory retrieval hit rate.
- **Tracing** — distributed trace per message lifecycle (gateway → behavior → LLM → response), critical for diagnosing *why* a particular response took 8 seconds or skipped a memory that should have been relevant.
- **Cost monitoring** — token usage and $ cost per conversation, per provider, aggregated daily; this is a research project, so runaway cost is a real risk without this.
- **Token usage** — tracked per LLM call, rolled up per user and per day, feeding both cost monitoring and context-budget tuning.
- **Error tracking** — captured exceptions with full context snapshot (redacted of PII) for reproduction.
- **Health checks** — liveness/readiness endpoints per module, especially the WhatsApp transport connection (these sessions can silently drop).

---

## 17. Security

- **Secrets** — never in code or logs; environment-injected or pulled from a secrets manager (e.g., Doppler, AWS Secrets Manager) at boot.
- **Encryption** — at-rest encryption for the database and object storage; TLS everywhere in transit.
- **Authentication** — the Admin Panel requires its own auth (not the WhatsApp session); API endpoints (if exposed beyond the agent itself) require signed tokens.
- **Access control** — role-based access for the Admin Panel (viewer vs. operator vs. owner), since it can read raw conversation content.
- **Input validation** — every inbound message and media payload validated/sanitized before entering the pipeline; media processed in an isolated context to limit blast radius of a malformed file.
- **Rate limiting** — per-user and global, both to protect cost and to prevent abuse of the agent as a spam relay.
- **Data retention** — explicit retention policy per data type (raw messages vs. summaries vs. facts); this project touches another person's private messages, so retention limits and a deletion path are not optional.
- **Privacy considerations** — since this is a research project involving real conversations with a real person, informed consent, a clear data-use boundary, and a "forget me" mechanism (cascading delete across Postgres, Redis, and the vector store) should be treated as core requirements, not future work.

---

## 18. Development Roadmap

**Phase 1 — Basic Messaging**
WhatsApp connection (Gateway), simple pass-through to an LLM, no memory. Goal: prove the transport layer is reliable.

**Phase 2 — Memory**
Working + Conversation Memory, basic Long-Term facts/preferences, naive retrieval (no ranking yet).

**Phase 3 — Behavior Engine**
Reply/ignore decisions, timing model, Personality Engine v1 (static profile, no emotion state yet).

**Phase 4 — Media Understanding**
Image captioning, voice transcription, media-aware context injection.

**Phase 5 — Scheduling**
Delayed responses, idle detection, background memory maintenance jobs.

**Phase 6 — Optimization**
Token-budget tuning, memory ranking refinement, provider fallback hardening, cost dashboards.

**Phase 7 — Evaluation**
Structured evaluation harness: consistency tests (does personality drift over N turns?), behavioral realism scoring, cost-per-conversation benchmarks, regression suite against prior prompt versions.

Each phase should ship independently usable — Phase 1 alone is a working (if simple) WhatsApp bot.

---

## 19. Future Features

- Voice conversations (real-time speech-to-speech, not just transcription)
- Improved computer vision (multi-image reasoning, video understanding beyond keyframes)
- Multi-agent support (multiple distinct personalities on one platform)
- Tool calling / function calling (calendar, search, reminders as real actions, not just simulated)
- Calendar integration
- Web search grounding
- Knowledge graph layer (structured relationships between facts, beyond flat embeddings)
- Learning from interactions (personality/behavior profile slowly adapting based on outcomes)
- A proper analytics dashboard for conversation health
- A plugin system so third-party capabilities can be added without core changes

---

## 20. Final Review

**Architectural risks**
- Behavior Engine complexity can balloon into an unmaintainable rules pile if probabilistic parameters aren't centralized in the Behavior Profile data model — enforce that discipline early.
- Memory retrieval quality is the single biggest lever on "does this feel like a consistent person" — under-investment here undermines everything above it.

**Technical debt risks**
- Skipping the LLM Router abstraction "for now, just to move fast" is the most common shortcut that becomes expensive later — every phase depends on providers changing pricing/availability.

**Scalability bottlenecks**
- A single Postgres+pgvector instance will comfortably handle one agent and thousands of light users; heavy concurrent multi-agent load is where vector search and Redis session state need to split into dedicated services.
- The WhatsApp transport layer itself (especially unofficial libraries like Baileys) is often the real bottleneck/fragility point, not the AI stack.

**Performance bottlenecks**
- Synchronous media analysis on the hot path would be the biggest latency risk — the async design in section 9 exists specifically to avoid this.
- Context Builder doing a full re-summarization on every turn instead of caching is a common accidental cost/latency sink.

**Cost bottlenecks**
- Uncapped memory retrieval (pulling too many/too-large memories per request) silently inflates token cost — the ranked, budgeted retrieval in section 5/6 is the guardrail.
- Vision/audio calls are typically far more expensive per-request than text — route them deliberately, not by default.

**Alternative architectures considered**
- A simpler "stateless prompt with giant context window" approach (no explicit memory layers, just dump recent history) was rejected: it doesn't scale token-cost-wise, and it can't express "remember this forever but don't repeat it verbatim," which is central to the realism goal.
- A fully synchronous pipeline (no Event Bus) was rejected because it couples behavior decisions to response generation, making it hard to add observers (analytics, admin tooling) later without touching core logic.

**Best practices carried throughout**
- Interfaces before implementations (Gateway, LLM Router, Memory Manager all interface-first).
- Identity (Personality) vs. state (Emotion/Behavior) kept structurally separate to prevent character drift.
- Everything observable by default — this is a research project; the ability to inspect *why* the agent behaved a certain way is as important as the behavior itself.
