import { describe, expect, it } from 'vitest';
import { ConfigService } from '@alterego/config';
import { InMemoryEventBus } from '@alterego/events';
import { DataService } from '@alterego/data';
import { ConversationManager, ConversationPipeline, ContextBuilder, PromptBuilder } from '../src/conversation/Index.js';
import { ConversationStateManager } from '../src/conversation/Index.js';
import type { SimulatedAction } from '@alterego/human-simulation';

const action: SimulatedAction = {
  type: 'reply',
  timing: { readDelayMs: 1000, typingStartDelayMs: 500, typingDurationMs: 2000, sendDelayMs: 300, totalDelayMs: 3800 },
  confidence: 0.8,
  reasoning: [{ category: 'thought', content: 'Bom, é um assunto importante.', confidence: 0.9, relatedMemoryIds: [] }],
  params: {},
};

function makeData() {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test' },
    quiet: true,
  });
  const data = new DataService(config, undefined, { memoryMode: true });
  return { bus, data };
}

describe('ConversationManager', () => {
  it('opens a session and publishes ConversationStarted on first message', async () => {
    const { bus, data } = makeData();
    const started: unknown[] = [];
    bus.subscribe('ConversationStarted', (e) => { started.push(e.payload); });
    const manager = new ConversationManager(bus, {
      conversations: data.conversations,
      sessions: data.sessions,
      messages: data.messages,
    }, new ConversationStateManager());

    const turn = await manager.handleUserMessage({
      conversationId: 'conv-1',
      messageId: 'm-1',
      userId: 'user-1',
      content: 'Oi! Que tal um filme hoje?',
      timestamp: new Date().toISOString(),
      hasMedia: false,
      mediaIds: [],
    });

    expect(turn.sessionId).toBeTruthy();
    expect(started).toHaveLength(1);
    expect((started[0] as { userId: string }).userId).toBe('user-1');
    expect(turn.conversation.turnCount).toBe(1);
    const messages = await data.messages.listByConversation(turn.conversation.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].sender).toBe('user');
  });

  it('does not open a second session on a follow-up message', async () => {
    const { bus, data } = makeData();
    const started: unknown[] = [];
    bus.subscribe('ConversationStarted', (e) => { started.push(e.payload); });
    const manager = new ConversationManager(bus, {
      conversations: data.conversations,
      sessions: data.sessions,
      messages: data.messages,
    }, new ConversationStateManager());

    const payload = {
      conversationId: 'conv-1',
      messageId: 'm-1',
      userId: 'user-1',
      content: 'Oi!',
      timestamp: new Date().toISOString(),
      hasMedia: false,
      mediaIds: [] as string[],
    };
    await manager.handleUserMessage(payload);
    await manager.handleUserMessage({ ...payload, messageId: 'm-2', content: 'Continua?' });
    expect(started).toHaveLength(1);
  });

  it('closes the session and resets state on ConversationEnded', async () => {
    const { bus, data } = makeData();
    const state = new ConversationStateManager();
    const manager = new ConversationManager(bus, {
      conversations: data.conversations,
      sessions: data.sessions,
      messages: data.messages,
    }, state);

    const payload = {
      conversationId: 'conv-1',
      messageId: 'm-1',
      userId: 'user-1',
      content: 'E aí?',
      timestamp: new Date().toISOString(),
      hasMedia: false,
      mediaIds: [] as string[],
    };
    const turn = await manager.handleUserMessage(payload);
    bus.publish('ConversationEnded', { conversationId: turn.conversation.id, userId: 'user-1', reason: 'inactivity' });
    await new Promise((resolve) => setTimeout(resolve, 5)); // let the async handler finish

    const session = await data.sessions.findOpenByConversation(turn.conversation.id);
    expect(session?.closedAt).not.toBeNull();
    const conversation = await data.conversations.findById(turn.conversation.id);
    expect(conversation?.status).toBe('idle');
    expect(state.currentTopic(turn.conversation.id)).toBeUndefined();
  });
});

describe('ConversationStateManager', () => {
  it('tracks topics, last speaker and open questions', () => {
    const state = new ConversationStateManager();
    state.noteUserMessage('c1', 'Preciso decidir sobre a viagem para Gramado');
    expect(state.currentTopic('c1')).toBe('gramado');
    state.noteAgentReply('c1');
    expect(state.lastSpeaker('c1')).toBe('agent');
    state.pushOpenQuestion('c1', 'O que você acha?');
    expect(state.listOpenQuestions('c1')).toEqual(['O que você acha?']);
    state.clearOpenQuestions('c1');
    expect(state.listOpenQuestions('c1')).toHaveLength(0);
  });

  it('caps the topic stack', () => {
    const state = new ConversationStateManager();
    for (let i = 0; i < 12; i++) state.pushTopic('c1', `topic-${i}`);
    expect(state.recentTopics('c1')).toHaveLength(8);
    expect(state.recentTopics('c1')[0]).toBe('topic-4');
  });
});

describe('ContextBuilder', () => {
  it('assembles sections in priority order and respects the token budget', () => {
    const builder = new ContextBuilder();
    const bundle = builder.build({
      identity: {
        name: 'Mariana', age: 29, occupation: 'designer', hometown: 'Porto Alegre',
        backgroundSummary: 'Vive sozinha com um gato.', education: ['Design'], interests: ['fotografia'],
        values: ['lealdade'], skills: ['desenho'], familySummary: '', version: 1,
      },
      personality: { name: 'mariana', version: 1, tone: 'casual', humorStyle: 'dry', verbosity: 0.5, emojiFrequency: 0.3, energyBaseline: 0.5, responseLengthBias: 'balanced', decisionTone: 'direct', quirks: [] },
      recentMessages: [{ sender: 'user', content: 'Oi', timestamp: 'x' }],
      memories: [{ content: 'O gato se chama Biscoito.', importance: 0.8, type: 'fact', createdAt: 'x' }],
      currentMessage: 'Vamos no cinema?',
      maxTokens: 1000,
    });
    expect(bundle.sections[0].name).toBe('identidade');
    expect(bundle.sections[bundle.sections.length - 1].name).toBe('mensagem atual');
    expect(bundle.totalTokens).toBeLessThanOrEqual(1000);
    expect(bundle.fullText).toContain('Biscoito');
  });
});

describe('PromptBuilder', () => {
  it('injects behavior rules derived from the simulated action', () => {
    const builder = new PromptBuilder();
    const rules = builder.behaviorRulesFromAction({ ...action, type: 'appear_distracted' });
    expect(rules[0]).toContain('mais curta');
  });

  it('never leaks private reasoning into the prompt', () => {
    const builder = new PromptBuilder();
    const payload = builder.build({
      personalityName: 'Mariana',
      context: { sections: [], totalTokens: 0, fullText: '[mensagem atual] Vamos no cinema?' },
      action,
    });
    expect(payload.prompt).not.toContain('assunto importante');
    expect(payload.system).toContain('nunca devem ser mencionados');
  });
});

describe('ConversationPipeline', () => {
  it('runs context -> prompt -> llm and returns the text for a reply action', async () => {
    const prompts: Array<{ system: string; prompt: string }> = [];
    const pipeline = new ConversationPipeline({
      state: new ConversationStateManager(),
      contextBuilder: new ContextBuilder(),
      promptBuilder: new PromptBuilder(),
      onPrompt: (p) => prompts.push(p),
      llm: {
        complete: async (request) => ({
          text: 'Bora! Que horas?',
          usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110 },
          provider: 'fake',
          model: 'fake-model',
          latencyMs: 42,
        }),
      },
    });

    const result = await pipeline.run({
      personalityName: 'Mariana',
      action,
      recentMessages: [{ sender: 'user', content: 'Vamos no cinema?', timestamp: 'x' }],
      memories: [],
      currentMessage: 'Vamos no cinema?',
    });

    expect(result.usedLlm).toBe(true);
    expect(result.text).toBe('Bora! Que horas?');
    expect(prompts).toHaveLength(1);
    expect(prompts[0].system).toContain('Mariana');
  });

  it('skips the LLM for non-text actions', async () => {
    const pipeline = new ConversationPipeline({
      state: new ConversationStateManager(),
      contextBuilder: new ContextBuilder(),
      promptBuilder: new PromptBuilder(),
      llm: {
        complete: async () => {
          throw new Error('should not be called');
        },
      },
    });

    const result = await pipeline.run({
      personalityName: 'Mariana',
      action: { ...action, type: 'sticker', params: { stickerId: 'st-1' } },
      recentMessages: [],
      memories: [],
      currentMessage: 'Oi',
    });

    expect(result.usedLlm).toBe(false);
    expect(result.text).toBeNull();
  });
});

