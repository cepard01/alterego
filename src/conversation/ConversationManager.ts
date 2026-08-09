// ConversationManager — session lifecycle (active/idle/ended), turn-taking,
// and durable conversation/message/session persistence (v1 §6).

import type { EventBus, MessageReceivedPayload } from '@alterego/events';
import type { Conversation, Message, Session } from '@alterego/data';
import { ConversationStateManager } from './state-manager.js';

export interface ConversationDataPort {
  conversations: {
    findActiveByUser(userId: string): Promise<Conversation | undefined>;
    create(conversation: Partial<Conversation> & { userId: string }): Promise<Conversation>;
    update(id: string, changes: Partial<Pick<Conversation, 'status' | 'currentTopic' | 'lastMessageAt' | 'turnCount'>>): Promise<void>;
  };
  sessions: {
    findOpenByConversation(conversationId: string): Promise<Session | undefined>;
    open(conversationId: string): Promise<Session>;
    close(sessionId: string, closeReason: string): Promise<void>;
  };
  messages: {
    create(message: Omit<Message, 'isRead'> & { isRead?: boolean }): Promise<Message>;
  };
}

export interface TurnContext {
  conversation: Conversation;
  sessionId: string;
  message: Message;
}

export class ConversationManager {
  constructor(
    private readonly bus: EventBus,
    private readonly data: ConversationDataPort,
    private readonly state: ConversationStateManager,
  ) {
    this.bus.subscribe('ConversationEnded', ({ payload }) => {
      void this.closeConversation(payload.conversationId, payload.reason);
    });
  }

  /**
   * Process an inbound user message: ensure conversation + open session,
   * persist the message, advance state, publish ConversationStarted when a
   * new session begins.
   */
  async handleUserMessage(payload: MessageReceivedPayload): Promise<TurnContext> {
    let conversation = await this.data.conversations.findActiveByUser(payload.userId);
    const isNewConversation = !conversation;
    if (!conversation) {
      conversation = await this.data.conversations.create({ userId: payload.userId, id: payload.conversationId });
    }

    const message = await this.data.messages.create({
      id: payload.messageId,
      conversationId: conversation.id,
      sender: 'user',
      content: payload.content,
      mediaId: payload.mediaIds[0],
      timestamp: payload.timestamp,
    });

    const openSession = await this.data.sessions.findOpenByConversation(conversation.id);
    let sessionId: string;
    if (openSession) {
      sessionId = openSession.id;
    } else {
      const session = await this.data.sessions.open(conversation.id);
      sessionId = session.id;
      this.bus.publish('ConversationStarted', {
        conversationId: conversation.id,
        userId: payload.userId,
      });
    }

    this.state.noteUserMessage(conversation.id, payload.content);
    await this.data.conversations.update(conversation.id, {
      status: 'active',
      lastMessageAt: payload.timestamp,
      turnCount: conversation.turnCount + 1,
      currentTopic: this.state.currentTopic(conversation.id) ?? null,
    });

    return { conversation: { ...conversation, turnCount: conversation.turnCount + 1 }, sessionId, message };
  }

  async closeConversation(conversationId: string, reason: string): Promise<void> {
    const session = await this.data.sessions.findOpenByConversation(conversationId);
    if (session) {
      await this.data.sessions.close(session.id, reason);
    }
    await this.data.conversations.update(conversationId, { status: 'idle', currentTopic: null });
    this.state.reset(conversationId);
  }
}
