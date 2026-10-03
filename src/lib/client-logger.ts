/**
 * Lightweight structured logger for client-side ('use client') components.
 *
 * Mirrors pino's API surface (info/warn/error/debug) so call sites are
 * consistent with the server-side logger in src/lib/logger.ts.
 * In production builds, debug and info messages are suppressed.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const minLevel: number =
  process.env.NODE_ENV === 'production' ? LOG_LEVELS.warn : LOG_LEVELS.debug

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= minLevel
}

function safeLogValue(value: unknown): unknown {
  // Keep untrusted text within one record when consoles are captured as line logs.
  return typeof value === 'string' ? value.replace(/\n|\r/g, ' ') : value
}

function formatArgs(
  level: LogLevel,
  module: string,
  msgOrObj: unknown,
  ...rest: unknown[]
): unknown[] {
  const prefix = `[${level.toUpperCase()}] ${module.replace(/\n|\r/g, ' ')}:`
  return [prefix, safeLogValue(msgOrObj), ...rest.map(safeLogValue)]
}

export interface ClientLogger {
  debug(msg: string, ...args: unknown[]): void
  debug(obj: Record<string, unknown>, msg?: string): void
  info(msg: string, ...args: unknown[]): void
  info(obj: Record<string, unknown>, msg?: string): void
  warn(msg: string, ...args: unknown[]): void
  warn(obj: Record<string, unknown>, msg?: string): void
  error(msg: string, ...args: unknown[]): void
  error(obj: Record<string, unknown>, msg?: string): void
}

export function createClientLogger(module: string): ClientLogger {
  return {
    debug(msgOrObj: unknown, ...rest: unknown[]) {
      if (!shouldLog('debug')) return
      console.debug(...formatArgs('debug', module, msgOrObj, ...rest))
    },
    info(msgOrObj: unknown, ...rest: unknown[]) {
      if (!shouldLog('info')) return
      console.info(...formatArgs('info', module, msgOrObj, ...rest))
    },
    warn(msgOrObj: unknown, ...rest: unknown[]) {
      if (!shouldLog('warn')) return
      console.warn(...formatArgs('warn', module, msgOrObj, ...rest))
    },
    error(msgOrObj: unknown, ...rest: unknown[]) {
      if (!shouldLog('error')) return
      console.error(...formatArgs('error', module, msgOrObj, ...rest))
    },
  }
}
