// MemoryManager — facade over all memory layers: remember() / recall() /
// forget() plus contradiction detection (v1 §5, v3 §7).

import { Memory } from '@whatsapp-ai-agent/data';
import { EventBus } from '@whatsapp-ai-agent/events';
import { Logger } from '@whatsapp-ai-agent/observability';
import { ConversationMemoryStore, InMemoryConversationMemory } from './conversation-memory.js';
import { detectContradiction } from './contradiction.js';
import { WorkingMemory } from './working-memory.js';

export interface RememberInput {
  userId: string;
  type: Memory['type'];
  content: string;
  importance?: number;
  confidence?: number;
  source?: Memory['source'];
  sourceMessageId?: string;
  embeddingVector?: number[] | null;
}

export interface MemoryManagerOptions {
  bus: EventBus;
  data: {
    memory: {
      create(memory: Omit<Memory, 'id' | 'createdAt' | 'lastAccessedAt' | 'lastConfidenceDecayAt'> & { id?: string; createdAt?: string }): Promise<Memory>;
      searchByUser(userId: string, embedding?: number[], topK?: number): Promise<Array<Memory & { rankScore: number }>>;
      listByUser(userId: string, type?: Memory['type'], limit?: number): Promise<Memory[]>;
      markContradicted(memoryId: string): Promise<void>;
      touch(id: string): Promise<void>;
      findById(id: string): Promise<Memory | undefined>;
      deleteByUser(userId: string): Promise<number>;
      update(id: string, changes: Partial<Pick<Memory, 'importance' | 'confidence' | 'verificationStatus' | 'content' | 'embeddingVector' | 'expiresAt'>>): Promise<void>;
    };
  };
  logger?: Logger;
  conversationMemory?: ConversationMemoryStore;
  /** Set to false in deterministic tests. */
  checkContradictions?: boolean;
}

export class MemoryManager {
  private readonly bus: EventBus;
  private readonly data: MemoryManagerOptions['data'];
  private readonly logger?: Logger;
  private readonly conversationMemory: ConversationMemoryStore;
  private readonly checkContradictions: boolean;

  constructor(options: MemoryManagerOptions) {
    this.bus = options.bus;
    this.data = options.data;
    this.logger = options.logger;
    this.conversationMemory = options.conversationMemory ?? new InMemoryConversationMemory();
    this.checkContradictions = options.checkContradictions ?? true;
  }

  /** Per-turn scratch state; fresh instance per message being processed. */
  createWorkingMemory(): WorkingMemory {
    return new WorkingMemory();
  }

  getConversationMemory(): ConversationMemoryStore {
    return this.conversationMemory;
  }

  /** Write a memory: stores it, emits MemoryCreated, runs contradiction checks. */
  async remember(input: RememberInput): Promise<Memory> {
    const contradictions = this.checkContradictions
      ? detectContradiction(input.content, await this.data.memory.listByUser(input.userId, undefined, 200))
      : [];
    const memory = await this.data.memory.create({
      userId: input.userId,
      type: input.type,
      content: input.content,
      embeddingVector: input.embeddingVector ?? null,
      importance: input.importance ?? 0.5,
      confidence: input.confidence ?? 0.8,
      source: input.source ?? 'user_stated',
      verificationStatus: 'unverified',
      expiresAt: null,
      sourceMessageId: input.sourceMessageId,
    });
    this.bus.publish('MemoryCreated', {
      memoryId: memory.id,
      userId: input.userId,
      type: memory.type,
      importance: memory.importance,
    });
    if (contradictions.length > 0) {
      this.logger?.info('memory contradiction detected', {
        memoryId: memory.id,
        conflictsWith: contradictions.map((c) => c.memoryId),
      });
      for (const candidate of contradictions) {
        await this.data.memory.markContradicted(candidate.memoryId);
        this.bus.publish('MemoryContradiction', {
          contradictionId: `contradiction-${memory.id}-${candidate.memoryId}`,
          memoryIdA: memory.id,
          memoryIdB: candidate.memoryId,
          messageId: input.sourceMessageId,
          detectedAt: new Date().toISOString(),
        });
      }
    }
    return memory;
  }

  /**
   * Retrieve top-K memories ranked by the v1 §5 formula. When no embedding is
   * supplied (or embedding is unavailable), ranking falls back to importance
   * + recency.
   */
  async recall(userId: string, query?: string, embedding?: number[], topK = 8): Promise<Array<Memory & { rankScore: number }>> {
    const ranked = await this.data.memory.searchByUser(userId, embedding, topK);
    for (const memory of ranked) {
      await this.data.memory.touch(memory.id).catch(() => undefined);
    }
    return ranked;
  }

  /** Forget a single memory or all of a user's memories. */
  async forget(userId: string, memoryId?: string): Promise<void> {
    if (memoryId) {
      await this.data.memory.update(memoryId, { verificationStatus: 'contradicted' });
      this.bus.publish('MemoryExpired', { memoryId, userId, reason: 'superseded' });
      return;
    }
    await this.data.memory.deleteByUser(userId);
  }
}
