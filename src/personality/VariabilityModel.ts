// Variability model — v2 §11 bounded randomness anchored to the personality
// baseline. Every sample is drawn from a distribution centered on the
// baseline; variance widens with fatigue/stress, and mood swings are rare,
// time-boxed events that always revert.

import { PersonalityProfile } from './Profile.js';

export interface PsychologyInput {
  fatigue: number;
  stress: number;
  focusLevel: number;
  socialEnergy: number;
  /** 0-1: how much patience remains before the agent changes subject. */
  patience: number;
}

export interface VariabilityOutput {
  /** Effective verbosity 0-1 (baseline ± variance, wider when fatigued). */
  effectiveVerbosity: number;
  /** Effective energy 0-1 (baseline ± variance, correlated with psychology). */
  effectiveEnergy: number;
  /** Probability of an intentional typo (rises with speed, low focus). */
  typoProbability: number;
  /** Probability the agent drifts topics (rises with low patience/curiosity). */
  topicDriftProbability: number;
  /** Rare, bounded deviation — always reverts within a few turns. */
  moodSwingTriggered: boolean;
}

export interface Rng {
  next(): number;
}

export class MathRng implements Rng {
  next(): number {
    return Math.random();
  }
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

function gaussian(rng: Rng, mean: number, stdDev: number): number {
  // Box–Muller; clamp to [0,1] after applying.
  const u = Math.max(rng.next(), Number.EPSILON);
  const v = Math.max(rng.next(), Number.EPSILON);
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * stdDev;
}

export class VariabilityModel {
  constructor(
    private readonly rng: Rng = new MathRng(),
    /** Fixed per-instance so tests can reproduce mood swings. */
    private readonly moodSwingChance = 0.02,
  ) {}

  applyNoise(baseline: PersonalityProfile, psychology: PsychologyInput): VariabilityOutput {
    const variance = 0.1 + psychology.fatigue * 0.15 + psychology.stress * 0.05;
    const verbosity = gaussian(this.rng, baseline.verbosity, variance);
    const energy = gaussian(this.rng, baseline.energyBaseline - psychology.fatigue * 0.3 + psychology.socialEnergy * 0.2, variance);

    const typoProbability = clamp(baseline.typoTolerance + (1 - psychology.focusLevel) * 0.05);
    const topicDriftProbability = clamp(0.1 + (1 - psychology.patience) * 0.2);

    const moodSwingTriggered = this.rng.next() < this.moodSwingChance;
    return {
      effectiveVerbosity: clamp(verbosity),
      effectiveEnergy: clamp(energy),
      typoProbability,
      topicDriftProbability,
      moodSwingTriggered,
    };
  }
}

