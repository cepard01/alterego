// Conversation Manager, Context Builder, Prompt Builder — the integration
// hub (v1 §6, §10; v2 §1).

export { ConversationManager } from './ConversationManager.js';
export type { ConversationDataPort, TurnContext } from './ConversationManager.js';
export { ConversationStateManager } from './StateManager.js';
export { ContextBuilder } from './ContextBuilder.js';
export type { BehaviorContext, ContextBundle, ContextInput, ContextSection, RelationshipContext } from './ContextBuilder.js';
export { PromptBuilder } from './PromptBuilder.js';
export type { PromptInput, PromptPayload } from './PromptBuilder.js';
export { ConversationPipeline } from './Pipeline.js';
export type { PipelineDeps, PipelineResult } from './Pipeline.js';

