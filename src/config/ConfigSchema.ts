// Config schema — single typed source of truth for the whole system (v1 §15).
// Validated at boot with Zod; failures are fatal (fail fast on bad config).

import { z } from 'zod';

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const LlmCapabilitySchema = z.enum(['text', 'vision', 'audio', 'long-context']);
export type LlmCapability = z.infer<typeof LlmCapabilitySchema>;

export const ModelSchema = z.object({
  id: z.string(),
  capabilities: z.array(LlmCapabilitySchema).default(['text']),
  maxTokens: z.number().int().positive().default(4096),
});
export type ModelConfig = z.infer<typeof ModelSchema>;

export const ProviderSchema = z.object({
  apiKey: z.string().default(''),
  baseUrl: z.string().url().optional(),
  models: z.record(z.string(), ModelSchema).default({}),
  /** Fallback ordering — lower number means higher priority. */
  priority: z.number().int().default(10),
  timeoutMs: z.number().int().positive().default(30_000),
  /** Circuit breaker: open after this many consecutive failures. */
  breakerThreshold: z.number().int().positive().default(5),
  /** Circuit breaker: cooldown before trying again (ms). */
  breakerCooldownMs: z.number().int().positive().default(60_000),
  /** USD per 1000 tokens, for cost tracking (v1 §16). */
  pricing: z
    .object({
      inputPer1k: z.number().nonnegative().default(0),
      outputPer1k: z.number().nonnegative().default(0),
    })
    .default({ inputPer1k: 0, outputPer1k: 0 }),
});
export type ProviderConfig = z.infer<typeof ProviderSchema>;

export const AppConfigSchema = z.object({
  env: z.enum(['development', 'test', 'production']).default('development'),

  database: z.object({
    url: z.string().min(1, 'DATABASE_URL is required'),
  }),

  /** Local file-backed storage is the default; Postgres is opt-in. */
  data: z.object({
    mode: z.enum(['sqlite', 'postgres', 'memory']).default('sqlite'),
    /** SQLite database file (mode 'sqlite'). */
    sqlitePath: z.string().default('./alterego.db'),
  }),

  log: z.object({
    level: LogLevelSchema.default('info'),
    /** Per-module verbosity override, e.g. { "gateway": "debug" }. */
    perModule: z.record(z.string(), LogLevelSchema).default({}),
  }),

  llm: z.object({
    defaultProvider: z.string().default('openai'),
    defaultModel: z.string().default('gpt-4o-mini'),
    providers: z.record(z.string(), ProviderSchema).default({}),
  }),

  featureFlags: z.record(z.string(), z.boolean()).default({}),

  rateLimits: z.object({
    perUserPerMinute: z.number().int().positive().default(20),
    globalPerMinute: z.number().int().positive().default(200),
  }),

  memory: z.object({
    /** Token budget per Context Builder section (v1 §6). */
    tokenBudgets: z.record(z.string(), z.number().int().positive()).default({
      identityRules: 600,
      personality: 400,
      relationship: 300,
      behaviorState: 250,
      conversationSummary: 800,
      recentMessages: 2500,
      retrievedMemory: 2000,
      metadata: 150,
      currentMessage: 500,
    }),
    maxRecentMessages: z.number().int().positive().default(20),
    topKMemories: z.number().int().positive().default(8),
    conversationMemoryTtlHours: z.number().int().positive().default(72),
  }),

  scheduler: z.object({
    tickIntervalMs: z.number().int().positive().default(60_000),
    /** How long after the last message before a conversation is closed. */
    idleConversationMs: z.number().int().positive().default(6 * 60 * 60 * 1000),
  }),

  media: z.object({
    enabled: z.boolean().default(true),
    /** Outbound media must stay under this many bytes (WhatsApp limit). */
    maxOutboundBytes: z.number().int().positive().default(16_000_000),
  }),

  whatsapp: z.object({
    provider: z.enum(['baileys', 'cloud-api']).default('baileys'),
    sessionPath: z.string().default('./.whatsapp-session'),
    cloudApiPhoneNumberId: z.string().default(''),
    cloudApiToken: z.string().default(''),
    cloudApiWebhookSecret: z.string().default(''),
  }),

  admin: z.object({
    /** The local web panel (chat + inspection). On by default. */
    enabled: z.boolean().default(true),
    port: z.number().int().positive().default(3001),
    host: z.string().default('127.0.0.1'),
    /** Bearer token required on admin endpoints when set. */
    token: z.string().default(''),
  }),

  evaluation: z.object({
    enabled: z.boolean().default(true),
  }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
