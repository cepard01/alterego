import { InMemoryEventBus } from '@whatsapp-ai-agent/events';
import { ConfigService } from '@whatsapp-ai-agent/config';
import { DataService } from '@whatsapp-ai-agent/data';

export function createDataService(): DataService {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test', REDIS_URL: 'redis://localhost:6379' },
    quiet: true,
  });
  return new DataService(config, undefined, { memoryMode: true });
}
