// Configuration Manager — single typed, validated config source (v1 §15).

export { AppConfigSchema, LogLevelSchema, LlmCapabilitySchema, ModelSchema, ProviderSchema } from './config.schema.js';
export type { AppConfig, LlmCapability, LogLevel, ModelConfig, ProviderConfig } from './config.schema.js';
export { ConfigService } from './config.service.js';
export type { ConfigLoadOptions } from './config.service.js';
export { deepMerge, envToConfig, envToFeatureFlags, getPath, isPlainObject, setPath } from './merge.js';
export type { Json } from './merge.js';
