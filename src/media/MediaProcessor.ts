// Media Processor — async analysis of images/audio/video/documents/stickers.
// Subscribes to MediaReceived, resolves analysis via the LLM router
// (capability-routed), persists it and emits MediaAnalyzed (v1 §9).

import { MediaKind } from '@alterego/events';
import { EventBus } from '@alterego/events';
import { Logger } from '@alterego/observability';
import { DataService, Media } from '@alterego/data';
import { LLMRequest, LLMRouter } from '@alterego/llm';

export interface MediaAnalysis {
  analysisSummary: string;
  transcript?: string;
}

/**
 * Analyzer strategy per media kind. The default implementation routes to the
 * LLM with the right capability; tests can inject deterministic analyzers.
 */
export interface MediaAnalyzer {
  analyze(kind: MediaKind, media: Media): Promise<MediaAnalysis>;
}

export interface MediaProcessorOptions {
  bus: EventBus;
  data: DataService;
  llm: LLMRouter;
  logger?: Logger;
  analyzer?: MediaAnalyzer;
}

const CAPABILITY_BY_KIND: Record<MediaKind, 'vision' | 'audio' | 'long-context' | 'text'> = {
  image: 'vision',
  video: 'vision',
  audio: 'audio',
  document: 'long-context',
  sticker: 'vision',
};

const PROMPT_BY_KIND: Record<MediaKind, string> = {
  image: 'Descreva esta imagem em uma ou duas frases, como se estivesse contando a um amigo o que você vê.',
  video: 'Resuma o conteúdo visual deste vídeo em uma ou duas frases.',
  audio: 'Transcreva esta mensagem de voz. Responda somente com a transcrição.',
  document: 'Extraia e resuma o conteúdo deste documento em poucas frases.',
  sticker: 'Descreva o significado deste sticker (emoji/figurinha) em uma frase curta.',
};

export class LlmMediaAnalyzer implements MediaAnalyzer {
  constructor(private readonly llm: LLMRouter) {}

  async analyze(kind: MediaKind, media: Media): Promise<MediaAnalysis> {
    const capability = CAPABILITY_BY_KIND[kind];
    const request: LLMRequest = {
      messages: [{ role: 'user', content: PROMPT_BY_KIND[kind] }],
      capabilityRequirements: [capability],
      maxTokens: 300,
      temperature: 0.4,
    };
    const response = await this.llm.complete(request);
    if (kind === 'audio') {
      return { analysisSummary: `áudio: ${response.text.slice(0, 200)}`, transcript: response.text };
    }
    return { analysisSummary: response.text.slice(0, 500) };
  }
}

export class MediaProcessor {
  private readonly bus: EventBus;
  private readonly data: DataService;
  private readonly logger?: Logger;
  private readonly analyzer: MediaAnalyzer;
  private detach: Array<() => void> = [];

  constructor(options: MediaProcessorOptions) {
    this.bus = options.bus;
    this.data = options.data;
    this.logger = options.logger;
    this.analyzer = options.analyzer ?? new LlmMediaAnalyzer(options.llm);
  }

  start(): void {
    this.detach.push(
      this.bus.subscribe('MediaReceived', (event) => {
        void this.process(event.payload.messageId, event.payload.mediaId, event.payload.type);
      }),
    );
  }

  stop(): void {
    this.detach.forEach((detach) => detach());
    this.detach = [];
  }

  /** Process a single media item; always resolves (errors are logged, not thrown). */
  async process(messageId: string, mediaId: string, kind: MediaKind): Promise<MediaAnalysis | null> {
    try {
      const existing = await this.data.media.findById(mediaId);
      const media: Media = existing ?? {
        id: mediaId,
        messageId,
        type: kind,
        storageUrl: '',
        mimeType: '',
        caption: null,
        transcript: null,
        analysisSummary: null,
        sizeBytes: 0,
      };
      const analysis = await this.analyzer.analyze(kind, media);
      if (existing) {
        await this.data.media.setAnalysis(mediaId, analysis.analysisSummary, analysis.transcript);
      } else {
        await this.data.media.create({
          id: media.id,
          messageId: media.messageId,
          type: media.type,
          storageUrl: media.storageUrl,
          mimeType: media.mimeType,
          caption: media.caption,
          analysisSummary: analysis.analysisSummary,
          transcript: analysis.transcript ?? null,
          sizeBytes: media.sizeBytes,
        });
      }
      this.bus.publish('MediaAnalyzed', {
        mediaId,
        analysisSummary: analysis.analysisSummary,
        transcript: analysis.transcript,
      });
      this.logger?.debug('media analyzed', { mediaId, kind, summaryLength: analysis.analysisSummary.length });
      return analysis;
    } catch (error) {
      this.logger?.warn('media analysis failed', { mediaId, kind, error: String(error) });
      return null;
    }
  }
}
