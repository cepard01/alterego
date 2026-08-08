import { describe, expect, it } from 'vitest';
import { AdminAuth, ForgetMeService, RateLimiter, isValidPhoneNumber, sanitizeMessageText, validateMedia } from '../src/index.js';

describe('AdminAuth', () => {
  it('authenticates a valid token with role claim', () => {
    const auth = new AdminAuth('super-secret');
    const principal = auth.authenticate('Bearer super-secret:owner');
    expect(principal?.role).toBe('owner');
    expect(auth.hasRole(principal!, 'viewer')).toBe(true);
  });

  it('rejects wrong tokens and malformed headers', () => {
    const auth = new AdminAuth('super-secret');
    expect(auth.authenticate('Bearer wrong:owner')).toBeNull();
    expect(auth.authenticate('Bearer super-secret')).toBeNull();
    expect(auth.authenticate('super-secret:owner')).toBeNull();
    expect(auth.authenticate(null)).toBeNull();
  });

  it('enforces role hierarchy', () => {
    const auth = new AdminAuth('k');
    const viewer = auth.authenticate('Bearer k:viewer')!;
    const operator = auth.authenticate('Bearer k:operator')!;
    expect(auth.hasRole(viewer, 'operator')).toBe(false);
    expect(auth.hasRole(operator, 'operator')).toBe(true);
    expect(auth.hasRole(operator, 'owner')).toBe(false);
  });

  it('is disabled when no token is configured', () => {
    const auth = new AdminAuth('');
    expect(auth.enabled).toBe(false);
    expect(auth.authenticate('Bearer anything:owner')).toBeNull();
  });
});

describe('RateLimiter', () => {
  it('allows requests under the per-user limit', () => {
    let now = 0;
    const limiter = new RateLimiter({ perUserPerMinute: 2, globalPerMinute: 100, now: () => now });
    expect(limiter.check('u1').allowed).toBe(true);
    expect(limiter.check('u1').allowed).toBe(true);
    const third = limiter.check('u1');
    expect(third.allowed).toBe(false);
    expect(third.reason).toBe('user');
  });

  it('reports global limits independently of the user key', () => {
    let now = 0;
    const limiter = new RateLimiter({ perUserPerMinute: 100, globalPerMinute: 2, now: () => now });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    const third = limiter.check('c');
    expect(third.allowed).toBe(false);
    expect(third.reason).toBe('global');
  });

  it('resets windows after a minute', () => {
    let now = 0;
    const limiter = new RateLimiter({ perUserPerMinute: 1, globalPerMinute: 100, now: () => now });
    limiter.check('u1');
    expect(limiter.check('u1').allowed).toBe(false);
    now = 61_000;
    expect(limiter.check('u1').allowed).toBe(true);
  });
});

describe('validate', () => {
  it('sanitizes control characters and caps length', () => {
    const result = sanitizeMessageText('ol\u0000\u0001á tudo?  ', 10);
    expect(result.content).toBe('olá tudo?');
    const long = sanitizeMessageText('a'.repeat(100), 10);
    expect(long.content).toHaveLength(10);
    expect(long.reasons).toContain('truncated');
  });

  it('rejects empty and whitespace-only messages', () => {
    expect(sanitizeMessageText('').valid).toBe(false);
    expect(sanitizeMessageText('   ').valid).toBe(false);
    expect(sanitizeMessageText(undefined).valid).toBe(false);
  });

  it('validates media type and size', () => {
    expect(validateMedia({ type: 'image', sizeBytes: 1000, mimeType: 'image/jpeg' }).valid).toBe(true);
    const badType = validateMedia({ type: 'exe', sizeBytes: 1000 });
    expect(badType.valid).toBe(false);
    const huge = validateMedia({ type: 'image', sizeBytes: 50_000_000 });
    expect(huge.valid).toBe(false);
    const empty = validateMedia({ type: 'audio', sizeBytes: 0 });
    expect(empty.valid).toBe(false);
  });

  it('validates phone numbers', () => {
    expect(isValidPhoneNumber('+5511999999999')).toBe(true);
    expect(isValidPhoneNumber('11999999999')).toBe(true);
    expect(isValidPhoneNumber('abc')).toBe(false);
  });
});

describe('ForgetMeService', () => {
  it('cascade-deletes a user and reports counts', async () => {
    const { createDataService } = await import('./helpers.js');
    const data = createDataService();
    await data.users.create({
      id: 'u1',
      phoneNumber: '+5511999999999',
      displayName: 'Ana',
      timezone: 'UTC',
      locale: 'pt-BR',
      optInStatus: 'opted_in',
    });
    const conversation = await data.conversations.create({ userId: 'u1' });
    await data.messages.create({ conversationId: conversation.id, sender: 'user', content: 'oi' });
    await data.memory.create({
      userId: 'u1',
      type: 'fact',
      content: 'gosta de café',
      importance: 0.8,
      confidence: 0.9,
      source: 'user_stated',
    });
    await data.reminders.create({ userId: 'u1', triggerAt: new Date().toISOString(), payload: {} });

    const service = new ForgetMeService(data);
    const report = await service.forget('u1');

    expect(report.conversations).toBe(1);
    expect(report.messages).toBe(1);
    expect(report.memories).toBe(1);
    expect(report.reminders).toBe(1);
    expect(await data.users.findByPhone('+5511999999999')).toBeUndefined();
    expect((await data.conversations.listByUser('u1')).length).toBe(0);
    expect((await data.memory.listByUser('u1')).length).toBe(0);
  });
});
