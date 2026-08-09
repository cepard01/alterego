// BacklogAnalyzer — every conversation with unread messages accumulated
// during a downtime gap (v3 §8 step 2).

import type { Message } from '@alterego/data';

export interface ConversationBacklog {
  conversationId: string;
  userId: string;
  unread: Message[];
  lastMessageAt: string;
  lastActiveAt: string;
  /** User messages containing a question mark — likely unanswered questions. */
  unansweredQuestions: string[];
}

export interface BacklogInput {
  /** Last heartbeat/last-active timestamp before the downtime gap. */
  lastActiveAt: string;
  conversations: Array<{
    id: string;
    userId: string;
    lastMessageAt: string;
  }>;
  unreadMessages: Message[];
}

const QUESTION_REGEX = /[?？]/;

export class BacklogAnalyzer {
  analyze(input: BacklogInput): ConversationBacklog[] {
    const byConversation = new Map<string, Message[]>();
    for (const message of input.unreadMessages) {
      const list = byConversation.get(message.conversationId) ?? [];
      list.push(message);
      byConversation.set(message.conversationId, list);
    }

    const backlogs: ConversationBacklog[] = [];
    for (const conversation of input.conversations) {
      const unread = byConversation.get(conversation.id) ?? [];
      if (unread.length === 0) continue;
      const unansweredQuestions = unread
        .filter((m) => m.sender === 'user' && QUESTION_REGEX.test(m.content))
        .map((m) => m.content);
      backlogs.push({
        conversationId: conversation.id,
        userId: conversation.userId,
        unread: [...unread].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        lastMessageAt: conversation.lastMessageAt,
        lastActiveAt: input.lastActiveAt,
        unansweredQuestions,
      });
    }
    return backlogs;
  }
}
