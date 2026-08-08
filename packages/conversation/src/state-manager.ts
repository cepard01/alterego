// ConversationStateManager — ephemeral per-conversation state (v1 §6):
// topic stack, who-spoke-last, open questions. In-memory by design; the
// durable record lives in data's Conversation/Session entities.

const MAX_TOPIC_STACK = 8;

/** Common PT-pt filler/function words that never make good topics. */
const STOPWORDS = new Set([
  'preciso', 'quero', 'gostaria', 'poderia', 'sobre', 'sendo', 'coisa', 'agora', 'também', 'então',
  'porque', 'talvez', 'aquilo', 'aquele', 'aquela', 'alguma', 'algum', 'alguém', 'mesmo', 'todos', 'toda',
  'ainda', 'quando', 'como', 'depois', 'antes', 'nunca', 'sempre', 'muito', 'pouco', 'coisas',
  'decidir', 'precisava', 'aconteceu', 'acontecer', 'conversar', 'conversando',
]);

export class ConversationStateManager {
  private readonly topics = new Map<string, string[]>();
  private readonly whoSpokeLast = new Map<string, 'user' | 'agent'>();
  private readonly openQuestions = new Map<string, string[]>();

  /** Extract a coarse topic from free text — longest non-stopword content word. */
  private static extractTopic(content: string): string | undefined {
    const words = content
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOPWORDS.has(w));
    const longest = [...words].sort((a, b) => b.length - a.length)[0];
    return longest;
  }

  noteUserMessage(conversationId: string, content: string): void {
    const stack = this.topics.get(conversationId) ?? [];
    const topic = ConversationStateManager.extractTopic(content);
    if (topic) {
      stack.push(topic);
      if (stack.length > MAX_TOPIC_STACK) stack.shift();
      this.topics.set(conversationId, stack);
    }
    this.whoSpokeLast.set(conversationId, 'user');
  }

  noteAgentReply(conversationId: string): void {
    this.whoSpokeLast.set(conversationId, 'agent');
  }

  pushTopic(conversationId: string, topic: string): void {
    const stack = this.topics.get(conversationId) ?? [];
    stack.push(topic);
    if (stack.length > MAX_TOPIC_STACK) stack.shift();
    this.topics.set(conversationId, stack);
  }

  popTopic(conversationId: string): string | undefined {
    const stack = this.topics.get(conversationId);
    return stack?.pop();
  }

  currentTopic(conversationId: string): string | undefined {
    const stack = this.topics.get(conversationId);
    return stack?.[stack.length - 1];
  }

  recentTopics(conversationId: string, limit = MAX_TOPIC_STACK): string[] {
    const stack = this.topics.get(conversationId) ?? [];
    return stack.slice(-limit);
  }

  lastSpeaker(conversationId: string): 'user' | 'agent' | undefined {
    return this.whoSpokeLast.get(conversationId);
  }

  pushOpenQuestion(conversationId: string, question: string): void {
    const list = this.openQuestions.get(conversationId) ?? [];
    list.push(question);
    if (list.length > 5) list.shift();
    this.openQuestions.set(conversationId, list);
  }

  listOpenQuestions(conversationId: string): string[] {
    return this.openQuestions.get(conversationId) ?? [];
  }

  clearOpenQuestions(conversationId: string): void {
    this.openQuestions.delete(conversationId);
  }

  reset(conversationId: string): void {
    this.topics.delete(conversationId);
    this.whoSpokeLast.delete(conversationId);
    this.openQuestions.delete(conversationId);
  }
}
