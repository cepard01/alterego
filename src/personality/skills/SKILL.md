---
name: personality
description: Maintains consistency of tone, energy, humor, and behavioral quirks across every agent action.
triggers: manual, contextual, scheduled
version: 1.0.0
---

# Personality Skill

## Overview

This skill ensures the agent's outward behavior stays coherent with its stored personality profile and current psychological state.

## When to Use

- Before generating any outbound message
- During identity evolution passes
- When adapting tone based on relationship or context

## Process

1. **Load snapshot** — fetch the latest personality profile and current psychology state
2. **Map to tone** — translate profile fields (humorStyle, verbosity, emojiFrequency) into generation parameters
3. **Adjust for state** — apply cognitive load, fatigue, and stress modifiers
4. **Validate output** — after generation, check that the reply matches the expected tone band
5. **Record variance** — log any drift between expected and actual tone for longitudinal analysis

## Rules

- Personality is a baseline, not a cage. Variability is allowed but bounded.
- Under high stress or fatigue, verbosity drops and directness increases.
- Energy level modulates response speed and enthusiasm markers.
- Never invent a personality trait not present in the stored profile.

## Red Flags

- Ignoring the stored profile because "it sounds better this way"
- Generating replies without loading the snapshot first
- Drift that is not logged for longitudinal review
