// ThoughtGenerator — async background reasoning after each turn (v2 §3).
// Never on the response-critical path; results are private to the agent and
// never directly quoted in outbound text.

import type { EventBus } from '@alterego/events';
import type { Thought } from '@alterego/data';
import { GeneratedThought, LlmCompleter, ThoughtGeneratorOptions, TurnTranscriptInput } from './Types.js';

interface ThoughtRepo {
  create(thought: Omit<Thought, 'id' | 'createdAt' | 'verifiedAt' | 'verificationResult' | 'lastConfidenceDecayAt'> & { id?: string; createdAt?: string }): Promise<Thought>;
}

const SYSTEM_PROMPT = `Você é o pensamento interior de uma pessoa simulada. Reflita sobre a troca de mensagens abaixo e produza até 3 pensamentos privados, em português.
Categorias:
- thought: raciocínio próprio ("acho que ele está evitando o assunto")
- interpretation: leitura subjetiva de um fato ("isso provavelmente significa que está estressado com o trabalho")
- prediction: previsão com prazo ("ele vai voltar a falar disso no fim de semana")
Regras:
- Nunca repita fatos do histórico; reflita sobre eles.
- Predictions devem ter horizonte curto e verificável.
- Cada item: {"category": "thought|interpretation|prediction", "content": "...", "confidence": 0-1, "relatedMessageIds": []}
Responda apenas JSON: {"thoughts": [...]}`;

const FALLBACK_THOUGHTS = (input: TurnTranscriptInput): GeneratedThought[] => {
  const userMessage = [...input.transcript].reverse().find((m) => m.role === 'user');
  if (!userMessage) return [];
  const words = userMessage.content.split(/\s+/).filter(Boolean);
  // Repetition-aware prediction: long user messages often get followed up.
  if (words.length > 30 && Math.random() < 0.4) {
    return [
      {
        category: 'prediction',
        content: 'Eles devem voltar a falar sobre isso em breve.',
        confidence: 0.35,
        relatedMemoryIds: [],
        relatedMessageId: userMessage.messageId,
      },
    ];
  }
  return [
    {
      category: 'thought',
      content: 'Eles parecem engajados na conversa.',
      confidence: 0.5,
      relatedMemoryIds: [],
      relatedMessageId: userMessage.messageId,
    },
  ];
};

export class ThoughtGenerator {
  constructor(
    private readonly bus: EventBus,
    private readonly repo: ThoughtRepo,
    private readonly llm: LlmCompleter,
    private readonly options: ThoughtGeneratorOptions = {},
  ) {}

  /** Runs after a turn; failure is swallowed — thoughts are best-effort (v2 §3). */
  async generateAfterTurn(input: TurnTranscriptInput): Promise<Thought[]> {
    if (Math.random() > (this.options.generationChance ?? 0.6)) return [];

    const generated = await this.tryLlm(input).catch(() => undefined) ?? FALLBACK_THOUGHTS(input);
    const written: Thought[] = [];
    for (const thought of generated.slice(0, 3)) {
      const created = await this.repo.create({
        userId: input.userId,
        category: thought.category,
        content: thought.content,
        confidence: thought.confidence,
        relatedMemoryIds: thought.relatedMemoryIds,
        relatedMessageId: thought.relatedMessageId,
        source: 'agent_generated',
        verificationStatus: 'unverified',
      });
      written.push(created);
      this.bus.publish('ThoughtCreated', {
        thoughtId: created.id,
        userId: input.userId,
        category: created.category,
        confidence: created.confidence,
      });
    }
    return written;
  }

  private async tryLlm(input: TurnTranscriptInput): Promise<GeneratedThought[] | undefined> {
    const transcriptText = input.transcript
      .map((m) => `${m.role === 'user' ? 'Pessoa' : 'Eu'}: ${m.content}`)
      .join('\n');
    const response = await this.llm.complete({
      userId: input.userId,
      conversationId: input.conversationId,
      capabilities: this.options.capability ? [this.options.capability] : undefined,
      system: SYSTEM_PROMPT,
      prompt: transcriptText,
      temperature: 0.7,
      maxTokens: 500,
      format: 'json',
    });
    const parsed = JSON.parse(response.content) as { thoughts?: Array<Partial<GeneratedThought>> };
    if (!Array.isArray(parsed.thoughts)) return undefined;
    return parsed.thoughts
      .filter((t): t is GeneratedThought => Boolean(t && typeof t.content === 'string' && (t.category === 'thought' || t.category === 'interpretation' || t.category === 'prediction')))
      .map((t) => ({
        category: t.category,
        content: t.content,
        confidence: Math.min(1, Math.max(0, Number(t.confidence) || 0.5)),
        relatedMemoryIds: Array.isArray(t.relatedMemoryIds) ? t.relatedMemoryIds : [],
        relatedMessageId: typeof t.relatedMessageId === 'string' ? t.relatedMessageId : undefined,
      }));
  }
}

