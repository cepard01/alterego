// ConversationPipeline — the integration hub (v1 §6/§10 + v2 §1):
// turn-taking -> human-simulation decide -> context building -> prompt
// building -> LLM. The v1 Behavior Engine now consumes the SimulatedAction
// as its primary input instead of deciding independently.

import type { SimulatedAction } from '@alterego/human-simulation';
import type { LLMRequest, LLMResponse } from '@alterego/llm';
import type { ContextBuilder, ContextInput } from './context-builder.js';
import type { PromptBuilder, PromptInput } from './prompt-builder.js';
import type { ConversationStateManager } from './state-manager.js';

export interface PipelineResult {
  action: SimulatedAction;
  /** Text response to send — only when the action calls for one. */
  text: string | null;
  /** True when the pipeline consumed an LLM call for this turn. */
  usedLlm: boolean;
  behaviorRules: string[];
}

export interface PipelineDeps {
  state: ConversationStateManager;
  contextBuilder: ContextBuilder;
  promptBuilder: PromptBuilder;
  llm: {
    complete(request: LLMRequest): Promise<LLMResponse>;
  };
  /** Called with the built prompt before the LLM call; used by tests/observability. */
  onPrompt?: (prompt: { system: string; prompt: string }) => void;
}

const NON_TEXT_ACTIONS = new Set(['ignore', 'go_idle', 'appear_offline', 'sticker', 'emoji_reaction']);

export class ConversationPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  /** Whether this action requires an LLM-generated text response. */
  needsText(action: SimulatedAction): boolean {
    return !NON_TEXT_ACTIONS.has(action.type);
  }

  async run(input: ContextInput & { personalityName: string; action: SimulatedAction; maxResponseChars?: number; dynamic?: string[] }): Promise<PipelineResult> {
    const { action, personalityName, maxResponseChars, dynamic, ...contextInput } = input;
    const context = this.deps.contextBuilder.build(contextInput);

    const prompt = this.deps.promptBuilder.build({
      personalityName,
      context,
      action,
      dynamic,
      maxResponseChars,
    });
    this.deps.onPrompt?.({ system: prompt.system, prompt: prompt.prompt });

    if (!this.needsText(action)) {
      return { action, text: null, usedLlm: false, behaviorRules: prompt.behaviorRules };
    }

    const response = await this.deps.llm.complete({
      systemPrompt: prompt.system,
      messages: [{ role: 'user', content: prompt.prompt }],
      capabilityRequirements: ['text'],
    });

    return {
      action,
      text: response.text,
      usedLlm: true,
      behaviorRules: prompt.behaviorRules,
    };
  }
}
