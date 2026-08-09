import { describe, expect, it } from 'vitest';
import { ConfigService } from '@alterego/config';
import { InMemoryEventBus } from '@alterego/events';
import { DataService } from '@alterego/data';
import { PersonalityService, VariabilityModel } from '../src/personality/index.js';
import { DEFAULT_PERSONALITY } from '../src/personality/profile.js';

function makeService(): PersonalityService {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
    quiet: true,
  });
  const data = new DataService(config, undefined, { memoryMode: true });
  return new PersonalityService(data.personalities);
}

describe('PersonalityService', () => {
  it('returns the default profile when nothing is stored', async () => {
    const service = makeService();
    const current = await service.current();
    expect(current.name).toBe(DEFAULT_PERSONALITY.name);
    expect(current.version).toBe(1);
  });

  it('produces a snapshot for the context builder', async () => {
    const service = makeService();
    const snapshot = await service.snapshot();
    expect(snapshot.tone).toBe('casual');
    expect(snapshot.quirks).toEqual([]);
  });

  it('publishes a new version without mutating the old one', async () => {
    const service = makeService();
    const published = await service.publish({
      tone: 'formal',
      humorStyle: 'absent',
      verbosity: 0.8,
      emojiFrequency: 0.05,
      vocabularyProfile: { avoid: ['bro'] },
      quirks: ['uses "pois bem"'],
      responseLengthBias: 'elaborate',
      decisionTone: 'cautious',
      typoTolerance: 0.01,
    });
    expect(published.version).toBeGreaterThanOrEqual(1);
    expect(published.tone).toBe('formal');

    const snapshot = await service.snapshot();
    expect(snapshot.tone).toBe('formal');
    expect(snapshot.version).toBe(published.version);
  });
});

describe('VariabilityModel', () => {
  it('keeps effective values centered on the baseline', () => {
    const model = new VariabilityModel();
    const baseline = DEFAULT_PERSONALITY;
    let sum = 0;
    const samples = 200;
    for (let i = 0; i < samples; i++) {
      const output = model.applyNoise(baseline, {
        fatigue: 0.3,
        stress: 0.2,
        focusLevel: 0.7,
        socialEnergy: 0.5,
        patience: 0.5,
      });
      sum += output.effectiveVerbosity;
    }
    const mean = sum / samples;
    expect(mean).toBeGreaterThan(baseline.verbosity - 0.15);
    expect(mean).toBeLessThan(baseline.verbosity + 0.15);
  });

  it('raises typo probability when focus is low', () => {
    const model = new VariabilityModel();
    const focused = model.applyNoise(DEFAULT_PERSONALITY, {
      fatigue: 0, stress: 0, focusLevel: 1, socialEnergy: 0.5, patience: 0.5,
    });
    const distracted = model.applyNoise(DEFAULT_PERSONALITY, {
      fatigue: 0, stress: 0, focusLevel: 0, socialEnergy: 0.5, patience: 0.5,
    });
    expect(distracted.typoProbability).toBeGreaterThan(focused.typoProbability);
  });

  it('widers variance when fatigued', () => {
    const model = new VariabilityModel();
    const fresh: number[] = [];
    const tired: number[] = [];
    for (let i = 0; i < 100; i++) {
      fresh.push(model.applyNoise(DEFAULT_PERSONALITY, { fatigue: 0.1, stress: 0, focusLevel: 0.9, socialEnergy: 0.5, patience: 0.5 }).effectiveEnergy);
      tired.push(model.applyNoise(DEFAULT_PERSONALITY, { fatigue: 0.9, stress: 0, focusLevel: 0.1, socialEnergy: 0.5, patience: 0.5 }).effectiveEnergy);
    }
    const spread = (values: number[]): number => Math.max(...values) - Math.min(...values);
    expect(spread(tired)).toBeGreaterThan(spread(fresh));
  });

  it('reports mood swings only rarely and always clamps to bounds', () => {
    const model = new VariabilityModel();
    let swings = 0;
    for (let i = 0; i < 100; i++) {
      const output = model.applyNoise(DEFAULT_PERSONALITY, {
        fatigue: 0.5, stress: 0.5, focusLevel: 0.5, socialEnergy: 0.5, patience: 0.5,
      });
      if (output.moodSwingTriggered) swings += 1;
      expect(output.effectiveVerbosity).toBeGreaterThanOrEqual(0);
      expect(output.effectiveVerbosity).toBeLessThanOrEqual(1);
      expect(output.effectiveEnergy).toBeGreaterThanOrEqual(0);
      expect(output.effectiveEnergy).toBeLessThanOrEqual(1);
    }
    expect(swings).toBeLessThan(25);
  });
});
