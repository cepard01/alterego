// Conversation memory — the last N raw messages plus the current topic stack
// for a conversation. In-memory store for tests and single-process dev (v1 §5).

export interface ConversationMemoryStore {
  getRecent(conversationId: string, limit: number): Promise<Array<{ role: 'user' | 'agent'; content: string; timestamp: string }>>;
  append(conversationId: string, message: { role: 'user' | 'agent'; content: string; timestamp: string }): Promise<void>;
  setTopicStack(conversationId: string, topics: string[]): Promise<void>;
  getTopicStack(conversationId: string): Promise<string[]>;
  clear(conversationId: string): Promise<void>;
}

export class InMemoryConversationMemory implements ConversationMemoryStore {
  private readonly recent = new Map<string, Array<{ role: 'user' | 'agent'; content: string; timestamp: string }>>();
  private readonly topics = new Map<string, string[]>();

  async getRecent(conversationId: string, limit: number): Promise<Array<{ role: 'user' | 'agent'; content: string; timestamp: string }>> {
    return (this.recent.get(conversationId) ?? []).slice(-limit);
  }

  async append(conversationId: string, message: { role: 'user' | 'agent'; content: string; timestamp: string }): Promise<void> {
    const list = this.recent.get(conversationId) ?? [];
    list.push(message);
    if (list.length > 500) list.splice(0, list.length - 500);
    this.recent.set(conversationId, list);
  }

  async setTopicStack(conversationId: string, topics: string[]): Promise<void> {
    this.topics.set(conversationId, topics);
  }

  async getTopicStack(conversationId: string): Promise<string[]> {
    return this.topics.get(conversationId) ?? [];
  }

  async clear(conversationId: string): Promise<void> {
    this.recent.delete(conversationId);
    this.topics.delete(conversationId);
  }
}
