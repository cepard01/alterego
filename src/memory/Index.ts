// Memory System — working, conversation and long-term memory with ranking,
// retrieval, confidence and contradiction detection (v1 §5, v3 §7).

export { MemoryManager } from './MemoryManager.js';
export type { MemoryManagerOptions, RememberInput } from './MemoryManager.js';
export { InMemoryConversationMemory } from './ConversationMemory.js';
export type { ConversationMemoryStore } from './ConversationMemory.js';
export { WorkingMemory } from './WorkingMemory.js';
export type { WorkingMemoryEntry } from './WorkingMemory.js';
export { detectContradiction } from './Contradiction.js';
export type { ContradictionResult } from './Contradiction.js';

