// Conversation Manager, Context Builder, Prompt Builder — the integration
// hub (v1 §6, §10; v2 §1).

export { ConversationManager } from './conversation-manager.js';
export type { ConversationDataPort, TurnContext } from './conversation-manager.js';
export { ConversationStateManager } from './state-manager.js';
export { ContextBuilder } from './context-builder.js';
export type { BehaviorContext, ContextBundle, ContextInput, ContextSection, RelationshipContext } from './context-builder.js';
export { PromptBuilder } from './prompt-builder.js';
export type { PromptInput, PromptPayload } from './prompt-builder.js';
export { ConversationPipeline } from './pipeline.js';
export type { PipelineDeps, PipelineResult } from './pipeline.js';
