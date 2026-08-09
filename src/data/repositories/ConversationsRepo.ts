// Repositories for conversation-related v1 entities: Conversation, Message,
// Session, Media.

import { Db } from '../db.types.js';
import { Conversation, Media, Message, Session } from '../types.js';
import { camelToSnake, countValue, newId, nowIso, firstRow } from './base.js';

export class ConversationRepository {
  constructor(private readonly db: Db) {}

  async create(conversation: Partial<Conversation> & { userId: string }): Promise<Conversation> {
    const row: Conversation = {
      id: conversation.id ?? newId(),
      userId: conversation.userId,
      status: conversation.status ?? 'active',
      startedAt: conversation.startedAt ?? nowIso(),
      lastMessageAt: conversation.lastMessageAt ?? nowIso(),
      currentTopic: conversation.currentTopic ?? null,
      turnCount: conversation.turnCount ?? 0,
    };
    await this.db.query(
      `INSERT INTO conversations (id, user_id, status, started_at, last_message_at, current_topic, turn_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [row.id, row.userId, row.status, row.startedAt, row.lastMessageAt, row.currentTopic, row.turnCount],
    );
    return row;
  }

  async findById(id: string): Promise<Conversation | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM conversations WHERE id = $1', [id])).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  /** The most recent conversation for a user, regardless of status. */
  async findLatestByUser(userId: string): Promise<Conversation | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query(
        'SELECT * FROM conversations WHERE user_id = $1 ORDER BY last_message_at DESC LIMIT 1',
        [userId],
      )).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  async findActiveByUser(userId: string): Promise<Conversation | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query(
        "SELECT * FROM conversations WHERE user_id = $1 AND status IN ('active', 'idle') ORDER BY last_message_at DESC LIMIT 1",
        [userId],
      )).rows,
    );
    return row ? this.mapRow(row) : undefined;
  }

  async update(id: string, changes: Partial<Pick<Conversation, 'status' | 'currentTopic' | 'lastMessageAt' | 'turnCount'>>): Promise<void> {
    const entries = Object.entries(changes);
    if (entries.length === 0) return;
    const sets = entries.map(([key], index) => `${camelToSnake(key)} = $${index + 1}`);
    await this.db.query(`UPDATE conversations SET ${sets.join(', ')} WHERE id = $${entries.length + 1}`, [
      ...entries.map(([, value]) => value),
      id,
    ]);
  }

  async countActive(): Promise<number> {
    return countValue(
      (await this.db.query("SELECT COUNT(*) AS count FROM conversations WHERE status = 'active'")).rows,
    );
  }

  /** All non-closed conversations, newest first — used by offline recovery on boot. */
  async listActive(limit = 100): Promise<Conversation[]> {
    const rows = (
      await this.db.query(
        "SELECT * FROM conversations WHERE status IN ('active', 'idle') ORDER BY last_message_at DESC LIMIT $1",
        [limit],
      )
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async deleteById(id: string): Promise<void> {
    await this.db.query('DELETE FROM conversations WHERE id = $1', [id]);
  }

  async listByUser(userId: string, limit = 100): Promise<Conversation[]> {
    const rows = (
      await this.db.query('SELECT * FROM conversations WHERE user_id = $1 ORDER BY last_message_at DESC LIMIT $2', [
        userId,
        limit,
      ])
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  private mapRow(row: Record<string, unknown>): Conversation {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      status: row.status as Conversation['status'],
      startedAt: String(row.started_at),
      lastMessageAt: String(row.last_message_at),
      currentTopic: row.current_topic === null ? null : String(row.current_topic),
      turnCount: Number(row.turn_count),
    };
  }
}

export class MessageRepository {
  constructor(private readonly db: Db) {}

  async create(message: Omit<Message, 'isRead'> & { isRead?: boolean }): Promise<Message> {
    const row: Message = {
      id: message.id ?? newId(),
      conversationId: message.conversationId,
      sender: message.sender,
      content: message.content,
      mediaId: message.mediaId,
      timestamp: message.timestamp ?? nowIso(),
      isRead: message.isRead ?? false,
      replyToMessageId: message.replyToMessageId,
    };
    await this.db.query(
      `INSERT INTO messages (id, conversation_id, sender, content, media_id, timestamp, is_read, reply_to_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [row.id, row.conversationId, row.sender, row.content, row.mediaId ?? null, row.timestamp, row.isRead, row.replyToMessageId ?? null],
    );
    return row;
  }

  async findById(id: string): Promise<Message | undefined> {
    return firstRow<Message>(
      (await this.db.query('SELECT * FROM messages WHERE id = $1', [id])).rows,
    );
  }

  /** Last N messages in a conversation, oldest first. */
  async listByConversation(conversationId: string, limit = 50, offset = 0): Promise<Message[]> {
    const rows = (
      await this.db.query(
        'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3',
        [conversationId, limit, offset],
      )
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>)).reverse();
  }

  async countByConversation(conversationId: string): Promise<number> {
    return countValue(
      (await this.db.query('SELECT COUNT(*) AS count FROM messages WHERE conversation_id = $1', [conversationId])).rows,
    );
  }

  async markRead(conversationId: string, sender?: 'user' | 'agent'): Promise<void> {
    if (sender) {
      await this.db.query('UPDATE messages SET is_read = true WHERE conversation_id = $1 AND sender = $2', [
        conversationId,
        sender,
      ]);
    } else {
      await this.db.query('UPDATE messages SET is_read = true WHERE conversation_id = $1', [conversationId]);
    }
  }

  /** Unread user messages in a conversation (for offline recovery / cognitive load). */
  async unreadByConversation(conversationId: string): Promise<Message[]> {
    const rows = (
      await this.db.query(
        "SELECT * FROM messages WHERE conversation_id = $1 AND sender = 'user' AND is_read = false ORDER BY timestamp ASC",
        [conversationId],
      )
    ).rows;
    return rows.map((row) => this.mapRow(row as Record<string, unknown>));
  }

  async updateReadState(ids: string[], isRead: boolean): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map((_, index) => `$${index + 1}`);
    await this.db.query(
      `UPDATE messages SET is_read = ${isRead} WHERE id IN (${placeholders.join(', ')})`,
      ids,
    );
  }

  private mapRow(row: Record<string, unknown>): Message {
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      sender: row.sender as Message['sender'],
      content: String(row.content),
      mediaId: row.media_id === null || row.media_id === undefined ? undefined : String(row.media_id),
      timestamp: String(row.timestamp),
      isRead: Boolean(row.is_read),
      replyToMessageId:
        row.reply_to_message_id === null || row.reply_to_message_id === undefined ? undefined : String(row.reply_to_message_id),
    };
  }
}

export class SessionRepository {
  constructor(private readonly db: Db) {}

  async open(conversationId: string): Promise<Session> {
    const row: Session = {
      id: newId(),
      conversationId,
      openedAt: nowIso(),
      closedAt: null,
      closeReason: null,
    };
    await this.db.query('INSERT INTO sessions (id, conversation_id, opened_at) VALUES ($1, $2, $3)', [
      row.id,
      row.conversationId,
      row.openedAt,
    ]);
    return row;
  }

  async close(sessionId: string, closeReason: string): Promise<void> {
    await this.db.query('UPDATE sessions SET closed_at = $1, close_reason = $2 WHERE id = $3', [
      nowIso(),
      closeReason,
      sessionId,
    ]);
  }

  async findOpenByConversation(conversationId: string): Promise<Session | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query(
        'SELECT * FROM sessions WHERE conversation_id = $1 AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1',
        [conversationId],
      )).rows,
    );
    if (!row) return undefined;
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      openedAt: String(row.opened_at),
      closedAt: row.closed_at === null ? null : String(row.closed_at),
      closeReason: row.close_reason === null ? null : String(row.close_reason),
    };
  }
}

export class MediaRepository {
  constructor(private readonly db: Db) {}

  async create(media: Omit<Media, 'id'> & { id?: string }): Promise<Media> {
    const row: Media = { ...media, id: media.id ?? newId() };
    await this.db.query(
      `INSERT INTO media (id, message_id, type, storage_url, mime_type, caption, transcript, analysis_summary, duration_ms, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        row.id,
        row.messageId,
        row.type,
        row.storageUrl,
        row.mimeType,
        row.caption ?? null,
        row.transcript ?? null,
        row.analysisSummary ?? null,
        row.durationMs ?? null,
        row.sizeBytes,
      ],
    );
    return row;
  }

  async findById(id: string): Promise<Media | undefined> {
    const row = firstRow<Record<string, unknown>>(
      (await this.db.query('SELECT * FROM media WHERE id = $1', [id])).rows,
    );
    if (!row) return undefined;
    return {
      id: String(row.id),
      messageId: String(row.message_id),
      type: row.type as Media['type'],
      storageUrl: String(row.storage_url),
      mimeType: String(row.mime_type),
      caption: row.caption === null ? null : String(row.caption),
      transcript: row.transcript === null ? null : String(row.transcript),
      analysisSummary: row.analysis_summary === null ? null : String(row.analysis_summary),
      durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms),
      sizeBytes: Number(row.size_bytes),
    };
  }

  async setAnalysis(id: string, analysisSummary: string, transcript?: string): Promise<void> {
    await this.db.query('UPDATE media SET analysis_summary = $1, transcript = $2 WHERE id = $3', [
      analysisSummary,
      transcript ?? null,
      id,
    ]);
  }
}
