export class DatabaseSync {
  constructor(_filename: string) {}
  exec(_sql: string): void {}
  function(_name: string, _fn: (...args: unknown[]) => unknown): void {}
  prepare(_sql: string) {
    return {
      all(..._args: unknown[]): unknown[] {
        return [];
      },
      get(..._args: unknown[]): unknown {
        return undefined;
      },
      run(..._args: unknown[]): { changes: number } {
        return { changes: 0 };
      },
    };
  }
  close(): void {}
}
