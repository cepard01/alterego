// Layering and merging helpers for the config system (v1 §15):
//   defaults.json -> environment variables -> runtime overrides.

export type Json = { [key: string]: Json } | Json[] | string | number | boolean | null | undefined;

export function deepMerge<T extends Json>(base: T, overlay: Json): T {
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    return (overlay === undefined ? base : overlay) as T;
  }
  const out: Record<string, Json> = { ...(base as Record<string, Json>) };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    out[key] = deepMerge(out[key], value);
  }
  return out as T;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resolves a dotted path ('llm.defaultProvider') into a nested object. */
export function getPath(target: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, target);
}

/** Sets a dotted path into a nested object (creating intermediates as needed). */
export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const next = cursor[segment];
    if (!isPlainObject(next)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

/**
 * Maps process environment variables into config-shaped values.
 * Known variables override defaults; the rest are ignored.
 */
export function envToConfig(env: NodeJS.ProcessEnv): Json {
  const out: Record<string, Json> = {};
  const put = (path: string, value: Json) => setPath(out, path, value);

  if (env.NODE_ENV) put('env', env.NODE_ENV);
  if (env.DATABASE_URL) put('database.url', env.DATABASE_URL);
  if (env.LOG_LEVEL) put('log.level', env.LOG_LEVEL);

  if (env.OPENAI_API_KEY) put('llm.providers.openai.apiKey', env.OPENAI_API_KEY);
  if (env.ANTHROPIC_API_KEY) put('llm.providers.anthropic.apiKey', env.ANTHROPIC_API_KEY);
  if (env.GOOGLE_API_KEY) put('llm.providers.google.apiKey', env.GOOGLE_API_KEY);
  if (env.OPENROUTER_API_KEY) put('llm.providers.openrouter.apiKey', env.OPENROUTER_API_KEY);

  if (env.WHATSAPP_PROVIDER) put('whatsapp.provider', env.WHATSAPP_PROVIDER);
  if (env.WHATSAPP_SESSION_PATH) put('whatsapp.sessionPath', env.WHATSAPP_SESSION_PATH);
  if (env.CLOUD_API_PHONE_NUMBER_ID) put('whatsapp.cloudApiPhoneNumberId', env.CLOUD_API_PHONE_NUMBER_ID);
  if (env.CLOUD_API_TOKEN) put('whatsapp.cloudApiToken', env.CLOUD_API_TOKEN);
  if (env.CLOUD_API_WEBHOOK_SECRET) put('whatsapp.cloudApiWebhookSecret', env.CLOUD_API_WEBHOOK_SECRET);

  if (env.ADMIN_ENABLED) put('admin.enabled', env.ADMIN_ENABLED === 'true');
  if (env.ADMIN_PORT) put('admin.port', Number(env.ADMIN_PORT));
  if (env.ADMIN_TOKEN) put('admin.token', env.ADMIN_TOKEN);

  return out;
}

/** Feature flags may be toggled purely from the environment, e.g. FEATURE_MEDIA=false. */
export function envToFeatureFlags(env: NodeJS.ProcessEnv): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(env)) {
    const match = /^FEATURE_([A-Z0-9_]+)$/.exec(key);
    if (match) {
      flags[match[1].toLowerCase()] = value === 'true' || value === '1';
    }
  }
  return flags;
}
