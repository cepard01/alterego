import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from '@whatsapp-ai-agent/events';
import { ConfigService } from '@whatsapp-ai-agent/config';
import { DataService } from '@whatsapp-ai-agent/data';
import { LLMRouter } from '@whatsapp-ai-agent/llm';
import { MediaProcessor } from '../src/index.js';
import { MediaAnalysis, MediaAnalyzer } from '../src/media-processor.js';

function makeData(): DataService {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
    quiet: true,
  });
  return new DataService(config, undefined, { memoryMode: true });
}

function stubRouter(): LLMRouter {
  return {
    complete: vi.fn(async () => ({
      text: 'um gato na janela',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      provider: 'test',
      model: 'test-model',
      latencyMs: 1,
    })),
  } as unknown as LLMRouter;
}

describe('MediaProcessor', () => {
  it('analyzes media, persists it and emits MediaAnalyzed', async () => {
    const bus = new InMemoryEventBus();
    const data = makeData();
    const analyzer: MediaAnalyzer = {
      analyze: vi.fn(async (_kind, media): Promise<MediaAnalysis> => ({
        analysisSummary: `análise de ${media.id}`,
        transcript: media.type === 'audio' ? 'transcrição' : undefined,
      })),
    };
    const processor = new MediaProcessor({
      bus,
      data,
      llm: stubRouter(),
      analyzer,
    });

    const analyzed: string[] = [];
    bus.subscribe('MediaAnalyzed', (event) => analyzed.push(event.payload.analysisSummary));

    await processor.process('m1', 'media-1', 'image');
    const stored = await data.media.findById('media-1');

    expect(analyzed).toEqual(['análise de media-1']);
    expect(stored?.analysisSummary).toBe('análise de media-1');
  });

  it('transcribes audio into transcript field', async () => {
    const bus = new InMemoryEventBus();
    const data = makeData();
    const analyzer: MediaAnalyzer = {
      analyze: vi.fn(async (): Promise<MediaAnalysis> => ({
        analysisSummary: 'áudio: bora almoçar amanhã?',
        transcript: 'bora almoçar amanhã?',
      })),
    };
    const processor = new MediaProcessor({ bus, data, llm: stubRouter(), analyzer });

    const result = await processor.process('m2', 'media-2', 'audio');
    const stored = await data.media.findById('media-2');

    expect(result?.transcript).toBe('bora almoçar amanhã?');
    expect(stored?.transcript).toBe('bora almoçar amanhã?');
  });

  it('subscribes to MediaReceived and processes automatically', async () => {
    const bus = new InMemoryEventBus();
    const data = makeData();
    const analyze = vi.fn(async (): Promise<MediaAnalysis> => ({ analysisSummary: 'ok' }));
    const processor = new MediaProcessor({
      bus,
      data,
      llm: stubRouter(),
      analyzer: { analyze },
    });
    processor.start();

    bus.publish('MediaReceived', { messageId: 'm3', mediaId: 'media-3', type: 'image' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(analyze).toHaveBeenCalledWith('image', expect.objectContaining({ id: 'media-3' }));
    processor.stop();
  });

  it('tolerates analyzer failures without throwing', async () => {
    const bus = new InMemoryEventBus();
    const data = makeData();
    const processor = new MediaProcessor({
      bus,
      data,
      llm: stubRouter(),
      analyzer: {
        analyze: async () => {
          throw new Error('vision provider down');
        },
      },
    });

    const result = await processor.process('m4', 'media-4', 'image');
    expect(result).toBeNull();
  });
});
