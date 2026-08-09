import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@alterego/events';
import { ConfigService } from '../src/config/Index.js';

function makeBus() {
  return new InMemoryEventBus();
}

const baseEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
};

describe('ConfigService', () => {
  it('loads defaults when no env is present', () => {
    const config = new ConfigService(makeBus(), {
      env: { ...baseEnv },
      quiet: true,
    });
    expect(config.get().env).toBe('development');
    expect(config.get().log.level).toBe('info');
    expect(config.get().rateLimits.perUserPerMinute).toBe(20);
  });

  it('applies environment overrides on top of defaults', () => {
    const config = new ConfigService(makeBus(), {
      env: { ...baseEnv, NODE_ENV: 'production', LOG_LEVEL: 'debug', OPENAI_API_KEY: 'sk-test' },
      quiet: true,
    });
    expect(config.get().env).toBe('production');
    expect(config.get().log.level).toBe('debug');
    expect(config.get().llm.providers.openai.apiKey).toBe('sk-test');
  });

  it('fails fast on invalid config', () => {
    expect(() => new ConfigService(makeBus(), { env: {}, quiet: true })).toThrow(
      /DATABASE_URL is required/,
    );
  });

  it('reads feature flags from FEATURE_* env vars', () => {
    const config = new ConfigService(makeBus(), {
      env: { ...baseEnv, FEATURE_MEDIA: 'false', FEATURE_BEHAVIOR_RANDOMNESS: 'true' },
      quiet: true,
    });
    expect(config.isEnabled('media')).toBe(false);
    expect(config.isEnabled('behavior_randomness')).toBe(true);
    expect(config.isEnabled('unknown')).toBe(false);
  });

  it('applies runtime overrides and emits ConfigChanged', () => {
    const bus = makeBus();
    const handler = vi.fn();
    bus.subscribe('ConfigChanged', handler);
    const config = new ConfigService(bus, { env: baseEnv });

    config.applyOverrides({ 'memory.maxRecentMessages': 40, 'log.level': 'warn' });

    expect(config.get().memory.maxRecentMessages).toBe(40);
    expect(config.get().log.level).toBe('warn');
    expect(handler).toHaveBeenCalledTimes(2);
    const first = handler.mock.calls[0][0];
    expect(first.payload.key).toBe('memory.maxRecentMessages');
    expect(first.payload.oldValue).toBe(20);
    expect(first.payload.newValue).toBe(40);
  });

  it('rejects overrides that violate the schema', () => {
    const config = new ConfigService(makeBus(), { env: baseEnv, quiet: true });
    expect(() => config.applyOverrides({ 'rateLimits.perUserPerMinute': -5 })).toThrow();
  });

  it('resolves default model ids per provider', () => {
    const config = new ConfigService(makeBus(), { env: baseEnv, quiet: true });
    expect(config.defaultModelId('openai')).toBe('gpt-4o-mini');
  });

  it('supports dotted path reads', () => {
    const config = new ConfigService(makeBus(), { env: baseEnv, quiet: true });
    expect(config.getPath('whatsapp.provider')).toBe('baileys');
    expect(config.getPath('does.not.exist')).toBeUndefined();
  });
});

