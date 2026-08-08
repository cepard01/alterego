// Sliding-window rate limiting — per-user and global, protecting cost and
// preventing use of the agent as a spam relay (v1 §17).

export interface RateLimitBucket {
  windowStartMs: number;
  count: number;
}

export interface RateLimiterOptions {
  perUserPerMinute: number;
  globalPerMinute: number;
  /** Test hook for deterministic time. */
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  reason: 'ok' | 'user' | 'global';
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private global: RateLimitBucket = { windowStartMs: 0, count: 0 };
  private readonly now: () => number;

  constructor(private readonly options: RateLimiterOptions) {
    this.now = options.now ?? Date.now;
  }

  check(key: string): RateLimitDecision {
    const now = this.now();

    const user = this.bucketFor(key, now);
    if (user.count >= this.options.perUserPerMinute) {
      return { allowed: false, reason: 'user', retryAfterMs: user.windowStartMs + 60_000 - now };
    }

    if (this.global.count >= this.options.globalPerMinute) {
      return { allowed: false, reason: 'global', retryAfterMs: this.global.windowStartMs + 60_000 - now };
    }

    user.count += 1;
    this.global.count += 1;
    return { allowed: true, reason: 'ok', retryAfterMs: 0 };
  }

  reset(key?: string): void {
    if (key) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
      this.global = { windowStartMs: 0, count: 0 };
    }
  }

  private bucketFor(key: string, now: number): RateLimitBucket {
    let bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStartMs >= 60_000) {
      bucket = { windowStartMs: now, count: 0 };
      this.buckets.set(key, bucket);
    }
    if (now - this.global.windowStartMs >= 60_000) {
      this.global = { windowStartMs: now, count: 0 };
    }
    return bucket;
  }
}
