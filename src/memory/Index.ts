// Memory System — working, conversation and long-term memory with ranking,
// retrieval, confidence and contradiction detection (v1 §5, v3 §7).

export { MemoryManager } from './memory-manager.js';
export type { MemoryManagerOptions, RememberInput } from './memory-manager.js';
export { InMemoryConversationMemory } from './conversation-memory.js';
export type { ConversationMemoryStore } from './conversation-memory.js';
export { WorkingMemory } from './working-memory.js';
export type { WorkingMemoryEntry } from './working-memory.js';
export { detectContradiction } from './contradiction.js';
export type { ContradictionResult } from './contradiction.js';
