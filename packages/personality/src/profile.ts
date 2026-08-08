// Personality profile — versioned, mostly-static communication style.
// HOW the agent talks, not who it is (v1 §7). Changes only via explicit
// new versions, never silently mid-conversation.

import { Personality } from '@whatsapp-ai-agent/data';

export interface PersonalityProfile extends Personality {
  /** 0-1: how upbeat responses default to. */
  energyBaseline: number;
  /** terse | balanced | elaborate — response length bias. */
  responseLengthBias: 'terse' | 'balanced' | 'elaborate';
  /** how the agent frames opinions/uncertainty. */
  decisionTone: 'direct' | 'cautious' | 'playful';
  /** intentional typo tolerance for "humanness". */
  typoTolerance: number;
}

export const DEFAULT_PERSONALITY: PersonalityProfile = {
  id: 'personality-default',
  name: 'default',
  tone: 'casual',
  humorStyle: 'dry',
  verbosity: 0.5,
  emojiFrequency: 0.3,
  vocabularyProfile: {},
  quirks: [],
  version: 1,
  updatedAt: new Date(0).toISOString(),
  energyBaseline: 0.5,
  responseLengthBias: 'balanced',
  decisionTone: 'direct',
  typoTolerance: 0.02,
};

/** Snapshot injected into the context builder — immutable per request. */
export interface PersonalitySnapshot {
  name: string;
  version: number;
  tone: string;
  humorStyle: string;
  verbosity: number;
  emojiFrequency: number;
  energyBaseline: number;
  responseLengthBias: PersonalityProfile['responseLengthBias'];
  decisionTone: PersonalityProfile['decisionTone'];
  quirks: string[];
}

export function toSnapshot(profile: PersonalityProfile): PersonalitySnapshot {
  return {
    name: profile.name,
    version: profile.version,
    tone: profile.tone,
    humorStyle: profile.humorStyle,
    verbosity: profile.verbosity,
    emojiFrequency: profile.emojiFrequency,
    energyBaseline: profile.energyBaseline,
    responseLengthBias: profile.responseLengthBias,
    decisionTone: profile.decisionTone,
    quirks: profile.quirks,
  };
}
