// Built-in defaults — lowest-priority config layer (v1 §15).
// Overridden by environment variables and runtime admin overrides.

import { AppConfig } from './ConfigSchema.js';

export const defaults: AppConfig = {
  env: 'development',

  database: {
    url: '',
  },
  redis: {
    url: '',
  },

  data: {
    mode: 'sqlite',
    sqlitePath: './alterego.db',
  },

  log: {
    level: 'info',
    perModule: {},
  },

  llm: {
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o-mini',
    providers: {},
  },

  featureFlags: {},

  rateLimits: {
    perUserPerMinute: 20,
    globalPerMinute: 200,
  },

  memory: {
    tokenBudgets: {
      identityRules: 600,
      personality: 400,
      relationship: 300,
      behaviorState: 250,
      conversationSummary: 800,
      recentMessages: 2500,
      retrievedMemory: 2000,
      metadata: 150,
      currentMessage: 500,
    },
    maxRecentMessages: 20,
    topKMemories: 8,
    conversationMemoryTtlHours: 72,
  },

  scheduler: {
    tickIntervalMs: 60_000,
    idleConversationMs: 6 * 60 * 60 * 1000,
  },

  media: {
    enabled: true,
    maxOutboundBytes: 16_000_000,
  },

  whatsapp: {
    provider: 'baileys',
    sessionPath: './.whatsapp-session',
    cloudApiPhoneNumberId: '',
    cloudApiToken: '',
    cloudApiWebhookSecret: '',
  },

  admin: {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    token: '',
  },

  evaluation: {
    enabled: true,
  },
};

