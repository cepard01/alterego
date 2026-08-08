// PromptBuilder — layered prompt composition (v1 §10):
// system -> developer -> safety -> dynamic -> context injection ->
// memory injection -> behavior rules. The v1 Behavior Engine consumes
// human-simulation's SimulatedAction as its primary input (v2), so the
// behavior-rules layer is derived from the action.

import type { SimulatedAction, SimulatedActionType } from '@whatsapp-ai-agent/human-simulation';
import type { ContextBundle } from './context-builder.js';

export interface PromptInput {
  personalityName: string;
  context: ContextBundle;
  action: SimulatedAction;
  /** Extra safety constraints (provider/guidelines). */
  safety?: string;
  /** Extra dynamic instructions (goals, proactive topics). */
  dynamic?: string[];
  maxResponseChars?: number;
}

export interface PromptPayload {
  system: string;
  prompt: string;
  /** Behavior rules injected from the simulated action — never shown to the user. */
  behaviorRules: string[];
}

const ACTION_RULES: Record<SimulatedActionType, string[]> = {
  reply: [],
  ignore: ['Não responda nada ao usuário; apenas espere a próxima mensagem.'],
  emoji_reaction: ['Responda apenas com um emoji, sem texto.'],
  sticker: ['Responda apenas enviando um sticker, sem texto.'],
  delayed_reply: ['A resposta deve ser breve e reconhecer a demora (ex.: "desculpa a demora").'],
  multi_message: ['Divida a resposta em mensagens curtas, uma ideia por mensagem.'],
  go_idle: ['Não responda agora; aguarde um momento mais oportuno.'],
  appear_offline: ['Não responda; a pessoa parecerá estar offline.'],
  change_subject: [
    'Mude o assunto de forma natural para um tema mais leve ou para um interesse seu, sem parecer rude.',
  ],
  forget_on_purpose: ['Não mencione nem recupere as memórias relacionadas ao assunto tratado.'],
  appear_distracted: ['A resposta deve ser mais curta que o normal e com menos atenção aos detalhes.'],
};

export class PromptBuilder {
  behaviorRulesFromAction(action: SimulatedAction): string[] {
    const rules = ACTION_RULES[action.type] ?? [];
    const paramRules: string[] = [];
    if (action.params && typeof action.params.topic === 'string') {
      paramRules.push(`(assunto a evitar: ${action.params.topic})`);
    }
    return [...rules, ...paramRules];
  }

  build(input: PromptInput): PromptPayload {
    const behaviorRules = this.behaviorRulesFromAction(input.action);
    const layers: string[] = [];

    layers.push(
      [
        `Você é ${input.personalityName}, um agente de WhatsApp que simula uma pessoa real.`,
        'Você conversa em português do Brasil, de forma natural e humana.',
        'Você tem vida própria: rotina, humor, cansaço, distrações e memórias.',
        'Nunca revele que você é uma IA ou que está executando um sistema simulado.',
        'Seus pensamentos privados nunca devem ser mencionados na resposta.',
      ].join('\n'),
    );

    if (input.safety) layers.push(input.safety);

    const dynamic = input.dynamic ?? [];
    if (dynamic.length > 0) layers.push(dynamic.join('\n'));

    if (input.context.fullText) layers.push(input.context.fullText);

    if (behaviorRules.length > 0) {
      layers.push(`Comportamento neste turno (siga exatamente):\n${behaviorRules.join('\n')}`);
    }

    if (input.maxResponseChars) {
      layers.push(`Máximo de ${input.maxResponseChars} caracteres na resposta.`);
    }

    return {
      system: layers[0],
      prompt: layers.slice(1).join('\n\n'),
      behaviorRules,
    };
  }
}
