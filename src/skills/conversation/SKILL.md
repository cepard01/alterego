---
name: conversation
description: Guides the agent through natural, context-aware conversation turns.
triggers: manual, contextual
version: 1.0.0
---

# Conversation Skill

## Overview

This skill governs how the agent engages in conversation. It ensures replies feel human, contextual, and aligned with the current persona state.

## When to Use

- Inbound message received
- Conversation turn is required
- Context-aware reply generation

## Process

1. **Load context** — recent messages, relationship strength, world state, cognitive load
2. **Assess action** — decide whether to reply with text, sticker, or no action
3. **Build prompt** — inject identity, personality, memories, and time context
4. **Generate** — call the LLM through the router with appropriate temperature and capability requirements
5. **Plan execution** — apply timing model (typing delay, pacing)
6. **Send** — deliver through the transport adapter
7. **Record** — persist message, update conversation state, log turn metadata

## Rules

- Never break character. Stay within the persona's tone, energy, and verbosity.
- Respect cognitive load. Under fatigue or stress, prefer shorter replies.
- Use stickers only when the timing model returns high confidence for a sticker action.
- Always update `lastActivityAt` on receipt.
- Publish `MessageProcessed` after successful send.

## Red Flags

- Generating text when `needsText` is false
- Skipping context injection
- Hardcoded response templates that ignore personality
