// Longitudinal Evolution — slow, bounded, governed change over weeks-months
// (v3 §9).

export { IdentityEvolutionService, LONGITUDINAL_EVOLUTION_JOB } from './IdentityEvolution.js';
export type { EvolutionDataPort, EvolutionPassInput, EvolutionPassResult } from './IdentityEvolution.js';
export { InterestDriftDetector } from './InterestDrift.js';
export type { DriftInput, DriftProposal, InterestBaseline } from './InterestDrift.js';
export { LongitudinalScheduler } from './LongitudinalScheduler.js';
export type { SchedulerInput } from './LongitudinalScheduler.js';

