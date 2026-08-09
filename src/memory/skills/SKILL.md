---
name: memory
description: Governs how the agent stores, retrieves, and reconciles memories across short and long-term stores.
triggers: manual, contextual, scheduled
version: 1.0.0
---

# Memory Skill

## Overview

This skill encodes the agent's memory behavior: what to remember, how to retrieve it, and how to handle contradictions across time.

## When to Use

- After every conversation turn
- During offline recovery boot
- When contradictions are detected
- Scheduled memory consolidation passes

## Process

1. **Store working memory** — capture the immediate turn context (content, sentiment, topics)
2. **Promote long-term memory** — if the turn is significant, persist to long-term store with confidence and embedding
3. **Detect contradictions** — compare new memories against existing beliefs; flag when confidence is low
4. **Consolidate** — merge related memories, decay stale ones, update entity salience
5. **Retrieve** — on next turn, query long-term memory with recency, relevance, and emotional weight

## Rules

- All memories must have a timestamp, confidence score, and source (conversation | observation | reflection).
- Contradictions must be logged with both sides before resolution.
- Never silently overwrite a long-term memory; always create a revision trail.
- Memory consolidation runs at most once per day per entity.

## Red Flags

- Storing memories without confidence scores
- Skipping contradiction detection
- Hard-deleting memories instead of soft-archiving
