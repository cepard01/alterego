// Data retention policy + 'forget me' cascading delete (v1 §17).
// Postgres schema uses ON DELETE CASCADE from users() for user-scoped tables;
// this service orchestrates the deletion and tracks what was purged.

import { DataService } from '@alterego/data';

export interface RetentionPolicy {
  /** Retention period per entity family, ms (null = keep forever). */
  rawMessagesMs: number | null;
  conversationSummariesMs: number | null;
  memoriesMs: number | null;
  mediaMs: number | null;
}

export interface ForgetMeReport {
  userId: string;
  deletedAt: string;
  conversations: number;
  messages: number;
  memories: number;
  reminders: number;
  thoughts: number;
}

export class ForgetMeService {
  constructor(private readonly data: DataService) {}

  /**
   * Cascade-delete everything stored about a user. Deletions are explicit
   * (redundant with the schema's ON DELETE CASCADE, but works on in-memory
   * test databases too), then the user row itself is removed.
   */
  async forget(userId: string): Promise<ForgetMeReport> {
    const conversations = await this.data.conversations.listByUser(userId);
    const memories = await this.data.memory.listByUser(userId);
    const reminders = await this.data.reminders.listByUser(userId).catch(() => []);
    const thoughts = await this.data.thoughts.listByUser(userId).catch(() => []);
    let messages = 0;
    for (const conversation of conversations) {
      messages += await this.data.messages.countByConversation(conversation.id);
      await this.data.conversations.deleteById(conversation.id);
    }
    await this.data.memory.deleteByUser(userId);
    await this.data.reminders.deleteByUser(userId).catch(() => undefined);
    await this.data.thoughts.deleteByUser(userId).catch(() => undefined);
    await this.data.users.deleteById(userId);

    return {
      userId,
      deletedAt: new Date().toISOString(),
      conversations: conversations.length,
      messages,
      memories: memories.length,
      reminders: reminders.length,
      thoughts: thoughts.length,
    };
  }
}
