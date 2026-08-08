// Shared types for the Internal Thoughts layer (v2 §3, v3 §7).

import type { Thought } from '@whatsapp-ai-agent/data';

export interface TurnMessage {
  role: 'user' | 'agent';
  content: string;
  messageId?: string;
}

export interface TurnTranscriptInput {
  userId: string;
  conversationId: string;
  transcript: TurnMessage[];
  /** Recent topics from the conversation state, for repetition detection. */
  recentTopics?: string[];
}

export interface GeneratedThought {
  category: Thought['category'];
  content: string;
  confidence: number;
  relatedMemoryIds: string[];
  relatedMessageId?: string;
}

/** The structural slice of llm's LLMRouter this package needs. */
export interface LlmCompleter {
  complete(request: {
    userId: string;
    conversationId: string;
    capabilities?: string[];
    system: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
    format?: 'json';
  }): Promise<{ content: string }>;
}

export interface ThoughtGeneratorOptions {
  /** Probability of generating a thought after a turn (bounded baseline, default 0.6). */
  generationChance?: number;
  /** Provider capability required for the background reasoning call. */
  capability?: string;
}

export interface FalseMemoryOptions {
  /** Probability of planting one false memory per session (default 0.02). */
  chancePerSession?: number;
}
