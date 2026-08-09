import { AgentRuntime } from '@alterego/runtime';

async function main(): Promise<void> {
  const hasDatabase = Boolean(process.env.DATABASE_URL);
  const hasRedis = Boolean(process.env.REDIS_URL);
  const memoryMode = process.env.ALTEREGO_MEMORY_MODE === '1' || (!hasDatabase && !hasRedis);

  if (memoryMode) {
    process.env.DATABASE_URL ??= 'postgres://localhost:5432/alterego';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
  }

  const runtime = new AgentRuntime({
    memoryMode,
    agentId: process.env.ALTEREGO_AGENT_ID ?? 'agent-1',
  });

  await runtime.start();
  console.log(`alterego runtime started (agentId=${runtime['agentId']}, memoryMode=${memoryMode})`);

  const stop = async (signal: string): Promise<void> => {
    console.log(`received ${signal}, shutting down`);
    await runtime.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));
}

main().catch((error) => {
  console.error('alterego runtime failed to boot', error);
  process.exit(1);
});
