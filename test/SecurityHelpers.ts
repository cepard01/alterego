import { InMemoryEventBus } from '@alterego/events';
import { ConfigService } from '@alterego/config';
import { DataService } from '@alterego/data';

export function createDataService(): DataService {
  const bus = new InMemoryEventBus();
  const config = new ConfigService(bus, {
    env: { DATABASE_URL: 'postgres://localhost:5432/test' },
    quiet: true,
  });
  return new DataService(config, undefined, { memoryMode: true });
}
