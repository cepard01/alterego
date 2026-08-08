// Health checks — liveness/readiness per component, especially the WhatsApp
// transport connection which can silently drop (v1 §16).

export type HealthCheckFn = () => Promise<void> | void;

export interface HealthStatus {
  ok: boolean;
  detail: string;
  lastCheckedAt: string | null;
}

export class HealthRegistry {
  private readonly checks = new Map<string, { check: HealthCheckFn; status: HealthStatus }>();

  register(name: string, check: HealthCheckFn): void {
    this.checks.set(name, { check, status: { ok: true, detail: 'pending', lastCheckedAt: null } });
  }

  async run(name: string): Promise<HealthStatus> {
    const entry = this.checks.get(name);
    if (!entry) throw new Error(`Unknown health check "${name}"`);
    try {
      await entry.check();
      entry.status = { ok: true, detail: 'ok', lastCheckedAt: new Date().toISOString() };
    } catch (error) {
      entry.status = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        lastCheckedAt: new Date().toISOString(),
      };
    }
    return entry.status;
  }

  async runAll(): Promise<Record<string, HealthStatus>> {
    const out: Record<string, HealthStatus> = {};
    for (const name of this.checks.keys()) {
      out[name] = await this.run(name);
    }
    return out;
  }
}
