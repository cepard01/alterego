// Working memory — exists only for the duration of processing a single
// message: parsed intent, pending media analysis, temp flags (v1 §5).
// Never persisted.

export interface WorkingMemoryEntry {
  key: string;
  value: unknown;
}

export class WorkingMemory {
  private readonly store = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  get<T = unknown>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  entries(): WorkingMemoryEntry[] {
    return [...this.store.entries()].map(([key, value]) => ({ key, value }));
  }

  clear(): void {
    this.store.clear();
  }
}
