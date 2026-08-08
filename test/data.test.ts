import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '@whatsapp-ai-agent/events';
import { ConfigService } from '@whatsapp-ai-agent/config';
import { DataService, MemoryDb, rankMemory } from '../src/data/index.js';
import { runMigrations } from '../src/data/migrate.js';

function makeData(): { data: DataService; db: MemoryDb } {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
    quiet: true,
  });
  const data = new DataService(config, undefined, { memoryMode: true });
  return { data, db: data.db as MemoryDb };
}

describe('DataService repositories (in-memory Db)', () => {
  it('creates and retrieves a user', async () => {
    const { data } = makeData();
    const user = await data.users.create({
      id: 'u1',
      phoneNumber: '+5511999999999',
      displayName: 'Ana',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      optInStatus: 'opted_in',
    });
    expect(user.id).toBe('u1');
    const found = await data.users.findByPhone('+5511999999999');
    expect(found?.displayName).toBe('Ana');
  });

  it('creates a conversation and messages, oldest-first ordering', async () => {
    const { data } = makeData();
    await data.users.create({
      id: 'u1', phoneNumber: '+55', displayName: 'Ana', timezone: 'UTC', locale: 'en', optInStatus: 'opted_in',
    });
    const conversation = await data.conversations.create({ userId: 'u1' });
    await data.messages.create({
      conversationId: conversation.id, sender: 'user', content: 'first',
      timestamp: '2026-08-08T10:00:00.000Z',
    });
    await data.messages.create({
      conversationId: conversation.id, sender: 'agent', content: 'second',
      timestamp: '2026-08-08T10:00:01.000Z',
    });
    const messages = await data.messages.listByConversation(conversation.id);
    expect(messages.map((m) => m.content)).toEqual(['first', 'second']);
    expect(await data.messages.countByConversation(conversation.id)).toBe(2);
  });

  it('stores and retrieves memories with confidence fields', async () => {
    const { data } = makeData();
    await data.users.create({
      id: 'u1', phoneNumber: '+55', displayName: 'Ana', timezone: 'UTC', locale: 'en', optInStatus: 'opted_in',
    });
    await data.memory.create({
      userId: 'u1',
      type: 'fact',
      content: 'Ana works night shifts',
      importance: 0.8,
      confidence: 0.9,
      source: 'user_stated',
      verificationStatus: 'unverified',
    });
    const memories = await data.memory.listByUser('u1');
    expect(memories).toHaveLength(1);
    expect(memories[0].content).toBe('Ana works night shifts');
    expect(memories[0].confidence).toBe(0.9);

    const ranked = await data.memory.searchByUser('u1');
    expect(ranked).toHaveLength(1);
    expect(ranked[0].rankScore).toBeGreaterThan(0);
  });

  it('ranks memories with the v1 §5 formula', () => {
    const high = rankMemory({ similarity: 0.9, importance: 0.9, recencyDecay: 0.9 });
    const low = rankMemory({ similarity: 0.1, importance: 0.1, recencyDecay: 0.1 });
    expect(high).toBeGreaterThan(low);
  });

  it('sweeps expired memories', async () => {
    const { data } = makeData();
    await data.users.create({
      id: 'u1', phoneNumber: '+55', displayName: 'Ana', timezone: 'UTC', locale: 'en', optInStatus: 'opted_in',
    });
    await data.memory.create({
      userId: 'u1',
      type: 'summary',
      content: 'old summary',
      importance: 0.2,
      confidence: 0.5,
      source: 'agent_generated',
      verificationStatus: 'unverified',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await data.memory.create({
      userId: 'u1',
      type: 'fact',
      content: 'stays',
      importance: 0.8,
      confidence: 0.9,
      source: 'user_stated',
      verificationStatus: 'unverified',
    });
    const deleted = await data.memory.deleteExpired();
    expect(deleted).toBe(1);
    expect(await data.memory.listByUser('u1')).toHaveLength(1);
  });

  it('manages reminders and task queue lifecycle', async () => {
    const { data } = makeData();
    await data.users.create({
      id: 'u1', phoneNumber: '+55', displayName: 'Ana', timezone: 'UTC', locale: 'en', optInStatus: 'opted_in',
    });
    const reminder = await data.reminders.create({
      userId: 'u1',
      triggerAt: new Date(Date.now() - 1000).toISOString(),
      payload: { messageId: 'm1' },
    });
    const due = await data.reminders.findDue(new Date().toISOString());
    expect(due).toHaveLength(1);
    await data.reminders.setStatus(reminder.id, 'fired');

    const task = await data.taskQueue.enqueue({ type: 'delayed_response', payload: { messageId: 'm1' } });
    const claimed = await data.taskQueue.claimDue(new Date().toISOString());
    expect(claimed).toHaveLength(1);
    expect(claimed[0].id).toBe(task.id);
    await data.taskQueue.complete(task.id);
  });

  it('persists psychology state and world state', async () => {
    const { data } = makeData();
    await data.users.create({
      id: 'u1', phoneNumber: '+55', displayName: 'Ana', timezone: 'UTC', locale: 'en', optInStatus: 'opted_in',
    });
    await data.psychology.upsert({
      userId: 'u1', curiosity: 0.7, trust: 0.4, patience: 0.5, interest: 0.6, socialEnergy: 0.5,
      empathy: 0.6, confidence: 0.5, stress: 0.2, comfort: 0.5, conversationFatigue: 0,
    });
    const state = await data.psychology.find('u1');
    expect(state?.curiosity).toBe(0.7);
    await data.psychology.updateVariables('u1', { trust: 0.9 });
    expect((await data.psychology.find('u1'))?.trust).toBe(0.9);

    await data.worldState.upsert({
      agentId: 'agent-1', activity: 'working', locationContext: 'home', availability: 0.6,
      energyLevel: 0.7, stressLevel: 0.3, focusLevel: 0.5, deviceBattery: 80,
      sleepState: 'awake', currentActivityDetail: 'listening to music',
    });
    const world = await data.worldState.findByAgent('agent-1');
    expect(world?.activity).toBe('working');
  });

  it('creates identity profile, timeline events and goals', async () => {
    const { data } = makeData();
    await data.identityProfiles.upsert({
      agentId: 'agent-1',
      name: 'Marina',
      age: 27,
      backgroundSummary: 'graphic designer',
      education: ['Design'],
      occupation: 'designer',
      hometown: 'Lisbon',
      interests: ['bass', 'motorcycles'],
      values: ['honesty'],
      beliefs: [],
      skills: ['illustration'],
      familySummary: 'has a younger sister',
    });
    const profile = await data.identityProfiles.findByAgent('agent-1');
    expect(profile?.name).toBe('Marina');
    expect(profile?.interests).toContain('bass');

    await data.timelineEvents.create({
      agentId: 'agent-1',
      eventType: 'trip',
      title: 'Patagonia',
      description: 'March trip',
      occurredAt: '2026-03-01T00:00:00.000Z',
      relatedIdentityFields: ['interests'],
      relatedMemoryIds: [],
      importanceScore: 0.8,
    });
    const events = await data.timelineEvents.listSince('agent-1', '2020-01-01T00:00:00.000Z');
    expect(events).toHaveLength(1);

    const goal = await data.goals.create({
      agentId: 'agent-1',
      category: 'purchase',
      title: 'Save for a motorcycle',
      description: '',
    });
    await data.goals.updateProgress(goal.id, 0.5);
    expect((await data.goals.findById(goal.id))?.progress).toBe(0.5);
    await data.goals.resolve(goal.id, 'achieved', { inventoryItemId: 'inv-1' });
    expect((await data.goals.findById(goal.id))?.status).toBe('achieved');
  });

  it('creates recovery plans and evolution proposals', async () => {
    const { data } = makeData();
    await data.users.create({
      id: 'u1', phoneNumber: '+55', displayName: 'Ana', timezone: 'UTC', locale: 'en', optInStatus: 'opted_in',
    });
    const conversation = await data.conversations.create({ userId: 'u1' });
    const plan = await data.recoveryPlans.create({
      conversationId: conversation.id,
      gapDurationMs: 86_400_000,
      freshnessScore: 0.7,
      strategy: 'respond_with_summary_awareness',
      reconstructedContextType: 'summary',
      scheduledResponseAt: null,
    });
    const pending = await data.recoveryPlans.findPending();
    expect(pending).toHaveLength(1);
    await data.recoveryPlans.setStatus(plan.id, 'executed');

    const proposal = await data.identityEvolutionProposals.create({
      agentId: 'agent-1',
      fieldChanged: 'interests',
      oldValue: '["bass"]',
      newValue: '["bass","climbing"]',
      supportingEvidence: ['thought-1'],
      confidence: 0.8,
    });
    await data.identityEvolutionProposals.setStatus(proposal.id, 'auto_committed');
    const committed = await data.identityEvolutionProposals.listByStatus('auto_committed');
    expect(committed).toHaveLength(1);
  });
});

describe('runMigrations', () => {
  it('lists migration files without applying to a real db (structure check)', async () => {
    const db = new MemoryDb();
    // MemoryDb executes migration SQL as no-ops; this just verifies the runner
    // scans the directory and the files parse.
    const records = await runMigrations(db, '../../infra/db/migrations');
    expect(records.length).toBeGreaterThanOrEqual(3);
  });
});
