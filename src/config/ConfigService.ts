// ConfigService — typed, validated config with layered sources and hot-reload
// overrides (v1 §15). Runtime overrides arrive from the admin-dashboard (which
// persists them in the data package); each applied override emits ConfigChanged.

import { EventBus } from '@alterego/events';
import { AppConfig, AppConfigSchema } from './ConfigSchema.js';
import { deepMerge, envToConfig, envToFeatureFlags, getPath, Json, setPath } from './Merge.js';
import { defaults } from './Defaults.js';

export interface ConfigLoadOptions {
  /** Extra values that win over everything (e.g. persisted admin overrides). */
  overrides?: Record<string, Json>;
  /** Process environment. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** If true, skip emitting events (used in tests). */
  quiet?: boolean;
}

export class ConfigService {
  private config: AppConfig;
  private readonly bus: EventBus;
  private readonly quiet: boolean;

  constructor(bus: EventBus, options: ConfigLoadOptions = {}) {
    this.bus = bus;
    this.quiet = options.quiet ?? false;

    const env = options.env ?? process.env;
    const featureFlags = envToFeatureFlags(env);
    const envConfig = deepMerge(
      envToConfig(env),
      Object.keys(featureFlags).length > 0 ? { featureFlags } : {},
    );

    const merged = deepMerge(deepMerge(defaults as unknown as Json, envConfig), options.overrides ?? {});
    const parsed = AppConfigSchema.safeParse(merged);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      throw new Error(`Invalid configuration at boot: ${issues}`);
    }
    this.config = parsed.data;
  }

  /** Full read-only snapshot. */
  get(): Readonly<AppConfig> {
    return this.config;
  }

  /** Dotted-path read, e.g. `config.getPath('llm.defaultProvider')`. */
  getPath(path: string): unknown {
    return getPath(this.config as unknown as Record<string, unknown>, path);
  }

  isEnabled(flag: string): boolean {
    return this.config.featureFlags[flag] ?? false;
  }

  /** The configured model id for a provider, falling back to the default model. */
  defaultModelId(provider?: string): string {
    const providerName = provider ?? this.config.llm.defaultProvider;
    const providerCfg = this.config.llm.providers[providerName];
    if (providerCfg && Object.keys(providerCfg.models).length > 0) {
      return Object.values(providerCfg.models)[0].id;
    }
    return this.config.llm.defaultModel;
  }

  /**
   * Applies runtime overrides (dotted paths -> values) and emits ConfigChanged
   * for every key that actually changed. Overrides win over env/defaults but a
   * later apply of the same key replaces the earlier value.
   */
  applyOverrides(overrides: Record<string, Json>): void {
    for (const [path, value] of Object.entries(overrides)) {
      const oldValue = getPath(this.config as unknown as Record<string, unknown>, path);
      const next = structuredClone(this.config);
      setPath(next as unknown as Record<string, unknown>, path, value);
      const parsed = AppConfigSchema.safeParse(next);
      if (!parsed.success) {
        throw new Error(
          `Invalid override for "${path}": ${parsed.error.issues[0]?.message ?? 'schema violation'}`,
        );
      }
      this.config = parsed.data;
      if (!this.quiet) {
        this.bus.publish('ConfigChanged', { key: path, oldValue, newValue: value });
      }
    }
  }

  /** Returns the config for testing/inspection without the service instance. */
  toJSON(): AppConfig {
    return this.config;
  }
}

