// Structured JSON logger with correlation ids threaded through the message
// lifecycle (v1 §16). One line per event, machine-parseable, PII-free by
// convention (redact anything sensitive before calling).

import { LogLevel } from '@alterego/config';

export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger with the given fields permanently merged in. */
  child(fields: LogFields): Logger;
  withCorrelationId(correlationId: string): Logger;
}

export type LogSink = (line: string) => void;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LoggerOptions {
  level: LogLevel;
  /** Per-module verbosity override: module name -> minimum level. */
  perModule?: Record<string, LogLevel>;
  /** Output sink; defaults to JSON.stringify + console.log. */
  sink?: LogSink;
}

export class JsonLogger implements Logger {
  private readonly level: LogLevel;
  private readonly perModule: Record<string, LogLevel>;
  private readonly sink: LogSink;
  private readonly base: LogFields;
  private readonly module: string | undefined;

  constructor(options: LoggerOptions, base: LogFields = {}, module?: string) {
    this.level = options.level;
    this.perModule = options.perModule ?? {};
    this.sink = options.sink ?? ((line) => console.log(line));
    this.base = base;
    this.module = module;
  }

  debug(message: string, fields?: LogFields): void {
    this.write('debug', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.write('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.write('warn', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.write('error', message, fields);
  }

  child(fields: LogFields): Logger {
    const module = typeof fields.module === 'string' ? fields.module : this.module;
    return new JsonLogger(
      { level: this.level, perModule: this.perModule, sink: this.sink },
      { ...this.base, ...fields },
      module,
    );
  }

  withCorrelationId(correlationId: string): Logger {
    return this.child({ correlationId });
  }

  private write(level: LogLevel, message: string, fields?: LogFields): void {
    const effective = this.module && this.perModule[this.module] ? this.perModule[this.module] : this.level;
    if (LEVEL_ORDER[level] < LEVEL_ORDER[effective]) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      message,
      ...this.base,
      ...(fields ?? {}),
      ...(this.module ? { module: this.module } : {}),
    };
    this.sink(JSON.stringify(record));
  }
}

/** Collects log lines in memory — used by tests and the admin panel. */
export function createMemorySink(): { sink: LogSink; lines: () => Array<Record<string, unknown>> } {
  const stored: string[] = [];
  return {
    sink: (line) => stored.push(line),
    lines: () => stored.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}
