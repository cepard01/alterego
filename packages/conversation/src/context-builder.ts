// ContextBuilder — assembles the token-budgeted context window (v1 §6).
// Section order (highest priority first): identity/rules -> personality ->
// relationship -> behavior/emotion -> summary -> recent messages ->
// retrieved memories -> time/metadata -> current message.

import type { IdentitySnapshot } from '@whatsapp-ai-agent/identity';
import type { PersonalitySnapshot } from '@whatsapp-ai-agent/personality';
import type { Memory, Thought, WorldState } from '@whatsapp-ai-agent/data';

export interface RelationshipContext {
  name: string;
  strength: number;
  familiarity: number;
  verbosity: number;
  energy: number;
}

export interface BehaviorContext {
  activity: string;
  availability: number;
  energyLevel: number;
  stressLevel: number;
  focusLevel: number;
  fatigue: number;
  cognitiveLoad: number;
}

export interface ContextSection {
  name: string;
  content: string;
  tokens: number;
}

export interface ContextInput {
  identity?: IdentitySnapshot;
  personality?: PersonalitySnapshot;
  relationship?: RelationshipContext;
  behavior?: BehaviorContext;
  conversationSummary?: string;
  recentMessages: Array<{ sender: 'user' | 'agent'; content: string; timestamp: string }>;
  memories: Array<Pick<Memory, 'content' | 'importance' | 'type' | 'createdAt'>>;
  privateThoughts?: Array<Pick<Thought, 'content' | 'category' | 'confidence'>>;
  time?: { now: string; dayOfWeek: string; timeOfDay: string };
  worldState?: WorldState;
  currentMessage: string;
  maxTokens?: number;
}

export interface ContextBundle {
  sections: ContextSection[];
  totalTokens: number;
  fullText: string;
}

const TOKENS_PER_CHAR = 0.25;

export class ContextBuilder {
  build(input: ContextInput): ContextBundle {
    const maxTokens = input.maxTokens ?? 4000;
    const sections: ContextSection[] = [];

    const add = (name: string, content: string): void => {
      const trimmed = content.trim();
      if (!trimmed) return;
      sections.push({ name, content: trimmed, tokens: Math.ceil(trimmed.length * TOKENS_PER_CHAR) });
    };

    if (input.identity) {
      const p = input.identity;
      const parts = [
        p.name ? `Nome: ${p.name}` : '',
        p.age !== undefined ? `Idade: ${p.age}` : '',
        p.occupation ? `Ocupação: ${p.occupation}` : '',
        p.hometown ? `Cidade natal: ${p.hometown}` : '',
        p.backgroundSummary ? `Histórico: ${p.backgroundSummary}` : '',
        p.interests && p.interests.length > 0 ? `Interesses: ${p.interests.join(', ')}` : '',
        p.values && p.values.length > 0 ? `Valores: ${p.values.join(', ')}` : '',
        p.skills && p.skills.length > 0 ? `Habilidades: ${p.skills.join(', ')}` : '',
        p.education && p.education.length > 0 ? `Formação: ${p.education.join(', ')}` : '',
      ];
      add('identidade', parts.filter(Boolean).join('\n'));
    }

    if (input.personality) {
      add(
        'personalidade',
        [
          input.personality.tone ? `Tom: ${input.personality.tone}` : '',
          input.personality.humorStyle ? `Humor: ${input.personality.humorStyle}` : '',
          input.personality.decisionTone ? `Estilo de decisão: ${input.personality.decisionTone}` : '',
          input.personality.responseLengthBias ? `Comprimento de resposta: ${input.personality.responseLengthBias}` : '',
          input.personality.quirks && input.personality.quirks.length > 0
            ? `Maneirismos: ${input.personality.quirks.join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }

    if (input.relationship) {
      add(
        'relacionamento',
        `Nível de confiança: ${Math.round(input.relationship.strength * 100)}/100; familiaridade: ${Math.round(input.relationship.familiarity * 100)}/100; verbosidade efetiva: ${Math.round(input.relationship.verbosity * 100)}/100`,
      );
    }

    if (input.behavior) {
      add(
        'estado',
        `Estado atual: ${input.behavior.activity}; disponibilidade ${Math.round(input.behavior.availability * 100)}%; energia ${Math.round(input.behavior.energyLevel * 100)}%; estresse ${Math.round(input.behavior.stressLevel * 100)}%; foco ${Math.round(input.behavior.focusLevel * 100)}%; cansaço ${Math.round(input.behavior.fatigue * 100)}%; carga cognitiva ${Math.round(input.behavior.cognitiveLoad * 100)}%`,
      );
    }

    if (input.conversationSummary) {
      add('resumo', `Resumo anterior: ${input.conversationSummary}`);
    }

    const recent = input.recentMessages.slice(-8);
    if (recent.length > 0) {
      add(
        'mensagens recentes',
        recent.map((m) => `${m.sender === 'user' ? 'Usuário' : 'Você'}: ${m.content}`).join('\n'),
      );
    }

    const memories = [...input.memories].sort((a, b) => b.importance - a.importance).slice(0, 6);
    if (memories.length > 0) {
      add(
        'memórias recuperadas',
        memories.map((m) => `[${m.type} / ${Math.round(m.importance * 100)}%] ${m.content}`).join('\n'),
      );
    }

    if (input.privateThoughts && input.privateThoughts.length > 0) {
      add(
        'pensamentos privados',
        input.privateThoughts.map((t) => t.content).join('\n'),
      );
    }

    if (input.time || input.worldState) {
      const t = input.time;
      const w = input.worldState;
      add(
        'tempo e contexto',
        [
          t ? `Agora: ${t.timeOfDay}, ${t.dayOfWeek} (${t.now})` : '',
          w ? `Atividade atual do agente: ${w.activity}; energia ${Math.round(w.energyLevel * 100)}%; estresse ${Math.round(w.stressLevel * 100)}%; foco ${Math.round(w.focusLevel * 100)}%` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }

    add('mensagem atual', input.currentMessage);

    return this.applyBudget(sections, maxTokens);
  }

  private applyBudget(sections: ContextSection[], maxTokens: number): ContextBundle {
    let used = 0;
    const kept: ContextSection[] = [];
    for (const section of sections) {
      if (used + section.tokens > maxTokens) break;
      kept.push(section);
      used += section.tokens;
    }
    return {
      sections: kept,
      totalTokens: used,
      fullText: kept.map((s) => `[${s.name}] ${s.content}`).join('\n\n'),
    };
  }
}
