// Personality Engine — versioned communication style + bounded variability
// anchored to baselines (v1 §7, v2 §11).

export { DEFAULT_PERSONALITY, toSnapshot } from './Profile.js';
export type { PersonalityProfile, PersonalitySnapshot } from './Profile.js';
export { MathRng, VariabilityModel } from './VariabilityModel.js';
export type { PsychologyInput, Rng, VariabilityOutput } from './VariabilityModel.js';
export { PersonalityService } from './PersonalityService.js';
export type { PersonalityData } from './PersonalityService.js';

