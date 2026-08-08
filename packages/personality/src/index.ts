// Personality Engine — versioned communication style + bounded variability
// anchored to baselines (v1 §7, v2 §11).

export { DEFAULT_PERSONALITY, toSnapshot } from './profile.js';
export type { PersonalityProfile, PersonalitySnapshot } from './profile.js';
export { MathRng, VariabilityModel } from './variability-model.js';
export type { PsychologyInput, Rng, VariabilityOutput } from './variability-model.js';
export { PersonalityService } from './personality.service.js';
export type { PersonalityData } from './personality.service.js';
