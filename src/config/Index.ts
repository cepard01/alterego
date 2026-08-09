// Configuration Manager — single typed, validated config source (v1 §15).

export { AppConfigSchema, LogLevelSchema, LlmCapabilitySchema, ModelSchema, ProviderSchema } from './ConfigSchema.js';
export type { AppConfig, LlmCapability, LogLevel, ModelConfig, ProviderConfig } from './ConfigSchema.js';
export { ConfigService } from './ConfigService.js';
export type { ConfigLoadOptions } from './ConfigService.js';
export { deepMerge, envToConfig, envToFeatureFlags, getPath, isPlainObject, setPath } from './Merge.js';
export type { Json } from './Merge.js';

