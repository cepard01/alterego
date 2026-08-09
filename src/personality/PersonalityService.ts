// PersonalityService — facade over versioned personality profiles.
// Loads the latest stored profile (or the default), exposes snapshots for
// the context builder, and publishes new versions explicitly (v1 §7).

import { Personality } from '@alterego/data';
import { DEFAULT_PERSONALITY, PersonalityProfile, PersonalitySnapshot, toSnapshot } from './profile.js';

/** Structural subset of the data package's PersonalityRepository. */
export interface PersonalityData {
  findLatest(): Promise<Personality | undefined>;
  create(personality: Omit<Personality, 'id' | 'updatedAt' | 'version'> & { id?: string }): Promise<Personality>;
}

/**
 * New personality version. Base fields come from the data entity; the
 * profile extras (energyBaseline, responseLengthBias, decisionTone,
 * typoTolerance) are optional and fall back to the current profile.
 */
export type PersonalityPublishInput =
  & Omit<Personality, 'id' | 'updatedAt' | 'version' | 'name'>
  & { name?: string }
  & Partial<Pick<PersonalityProfile, 'energyBaseline' | 'responseLengthBias' | 'decisionTone' | 'typoTolerance'>>;

export class PersonalityService {
  private cached: PersonalityProfile | null = null;

  constructor(private readonly data: PersonalityData) {}

  /** Current profile — latest stored version or the built-in default. */
  async current(): Promise<PersonalityProfile> {
    if (this.cached) return this.cached;
    const stored = await this.data.findLatest();
    this.cached = stored ? { ...DEFAULT_PERSONALITY, ...stored } : DEFAULT_PERSONALITY;
    return this.cached;
  }

  async snapshot(): Promise<PersonalitySnapshot> {
    return toSnapshot(await this.current());
  }

  /**
   * Persist a new personality version. Never mutates in place — the new
   * version becomes current only after this call.
   */
  async publish(profile: PersonalityPublishInput): Promise<PersonalityProfile> {
    const current = await this.current();
    const stored = await this.data.create({
      ...profile,
      name: profile.name ?? current.name,
    });
    const next: PersonalityProfile = {
      ...current,
      ...profile,
      ...stored,
      id: stored.id,
      name: stored.name,
      version: stored.version,
      updatedAt: stored.updatedAt,
    };
    this.cached = next;
    return next;
  }

  invalidate(): void {
    this.cached = null;
  }
}
