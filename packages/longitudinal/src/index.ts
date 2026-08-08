// Longitudinal Evolution — slow, bounded, governed change over weeks-months
// (v3 §9).

export { IdentityEvolutionService, LONGITUDINAL_EVOLUTION_JOB } from './identity-evolution.js';
export type { EvolutionDataPort, EvolutionPassInput, EvolutionPassResult } from './identity-evolution.js';
export { InterestDriftDetector } from './interest-drift.js';
export type { DriftInput, DriftProposal, InterestBaseline } from './interest-drift.js';
export { LongitudinalScheduler } from './longitudinal-scheduler.js';
export type { SchedulerInput } from './longitudinal-scheduler.js';
